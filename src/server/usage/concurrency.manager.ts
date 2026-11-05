import 'server-only';
import {
  ConcurrencySlotRepository,
  SlotAcquisitionResult,
} from '@/server/persistence/repositories/concurrency-slot.repository';
import { AppError } from '@/lib/errors/app-error';
import { logger } from '@/lib/logging/logger';

export class ConcurrencyLimitExceededError extends AppError {
  constructor(scopeKey: string, maxSlots: number) {
    super({
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Active concurrency limit of ${maxSlots} reached for scope "${scopeKey}"`,
      publicMessage: 'Service is currently operating at maximum concurrent capacity. Please retry shortly.',
      statusCode: 429,
      isOperational: true,
    });
    this.name = 'ConcurrencyLimitExceededError';
  }
}

export interface IConcurrencyManager {
  acquireSlot(
    scopeKey: string,
    maxSlots: number,
    holderId: string,
    leaseDurationMs?: number | undefined
  ): Promise<SlotAcquisitionResult>;

  releaseSlot(scopeKey: string, holderId: string): Promise<boolean>;

  getActiveCount(scopeKey: string): Promise<number>;

  executeWithConcurrency<T>(
    scopeKey: string,
    maxSlots: number,
    holderId: string,
    action: () => Promise<T>,
    options?: {
      leaseDurationMs?: number | undefined;
      acquisitionTimeoutMs?: number | undefined;
      signal?: AbortSignal | undefined;
    } | undefined
  ): Promise<T>;
}

export class PostgresConcurrencyManager implements IConcurrencyManager {
  private readonly repo: ConcurrencySlotRepository;

  constructor(repo?: ConcurrencySlotRepository) {
    this.repo = repo ?? new ConcurrencySlotRepository();
  }

  async acquireSlot(
    scopeKey: string,
    maxSlots: number,
    holderId: string,
    leaseDurationMs: number = 30000
  ): Promise<SlotAcquisitionResult> {
    return this.repo.acquireSlot(scopeKey, maxSlots, holderId, leaseDurationMs);
  }

  async releaseSlot(scopeKey: string, holderId: string): Promise<boolean> {
    return this.repo.releaseSlot(scopeKey, holderId);
  }

  async getActiveCount(scopeKey: string): Promise<number> {
    return this.repo.getActiveCount(scopeKey);
  }

  async executeWithConcurrency<T>(
    scopeKey: string,
    maxSlots: number,
    holderId: string,
    action: () => Promise<T>,
    options?: {
      leaseDurationMs?: number | undefined;
      acquisitionTimeoutMs?: number | undefined;
      signal?: AbortSignal | undefined;
    } | undefined
  ): Promise<T> {
    const startTime = Date.now();
    const timeoutMs = options?.acquisitionTimeoutMs ?? 5000;
    const leaseDuration = options?.leaseDurationMs ?? 30000;

    let acquired = false;
    let slotResult: SlotAcquisitionResult | null = null;

    while (Date.now() - startTime <= timeoutMs) {
      if (options?.signal?.aborted) {
        throw new Error(`Concurrency slot acquisition aborted for scope "${scopeKey}"`);
      }

      slotResult = await this.acquireSlot(scopeKey, maxSlots, holderId, leaseDuration);
      if (slotResult.acquired) {
        acquired = true;
        break;
      }

      // Wait 100ms before retrying slot acquisition
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!acquired) {
      logger.warn('CONCURRENCY_SATURATION_EXCEEDED', 'Failed to acquire slot within timeout', {
        scopeKey,
        maxSlots,
        holderId,
        timeoutMs,
      });
      throw new ConcurrencyLimitExceededError(scopeKey, maxSlots);
    }

    logger.debug('CONCURRENCY_SLOT_ACQUIRED', 'Acquired concurrency slot', {
      scopeKey,
      holderId,
      slotNumber: slotResult?.slotNumber,
    });

    try {
      return await action();
    } finally {
      try {
        await this.releaseSlot(scopeKey, holderId);
        logger.debug('CONCURRENCY_SLOT_RELEASED', 'Released concurrency slot', {
          scopeKey,
          holderId,
        });
      } catch (releaseErr) {
        logger.warn('CONCURRENCY_RELEASE_ERROR', 'Failed to release concurrency slot', {
          scopeKey,
          holderId,
          error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
        });
      }
    }
  }
}

export class InMemoryConcurrencyManager implements IConcurrencyManager {
  private readonly activeSlots = new Map<string, Map<string, { slotNumber: number; expiresAt: number }>>();

  async acquireSlot(
    scopeKey: string,
    maxSlots: number,
    holderId: string,
    leaseDurationMs: number = 30000
  ): Promise<SlotAcquisitionResult> {
    const now = Date.now();
    let scopeMap = this.activeSlots.get(scopeKey);
    if (!scopeMap) {
      scopeMap = new Map();
      this.activeSlots.set(scopeKey, scopeMap);
    }

    // Clean expired
    for (const [id, slot] of scopeMap.entries()) {
      if (slot.expiresAt < now) {
        scopeMap.delete(id);
      }
    }

    // Check if holder already has slot
    const existing = scopeMap.get(holderId);
    if (existing && existing.expiresAt >= now) {
      existing.expiresAt = now + leaseDurationMs;
      return {
        acquired: true,
        scopeKey,
        slotNumber: existing.slotNumber,
        holderId,
        leaseExpiresAt: new Date(existing.expiresAt).toISOString(),
      };
    }

    if (scopeMap.size >= maxSlots) {
      return {
        acquired: false,
        scopeKey,
        holderId,
        reason: `Concurrency limit of ${maxSlots} reached for scope "${scopeKey}"`,
      };
    }

    // Allocate lowest slot number
    const occupiedNumbers = new Set(Array.from(scopeMap.values()).map((s) => s.slotNumber));
    let slotNumber = 1;
    while (occupiedNumbers.has(slotNumber) && slotNumber <= maxSlots) {
      slotNumber++;
    }

    const expiresAt = now + leaseDurationMs;
    scopeMap.set(holderId, { slotNumber, expiresAt });

    return {
      acquired: true,
      scopeKey,
      slotNumber,
      holderId,
      leaseExpiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async releaseSlot(scopeKey: string, holderId: string): Promise<boolean> {
    const scopeMap = this.activeSlots.get(scopeKey);
    if (!scopeMap) return false;
    return scopeMap.delete(holderId);
  }

  async getActiveCount(scopeKey: string): Promise<number> {
    const now = Date.now();
    const scopeMap = this.activeSlots.get(scopeKey);
    if (!scopeMap) return 0;

    let count = 0;
    for (const slot of scopeMap.values()) {
      if (slot.expiresAt >= now) count++;
    }
    return count;
  }

  async executeWithConcurrency<T>(
    scopeKey: string,
    maxSlots: number,
    holderId: string,
    action: () => Promise<T>,
    options?: {
      leaseDurationMs?: number | undefined;
      acquisitionTimeoutMs?: number | undefined;
      signal?: AbortSignal | undefined;
    } | undefined
  ): Promise<T> {
    const startTime = Date.now();
    const timeoutMs = options?.acquisitionTimeoutMs ?? 5000;
    const leaseDuration = options?.leaseDurationMs ?? 30000;

    let acquired = false;
    let slotResult: SlotAcquisitionResult | null = null;

    while (Date.now() - startTime <= timeoutMs) {
      if (options?.signal?.aborted) {
        throw new Error(`Concurrency slot acquisition aborted for scope "${scopeKey}"`);
      }

      slotResult = await this.acquireSlot(scopeKey, maxSlots, holderId, leaseDuration);
      if (slotResult.acquired) {
        acquired = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!acquired) {
      throw new ConcurrencyLimitExceededError(scopeKey, maxSlots);
    }

    try {
      return await action();
    } finally {
      await this.releaseSlot(scopeKey, holderId);
    }
  }

  clear(): void {
    this.activeSlots.clear();
  }
}

let activeConcurrencyManager: IConcurrencyManager | null = null;

export function getConcurrencyManager(): IConcurrencyManager {
  if (!activeConcurrencyManager) {
    if (process.env.NODE_ENV === 'test') {
      activeConcurrencyManager = new InMemoryConcurrencyManager();
    } else {
      activeConcurrencyManager = new PostgresConcurrencyManager();
    }
  }
  return activeConcurrencyManager;
}

export function setConcurrencyManager(manager: IConcurrencyManager | null): void {
  activeConcurrencyManager = manager;
}
