import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classifyError,
  calculateRetryDelay,
  shouldRetry,
  CancellationRequestedError,
} from '@/server/research/retry';
import { ResearchWorker } from '@/server/worker/research-worker';
import { ResearchRecoveryService } from '@/server/worker/research-recovery.service';
import { InMemoryJobQueueAdapter } from '@/server/queue/in-memory-job-queue';
import { RunStatus, RunStage } from '@/server/persistence/types';
import type { ResearchJobPayload } from '@/server/queue/queue.types';

describe('Retries, Backoff, and Worker Lease Recovery', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockRunId = '22222222-2222-4222-a222-222222222222';
  const mockTaskId = '33333333-3333-4333-a333-333333333333';

  let queue: InMemoryJobQueueAdapter;

  const samplePayload: ResearchJobPayload = {
    runId: mockRunId,
    taskId: mockTaskId,
    userId: mockUserId,
    query: 'Find ThinkPad T14 AMD with 32GB RAM under $700',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    queue = new InMemoryJobQueueAdapter();
  });

  describe('Error Classification', () => {
    it('RETRY-001: Classifies transient upstream network and rate-limit errors as TRANSIENT', () => {
      const rateLimitErr = Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 });
      const c1 = classifyError(rateLimitErr);
      expect(c1.category).toBe('TRANSIENT');
      expect(c1.isRetryable).toBe(true);

      const networkErr = new Error('fetch failed: ECONNRESET');
      const c2 = classifyError(networkErr);
      expect(c2.category).toBe('TRANSIENT');
      expect(c2.isRetryable).toBe(true);

      const gatewayErr = Object.assign(new Error('Bad Gateway'), { statusCode: 502 });
      const c3 = classifyError(gatewayErr);
      expect(c3.category).toBe('TRANSIENT');
      expect(c3.isRetryable).toBe(true);
    });

    it('RETRY-002: Classifies client errors and invalid configuration as PERMANENT', () => {
      const authErr = Object.assign(new Error('Unauthorized provider key'), { statusCode: 401 });
      const c1 = classifyError(authErr);
      expect(c1.category).toBe('PERMANENT');
      expect(c1.isRetryable).toBe(false);

      const badReq = new Error('Validation error: invalid query parameter');
      const c2 = classifyError(badReq);
      expect(c2.category).toBe('PERMANENT');
      expect(c2.isRetryable).toBe(false);
    });

    it('RETRY-003: Classifies user cancellation errors as CANCELLED', () => {
      const cancelErr = new CancellationRequestedError();
      const c1 = classifyError(cancelErr);
      expect(c1.category).toBe('CANCELLED');
      expect(c1.isRetryable).toBe(false);

      const cancelMsg = new Error('Execution was cancelled by user request');
      const c2 = classifyError(cancelMsg);
      expect(c2.category).toBe('CANCELLED');
      expect(c2.isRetryable).toBe(false);
    });
  });

  describe('Retry Policy & Exponential Backoff Delay', () => {
    it('RETRY-004: Computes exponential delays with jitter and caps at maxDelay', () => {
      const d1 = calculateRetryDelay(1, undefined, { baseDelayMs: 1000, jitterMs: 0 });
      expect(d1).toBe(1000); // 1000 * 2^0

      const d2 = calculateRetryDelay(2, undefined, { baseDelayMs: 1000, jitterMs: 0 });
      expect(d2).toBe(2000); // 1000 * 2^1

      const d3 = calculateRetryDelay(3, undefined, { baseDelayMs: 1000, jitterMs: 0 });
      expect(d3).toBe(4000); // 1000 * 2^2

      const dCapped = calculateRetryDelay(10, undefined, { baseDelayMs: 1000, maxDelayMs: 15000, jitterMs: 0 });
      expect(dCapped).toBe(15000);
    });

    it('RETRY-005: Respects Retry-After header duration when supplied', () => {
      const delay = calculateRetryDelay(1, 12, { maxDelayMs: 30000 });
      expect(delay).toBe(12000);
    });

    it('RETRY-006: shouldRetry honors maximum attempts and transient category', () => {
      expect(shouldRetry(1, 3, 'TRANSIENT')).toBe(true);
      expect(shouldRetry(2, 3, 'TRANSIENT')).toBe(true);
      expect(shouldRetry(3, 3, 'TRANSIENT')).toBe(false); // max reached
      expect(shouldRetry(1, 3, 'PERMANENT')).toBe(false);
      expect(shouldRetry(1, 3, 'CANCELLED')).toBe(false);
    });
  });

  describe('Worker Retry Handling', () => {
    it('RETRY-007: Reschedules job with backoff and records RETRY_SCHEDULED progress event on transient error', async () => {
      const mockOrchestrator = {
        execute: vi.fn().mockResolvedValue({
          runId: mockRunId,
          success: false,
          durationMs: 500,
          totalSourcesScanned: 0,
          totalCandidatesFound: 0,
          totalClaimsExtracted: 0,
          error: 'Transient upstream rate limit 429',
        }),
      };

      const recordedEvents: any[] = [];
      const mockProgressRepo = {
        create: vi.fn().mockImplementation(async (input) => {
          recordedEvents.push(input);
          return { id: 'ev-1', ...input };
        }),
      };

      await queue.enqueue(samplePayload, { maxAttempts: 3 });

      const worker = new ResearchWorker({
        queue,
        orchestrator: mockOrchestrator as any,
        progressRepo: mockProgressRepo as any,
      });

      const didWork = await worker.runOnce();
      expect(didWork).toBe(true);

      const metrics = await queue.getMetrics();
      // Job was rescheduled back to QUEUED
      expect(metrics.queued).toBe(1);
      expect(metrics.failed).toBe(0);

      // Verify RETRY_SCHEDULED event
      const retryEvent = recordedEvents.find((e) => e.event_type === 'RETRY_SCHEDULED');
      expect(retryEvent).toBeDefined();
      expect(retryEvent.metadata.attempt).toBe(1);
      expect(retryEvent.metadata.maxAttempts).toBe(3);
    });

    it('RETRY-008: Fails job permanently without retry when error is non-transient', async () => {
      const mockOrchestrator = {
        execute: vi.fn().mockResolvedValue({
          runId: mockRunId,
          success: false,
          durationMs: 500,
          totalSourcesScanned: 0,
          totalCandidatesFound: 0,
          totalClaimsExtracted: 0,
          error: 'Validation error: invalid request model',
        }),
      };

      await queue.enqueue(samplePayload, { maxAttempts: 3 });

      const worker = new ResearchWorker({
        queue,
        orchestrator: mockOrchestrator as any,
      });

      const didWork = await worker.runOnce();
      expect(didWork).toBe(true);

      const metrics = await queue.getMetrics();
      expect(metrics.failed).toBe(1);
      expect(metrics.queued).toBe(0);
    });
  });

  describe('ResearchRecoveryService (Interrupted Worker Recovery)', () => {
    it('RECOVER-001: Recovers abandoned job with expired lease and reschedules if attempts remain', async () => {
      await queue.enqueue(samplePayload, { maxAttempts: 3 });

      // Claim job to transition it to PROCESSING
      const claimed = await queue.claimNextJob('worker-crashed');
      expect(claimed).not.toBeNull();

      const mockRunRepo = {
        findById: vi.fn().mockResolvedValue({
          id: mockRunId,
          status: RunStatus.RUNNING,
          current_stage: RunStage.SEARCHING,
        }),
        updateStatus: vi.fn().mockResolvedValue({ id: mockRunId }),
      };

      const recordedEvents: any[] = [];
      const mockProgressRepo = {
        create: vi.fn().mockImplementation(async (input) => {
          recordedEvents.push(input);
          return { id: 'ev-1', ...input };
        }),
      };

      const recoveryService = new ResearchRecoveryService({
        queue,
        runRepo: mockRunRepo as any,
        progressRepo: mockProgressRepo as any,
      });

      // Pass future timestamp so lease is expired
      const futureTime = new Date(Date.now() + 60000);
      const summary = await recoveryService.reconcileStaleJobs(futureTime);

      expect(summary.checkedCount).toBe(1);
      expect(summary.reScheduledCount).toBe(1);

      // Verify RECOVERED event was recorded
      const recEvent = recordedEvents.find((e) => e.event_type === 'RECOVERED');
      expect(recEvent).toBeDefined();

      // Verify queue job was re-queued
      const metrics = await queue.getMetrics();
      expect(metrics.queued).toBe(1);
      expect(metrics.processing).toBe(0);
    });

    it('RECOVER-002: Marks job and run FAILED when lease is expired and attempts reach maxAttempts', async () => {
      await queue.enqueue(samplePayload, { maxAttempts: 1 });

      const claimed = await queue.claimNextJob('worker-crashed');
      expect(claimed).not.toBeNull();

      const mockRunRepo = {
        findById: vi.fn().mockResolvedValue({
          id: mockRunId,
          status: RunStatus.RUNNING,
          current_stage: RunStage.EXTRACTING,
        }),
        updateStatus: vi.fn().mockResolvedValue({ id: mockRunId }),
      };

      const recordedEvents: any[] = [];
      const mockProgressRepo = {
        create: vi.fn().mockImplementation(async (input) => {
          recordedEvents.push(input);
          return { id: 'ev-1', ...input };
        }),
      };

      const recoveryService = new ResearchRecoveryService({
        queue,
        runRepo: mockRunRepo as any,
        progressRepo: mockProgressRepo as any,
      });

      const futureTime = new Date(Date.now() + 60000);
      const summary = await recoveryService.reconcileStaleJobs(futureTime);

      expect(summary.checkedCount).toBe(1);
      expect(summary.failedCount).toBe(1);

      expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
        mockRunId,
        RunStatus.FAILED,
        RunStage.EXTRACTING,
        expect.objectContaining({ error_message: expect.stringContaining('Worker lease expired') }),
        mockUserId
      );

      const metrics = await queue.getMetrics();
      expect(metrics.failed).toBe(1);
      expect(metrics.processing).toBe(0);
    });

    it('RECOVER-003: Reconciles queue when run was already COMPLETED before worker acknowledgement', async () => {
      await queue.enqueue(samplePayload);
      await queue.claimNextJob('worker-slow-ack');

      const mockRunRepo = {
        findById: vi.fn().mockResolvedValue({
          id: mockRunId,
          status: RunStatus.COMPLETED,
          current_stage: RunStage.FINALIZING,
        }),
      };

      const recoveryService = new ResearchRecoveryService({
        queue,
        runRepo: mockRunRepo as any,
      });

      const futureTime = new Date(Date.now() + 60000);
      const summary = await recoveryService.reconcileStaleJobs(futureTime);

      expect(summary.reconciledCount).toBe(1);
      const metrics = await queue.getMetrics();
      expect(metrics.completed).toBe(1);
      expect(metrics.processing).toBe(0);
    });
  });
});

