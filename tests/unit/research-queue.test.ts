import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { InMemoryJobQueueAdapter } from '@/server/queue/in-memory-job-queue';
import { PostgresJobQueueAdapter } from '@/server/queue/postgres-job-queue';
import { QueueError, type ResearchJobPayload } from '@/server/queue/queue.types';

describe('Research Job Queue', () => {
  const samplePayload: ResearchJobPayload = {
    runId: '11111111-1111-4111-a111-111111111111',
    taskId: '22222222-2222-4222-a222-222222222222',
    userId: '33333333-3333-4333-a333-333333333333',
    query: 'Find refurbished ThinkPad T14 AMD with 32GB RAM under $700',
    taskType: 'PRODUCT_DISCOVERY',
  };

  describe('InMemoryJobQueueAdapter', () => {
    let queue: InMemoryJobQueueAdapter;

    beforeEach(() => {
      queue = new InMemoryJobQueueAdapter();
    });

    it('QUEUE-MEM-001: Enqueues a job with status QUEUED and initial attempts 0', async () => {
      const jobId = await queue.enqueue(samplePayload, { priority: 5 });
      expect(jobId).toBeDefined();

      const metrics = await queue.getMetrics();
      expect(metrics.queued).toBe(1);
      expect(metrics.total).toBe(1);

      const jobRow = await queue.getJobByRunId(samplePayload.runId);
      expect(jobRow).not.toBeNull();
      expect(jobRow?.status).toBe('QUEUED');
      expect(jobRow?.priority).toBe(5);
      expect(jobRow?.attempts).toBe(0);
    });

    it('QUEUE-MEM-002: Rejects duplicate enqueue for the same runId', async () => {
      await queue.enqueue(samplePayload);
      await expect(queue.enqueue(samplePayload)).rejects.toThrow(QueueError);
    });

    it('QUEUE-MEM-003: Claims highest priority job first and transitions status to PROCESSING', async () => {
      const lowPriorityPayload: ResearchJobPayload = {
        ...samplePayload,
        runId: 'aaaa1111-1111-4111-a111-111111111111',
      };
      const highPriorityPayload: ResearchJobPayload = {
        ...samplePayload,
        runId: 'bbbb2222-2222-4222-a222-222222222222',
      };

      await queue.enqueue(lowPriorityPayload, { priority: 0 });
      await queue.enqueue(highPriorityPayload, { priority: 10 });

      const claimed = await queue.claimNextJob('test-worker-1');
      expect(claimed).not.toBeNull();
      expect(claimed?.runId).toBe(highPriorityPayload.runId);
      expect(claimed?.attempts).toBe(1);

      const metrics = await queue.getMetrics();
      expect(metrics.queued).toBe(1);
      expect(metrics.processing).toBe(1);
    });

    it('QUEUE-MEM-004: Acknowledges job completion and transitions status to COMPLETED', async () => {
      const jobId = await queue.enqueue(samplePayload);
      const claimed = await queue.claimNextJob('test-worker-1');
      expect(claimed).not.toBeNull();

      await queue.ackJob(jobId, samplePayload.runId);

      const metrics = await queue.getMetrics();
      expect(metrics.queued).toBe(0);
      expect(metrics.processing).toBe(0);
      expect(metrics.completed).toBe(1);
    });

    it('QUEUE-MEM-005: Records job failure and transitions status to FAILED', async () => {
      const jobId = await queue.enqueue(samplePayload);
      await queue.claimNextJob('test-worker-1');

      await queue.failJob(jobId, samplePayload.runId, 'Fatal pipeline crash');

      const metrics = await queue.getMetrics();
      expect(metrics.failed).toBe(1);
      expect(metrics.processing).toBe(0);
    });

    it('QUEUE-MEM-006: Returns null when queue is empty', async () => {
      const claimed = await queue.claimNextJob('worker-empty');
      expect(claimed).toBeNull();
    });
  });

  describe('PostgresJobQueueAdapter', () => {
    let mockPool: Partial<Pool>;

    beforeEach(() => {
      mockPool = {
        query: vi.fn(),
      };
    });

    it('QUEUE-PG-001: Enqueues job with parameterized SQL insert', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [{ id: 'job-pg-123' }],
      });

      const adapter = new PostgresJobQueueAdapter(mockPool as Pool);
      const jobId = await adapter.enqueue(samplePayload, { priority: 2 });

      expect(jobId).toBe('job-pg-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO research_job_queue'),
        expect.arrayContaining([
          samplePayload.runId,
          samplePayload.taskId,
          samplePayload.userId,
          2,
          3,
        ])
      );
    });

    it('QUEUE-PG-002: Atomically claims job using FOR UPDATE SKIP LOCKED query', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'job-claimed-1',
            run_id: samplePayload.runId,
            task_id: samplePayload.taskId,
            user_id: samplePayload.userId,
            priority: 0,
            attempts: 1,
            payload: samplePayload,
          },
        ],
      });

      const adapter = new PostgresJobQueueAdapter(mockPool as Pool);
      const claimed = await adapter.claimNextJob('pg-worker-1');

      expect(claimed).not.toBeNull();
      expect(claimed?.id).toBe('job-claimed-1');
      expect(claimed?.runId).toBe(samplePayload.runId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        ['pg-worker-1']
      );
    });

    it('QUEUE-PG-003: Updates status to COMPLETED on ackJob', async () => {
      (mockPool.query as any).mockResolvedValueOnce({ rows: [] });

      const adapter = new PostgresJobQueueAdapter(mockPool as Pool);
      await adapter.ackJob('job-1', 'run-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'COMPLETED'"),
        ['job-1']
      );
    });

    it('QUEUE-PG-004: Updates status to FAILED on failJob', async () => {
      (mockPool.query as any).mockResolvedValueOnce({ rows: [] });

      const adapter = new PostgresJobQueueAdapter(mockPool as Pool);
      await adapter.failJob('job-1', 'run-1', 'Connection reset');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'FAILED'"),
        ['job-1', 'Connection reset']
      );
    });

    it('QUEUE-PG-005: Retrieves queue metrics by aggregating counts across statuses', async () => {
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [{ queued: 3, processing: 1, completed: 15, failed: 2, total: 21 }],
      });

      const adapter = new PostgresJobQueueAdapter(mockPool as Pool);
      const metrics = await adapter.getMetrics();

      expect(metrics).toEqual({
        queued: 3,
        processing: 1,
        completed: 15,
        failed: 2,
        total: 21,
      });
    });
  });
});

