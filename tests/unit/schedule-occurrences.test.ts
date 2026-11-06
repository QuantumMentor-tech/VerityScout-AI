import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ScheduleOccurrenceRepository,
  CreateOccurrenceInput,
} from '@/server/persistence/repositories/schedule-occurrence.repository';
import { OccurrenceStatus } from '@/server/persistence/types';
import * as baseRepoModule from '@/server/persistence/repositories/base.repository';

describe('Durable Schedule Occurrences Ledger (Step 47)', () => {
  let occurrenceRepo: ScheduleOccurrenceRepository;
  const mockScheduleId = '11111111-1111-4111-a111-111111111111';
  const mockUserId = '22222222-2222-4222-a222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
    occurrenceRepo = new ScheduleOccurrenceRepository();
  });

  describe('1. Stable Occurrence Identity & Idempotency Key', () => {
    it('OCC-001: Generates deterministic idempotency key from schedule ID and scheduled instant', () => {
      const scheduledAt = new Date('2026-06-15T09:00:00.000Z');
      const key1 = ScheduleOccurrenceRepository.generateIdempotencyKey(mockScheduleId, scheduledAt);
      const key2 = ScheduleOccurrenceRepository.generateIdempotencyKey(mockScheduleId, scheduledAt);

      expect(key1).toBe(key2);
      expect(key1).toBe(`occ_${mockScheduleId}_2026-06-15T09:00:00.000Z`);
    });

    it('OCC-002: Distinct scheduled instants produce distinct idempotency keys', () => {
      const time1 = new Date('2026-06-15T09:00:00.000Z');
      const time2 = new Date('2026-06-16T09:00:00.000Z');

      const key1 = ScheduleOccurrenceRepository.generateIdempotencyKey(mockScheduleId, time1);
      const key2 = ScheduleOccurrenceRepository.generateIdempotencyKey(mockScheduleId, time2);

      expect(key1).not.toBe(key2);
    });

    it('OCC-003: Different schedules with the same instant produce distinct keys', () => {
      const otherScheduleId = '33333333-3333-4333-a333-333333333333';
      const scheduledAt = new Date('2026-06-15T09:00:00.000Z');

      const key1 = ScheduleOccurrenceRepository.generateIdempotencyKey(mockScheduleId, scheduledAt);
      const key2 = ScheduleOccurrenceRepository.generateIdempotencyKey(otherScheduleId, scheduledAt);

      expect(key1).not.toBe(key2);
    });
  });

  describe('2. Idempotent Occurrence Creation and Retrieval', () => {
    it('OCC-004: Returns existing occurrence row on conflict (schedule_id, scheduled_at)', async () => {
      const scheduledAt = new Date('2026-06-15T09:00:00.000Z');
      const existingOccurrence = {
        id: 'occ-existing-id',
        schedule_id: mockScheduleId,
        user_id: mockUserId,
        schedule_revision: 1,
        idempotency_key: `occ_${mockScheduleId}_2026-06-15T09:00:00.000Z`,
        scheduled_at: scheduledAt.toISOString(),
        status: OccurrenceStatus.PLANNED,
        queue_job_id: null,
        research_run_id: null,
        dispatched_at: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        recovery_metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: [existingOccurrence],
        rowCount: 1,
      } as any);

      const input: CreateOccurrenceInput = {
        schedule_id: mockScheduleId,
        user_id: mockUserId,
        schedule_revision: 1,
        scheduled_at: scheduledAt,
      };

      const result = await occurrenceRepo.createOrGet(input);
      expect(result.id).toBe('occ-existing-id');
      expect(result.status).toBe(OccurrenceStatus.PLANNED);
      expect(baseRepoModule.executeQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/ON CONFLICT \(schedule_id, scheduled_at\)/),
        expect.arrayContaining([mockScheduleId, mockUserId, 1])
      );
    });
  });

  describe('3. Occurrence State Machine & Status Updates', () => {
    it('OCC-005: Updates occurrence to DISPATCHED with run and job references', async () => {
      const occurrenceId = 'occ-test-123';
      const mockRunId = 'run-test-456';
      const mockJobId = 'job-test-789';
      const now = new Date();

      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: [
          {
            id: occurrenceId,
            schedule_id: mockScheduleId,
            user_id: mockUserId,
            status: OccurrenceStatus.DISPATCHED,
            research_run_id: mockRunId,
            queue_job_id: mockJobId,
            dispatched_at: now.toISOString(),
          } as any,
        ],
        rowCount: 1,
      } as any);

      const updated = await occurrenceRepo.updateStatus(occurrenceId, OccurrenceStatus.DISPATCHED, {
        research_run_id: mockRunId,
        queue_job_id: mockJobId,
        dispatched_at: now,
      });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe(OccurrenceStatus.DISPATCHED);
      expect(updated?.research_run_id).toBe(mockRunId);
      expect(updated?.queue_job_id).toBe(mockJobId);
    });

    it('OCC-006: Marks pending (PLANNED) occurrences as SKIPPED for a schedule', async () => {
      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: [{ id: 'occ-1' }, { id: 'occ-2' }],
        rowCount: 2,
      } as any);

      const skippedCount = await occurrenceRepo.markPendingAsSkippedForSchedule(
        mockScheduleId,
        'Superseded by schedule revision 2'
      );

      expect(skippedCount).toBe(2);
      expect(baseRepoModule.executeQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/UPDATE schedule_occurrences\s+SET status = 'SKIPPED'/),
        [mockScheduleId, 'Superseded by schedule revision 2']
      );
    });
  });
});

