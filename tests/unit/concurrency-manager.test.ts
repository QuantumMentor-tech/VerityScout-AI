import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InMemoryConcurrencyManager,
  PostgresConcurrencyManager,
  ConcurrencyLimitExceededError,
} from '@/server/usage/concurrency.manager';
import { ConcurrencySlotRepository } from '@/server/persistence/repositories/concurrency-slot.repository';

describe('Concurrency Management', () => {
  describe('InMemoryConcurrencyManager', () => {
    let manager: InMemoryConcurrencyManager;

    beforeEach(() => {
      manager = new InMemoryConcurrencyManager();
    });

    it('CONC-001: Acquires slots up to the limit', async () => {
      const res1 = await manager.acquireSlot('provider:openai', 2, 'worker-1', 5000);
      const res2 = await manager.acquireSlot('provider:openai', 2, 'worker-2', 5000);

      expect(res1.acquired).toBe(true);
      expect(res2.acquired).toBe(true);
      expect(res1.slotNumber).toBe(1);
      expect(res2.slotNumber).toBe(2);
    });

    it('CONC-002: Rejects acquisition when maxSlots limit is reached', async () => {
      const res1 = await manager.acquireSlot('provider:openai', 1, 'worker-1', 5000);
      expect(res1.acquired).toBe(true);

      const res2 = await manager.acquireSlot('provider:openai', 1, 'worker-2', 5000);
      expect(res2.acquired).toBe(false);
      expect(res2.reason).toContain('Concurrency limit of 1 reached');
    });

    it('CONC-003: Allows new acquisition after releasing a slot', async () => {
      const res1 = await manager.acquireSlot('provider:openai', 1, 'worker-1', 5000);
      expect(res1.acquired).toBe(true);

      const released = await manager.releaseSlot('provider:openai', 'worker-1');
      expect(released).toBe(true);

      const res2 = await manager.acquireSlot('provider:openai', 1, 'worker-2', 5000);
      expect(res2.acquired).toBe(true);
      expect(res2.slotNumber).toBe(1);
    });

    it('CONC-004: Automatically evicts expired leases', async () => {
      const res1 = await manager.acquireSlot('provider:openai', 1, 'worker-1', 20); // 20ms TTL
      expect(res1.acquired).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 35));

      const res2 = await manager.acquireSlot('provider:openai', 1, 'worker-2', 5000);
      expect(res2.acquired).toBe(true);
    });

    it('CONC-005: Different scopes are completely isolated', async () => {
      const resOpenAi = await manager.acquireSlot('provider:openai', 1, 'worker-1', 5000);
      const resNim = await manager.acquireSlot('provider:nim', 1, 'worker-1', 5000);

      expect(resOpenAi.acquired).toBe(true);
      expect(resNim.acquired).toBe(true);
    });

    it('CONC-006: executeWithConcurrency executes action and releases slot on success', async () => {
      let executed = false;

      const result = await manager.executeWithConcurrency(
        'provider:openai',
        1,
        'holder-1',
        async () => {
          executed = true;
          return 'done';
        }
      );

      expect(result).toBe('done');
      expect(executed).toBe(true);

      // Slot should be immediately available again
      const nextAcquisition = await manager.acquireSlot('provider:openai', 1, 'holder-2', 5000);
      expect(nextAcquisition.acquired).toBe(true);
    });

    it('CONC-007: executeWithConcurrency releases slot even when action throws', async () => {
      await expect(
        manager.executeWithConcurrency(
          'provider:openai',
          1,
          'holder-fail',
          async () => {
            throw new Error('LLM call failed');
          }
        )
      ).rejects.toThrow('LLM call failed');

      // Slot should be freed in finally block
      const nextAcquisition = await manager.acquireSlot('provider:openai', 1, 'holder-retry', 5000);
      expect(nextAcquisition.acquired).toBe(true);
    });

    it('CONC-008: executeWithConcurrency throws ConcurrencyLimitExceededError if slot cannot be acquired in time', async () => {
      // Saturate slot
      await manager.acquireSlot('provider:openai', 1, 'worker-blocking', 10000);

      await expect(
        manager.executeWithConcurrency(
          'provider:openai',
          1,
          'worker-waiting',
          async () => 'should not run',
          { acquisitionTimeoutMs: 50 }
        )
      ).rejects.toThrow(ConcurrencyLimitExceededError);
    });
  });

  describe('PostgresConcurrencyManager', () => {
    let mockRepo: ConcurrencySlotRepository;
    let pgManager: PostgresConcurrencyManager;

    beforeEach(() => {
      mockRepo = {
        acquireSlot: vi.fn(),
        releaseSlot: vi.fn(),
        getActiveCount: vi.fn(),
      } as unknown as ConcurrencySlotRepository;
      pgManager = new PostgresConcurrencyManager(mockRepo);
    });

    it('CONC-009: Delegates acquire to ConcurrencySlotRepository', async () => {
      (mockRepo.acquireSlot as any).mockResolvedValueOnce({
        acquired: true,
        scopeKey: 'global',
        slotNumber: 1,
        holderId: 'worker-1',
      });

      const res = await pgManager.acquireSlot('global', 5, 'worker-1', 5000);

      expect(res.acquired).toBe(true);
      expect(mockRepo.acquireSlot).toHaveBeenCalledWith('global', 5, 'worker-1', 5000);
    });

    it('CONC-010: Delegates release to ConcurrencySlotRepository', async () => {
      (mockRepo.releaseSlot as any).mockResolvedValueOnce(true);

      const released = await pgManager.releaseSlot('global', 'worker-1');
      expect(released).toBe(true);
      expect(mockRepo.releaseSlot).toHaveBeenCalledWith('global', 'worker-1');
    });
  });
});
