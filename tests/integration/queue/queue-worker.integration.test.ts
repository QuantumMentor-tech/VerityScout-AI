import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { InMemoryJobQueueAdapter } from '@/server/queue/in-memory-job-queue';
import { ResearchWorker } from '@/server/worker/research-worker';
import { ResearchRecoveryService } from '@/server/worker/research-recovery.service';
import { ResearchJobPayload } from '@/server/queue/queue.types';

describe('Persistent Queue & Worker Execution Integration Tests', () => {
  let queue: InMemoryJobQueueAdapter;
  let mockOrchestrator: any;
  let mockRunRepo: any;
  let mockProgressRepo: any;
  let mockOccurrenceRepo: any;
  let recoveryService: ResearchRecoveryService;
  let worker: ResearchWorker;

  beforeEach(() => {
    queue = new InMemoryJobQueueAdapter();

    mockOrchestrator = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        durationMs: 150,
      }),
    };

    mockRunRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
        current_stage: 'SEARCHING',
      }),
      updateStatus: vi.fn().mockResolvedValue({}),
    };

    mockProgressRepo = {
      create: vi.fn().mockResolvedValue({ id: 'prog-1' }),
      listByRunId: vi.fn().mockResolvedValue([]),
    };

    mockOccurrenceRepo = {
      findById: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue({}),
      recordFailure: vi.fn().mockResolvedValue({}),
      findStaleDispatched: vi.fn().mockResolvedValue([]),
      markReconciliationRequired: vi.fn().mockResolvedValue({}),
    };

    recoveryService = new ResearchRecoveryService({
      queue,
      runRepo: mockRunRepo,
      progressRepo: mockProgressRepo,
      occurrenceRepo: mockOccurrenceRepo,
    });

    worker = new ResearchWorker({
      workerId: 'test-worker-alpha',
      queue,
      orchestrator: mockOrchestrator,
      progressRepo: mockProgressRepo,
      occurrenceRepo: mockOccurrenceRepo,
      recoveryService,
    });
  });

  it('AC-06: enqueues, claims, and processes job with lifecycle status transitions', async () => {
    const payload: ResearchJobPayload = {
      runId: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      query: 'Best wireless noise-cancelling headphones',
    };

    // 1. Enqueue job
    const jobId = await queue.enqueue(payload, { priority: 10 });
    expect(jobId).toBeDefined();

    const metricsBefore = await queue.getMetrics();
    expect(metricsBefore.queued).toBe(1);
    expect(metricsBefore.processing).toBe(0);

    // 2. Claim job
    const claimed = await queue.claimNextJob('test-worker-alpha');
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe(jobId);

    const metricsDuring = await queue.getMetrics();
    expect(metricsDuring.queued).toBe(0);
    expect(metricsDuring.processing).toBe(1);

    // 3. Complete job via ackJob
    await queue.ackJob(jobId, payload.runId);

    const metricsAfter = await queue.getMetrics();
    expect(metricsAfter.queued).toBe(0);
    expect(metricsAfter.processing).toBe(0);
    expect(metricsAfter.completed).toBe(1);
  });

  it('AC-06 & AC-07: enforces single-run idempotency on queue.enqueue()', async () => {
    const runId = crypto.randomUUID();
    const payload: ResearchJobPayload = {
      runId,
      taskId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      query: 'Quantum annealing battery patents',
    };

    // First enqueue succeeds
    await queue.enqueue(payload);

    // Second enqueue with identical runId must reject idempotently
    await expect(queue.enqueue(payload)).rejects.toThrow(/already enqueued/i);
  });

  it('AC-06: executes deterministic worker.runOnce() through complete lifecycle', async () => {
    const payload: ResearchJobPayload = {
      runId: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      query: 'Ergonomic mechanical split keyboard',
    };

    await queue.enqueue(payload);

    // Single deterministic worker tick
    const handled = await worker.runOnce();
    expect(handled).toBe(true);

    // Orchestrator was invoked with the job
    expect(mockOrchestrator.execute).toHaveBeenCalledTimes(1);
    expect(mockOrchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: payload.runId,
        id: expect.any(String),
      })
    );

    // Job is now marked COMPLETED in queue
    const metrics = await queue.getMetrics();
    expect(metrics.processing).toBe(0);
    expect(metrics.completed).toBe(1);

    // Subsequent tick on empty queue returns false
    const nextHandled = await worker.runOnce();
    expect(nextHandled).toBe(false);
  });

  it('AC-07: recovers stale leases when heartbeat expires', async () => {
    const payload: ResearchJobPayload = {
      runId: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      query: 'Standing desk review',
    };

    const jobId = await queue.enqueue(payload, { maxAttempts: 3 });

    // Simulate dead worker claiming the job
    const claimed = await queue.claimNextJob('dead-worker-1');
    expect(claimed).not.toBeNull();

    // Force lease to have expired 60 seconds ago
    const past = new Date(Date.now() - 60000).toISOString();
    (queue as any).jobs.get(jobId).leaseExpiresAt = past;

    // Run recovery service
    const summary = await recoveryService.reconcileStaleJobs();
    expect(summary.checkedCount).toBe(1);
    expect(summary.reScheduledCount).toBe(1);

    // Fast-forward scheduledAt to now so it can be claimed immediately
    (queue as any).jobs.get(jobId).scheduledAt = new Date().toISOString();

    // Job is back in QUEUED state and can be claimed by a healthy worker
    const healthyClaim = await queue.claimNextJob('healthy-worker-2');
    expect(healthyClaim).not.toBeNull();
    expect(healthyClaim?.id).toBe(jobId);
  });

  it('AC-07: handles job retry with exponential backoff on retryable error', async () => {
    // Orchestrator returns error result (retryable network rate limit)
    mockOrchestrator.execute = vi.fn().mockResolvedValueOnce({
      success: false,
      error: 'Rate limit exceeded 429: Too Many Requests',
    });

    const payload: ResearchJobPayload = {
      runId: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      query: 'MacBook Air M4 prices',
    };

    await queue.enqueue(payload, { maxAttempts: 3 });

    // Worker tick handles the job and schedules a retry
    const handled = await worker.runOnce();
    expect(handled).toBe(true);

    // Check queue state: job is no longer processing
    const metrics = await queue.getMetrics();
    expect(metrics.processing).toBe(0);
    expect(metrics.queued).toBe(1);
  });
});
