import 'server-only';
import { Pool } from 'pg';
import { getPool } from '@/server/persistence/database';
import { getExecutor, executeQuery } from '@/server/persistence/repositories/base.repository';
import type { ResearchJobQueueRow } from '@/server/persistence/types';
import {
  IResearchJobQueue,
  ResearchJobPayload,
  ClaimedResearchJob,
  EnqueueJobOptions,
  QueueMetrics,
  QueueError,
} from './queue.types';
import { logger } from '@/lib/logging/logger';

export class PostgresJobQueueAdapter implements IResearchJobQueue {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  async enqueue(payload: ResearchJobPayload, options?: EnqueueJobOptions): Promise<string> {
    const executor = options?.tx ? getExecutor(options.tx) : this.pool;
    const priority = options?.priority ?? 0;
    const maxAttempts = options?.maxAttempts ?? 3;

    const sql = `
      INSERT INTO research_job_queue (
        run_id, task_id, user_id, status, priority, attempts, max_attempts, payload
      ) VALUES ($1, $2, $3, 'QUEUED', $4, 0, $5, $6)
      RETURNING id
    `;
    const params = [
      payload.runId,
      payload.taskId,
      payload.userId,
      priority,
      maxAttempts,
      JSON.stringify(payload),
    ];

    try {
      const result = await executeQuery<{ id: string }>(executor, sql, params);
      const row = result.rows[0];
      if (!row) {
        throw new QueueError('Database did not return inserted queue job id');
      }

      logger.info('QUEUE_JOB_ENQUEUED', 'Research job enqueued into persistent queue', {
        jobId: row.id,
        runId: payload.runId,
        taskId: payload.taskId,
        userId: payload.userId,
        priority,
      });

      return row.id;
    } catch (err: unknown) {
      logger.error('QUEUE_JOB_ENQUEUE_FAILED', 'Failed to enqueue research job', {
        runId: payload.runId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof QueueError) throw err;
      throw new QueueError('Failed to persist queued research job', err);
    }
  }

  async claimNextJob(workerId: string): Promise<ClaimedResearchJob | null> {
    const sql = `
      WITH next_job AS (
        SELECT id
        FROM research_job_queue
        WHERE status = 'QUEUED' AND scheduled_at <= NOW()
        ORDER BY priority DESC, scheduled_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE research_job_queue q
      SET status = 'PROCESSING',
          claimed_by = $1,
          claimed_at = NOW(),
          lease_expires_at = NOW() + INTERVAL '30 seconds',
          attempts = q.attempts + 1,
          updated_at = NOW()
      FROM next_job
      WHERE q.id = next_job.id
      RETURNING q.id, q.run_id, q.task_id, q.user_id, q.priority, q.attempts, q.max_attempts, q.lease_expires_at, q.payload;
    `;

    try {
      const result = await executeQuery<{
        id: string;
        run_id: string;
        task_id: string;
        user_id: string;
        priority: number;
        attempts: number;
        max_attempts: number;
        lease_expires_at: string | null;
        payload: ResearchJobPayload | string;
      }>(this.pool, sql, [workerId]);

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const parsedPayload =
        typeof row.payload === 'string'
          ? (JSON.parse(row.payload) as ResearchJobPayload)
          : row.payload;

      logger.info('QUEUE_JOB_CLAIMED', 'Worker atomically claimed research job', {
        workerId,
        jobId: row.id,
        runId: row.run_id,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
      });

      return {
        id: row.id,
        runId: row.run_id,
        taskId: row.task_id,
        userId: row.user_id,
        priority: row.priority,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        leaseExpiresAt: row.lease_expires_at,
        payload: parsedPayload,
      };
    } catch (err: unknown) {
      logger.error('QUEUE_JOB_CLAIM_FAILED', 'Failed during atomic dequeue claim', {
        workerId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new QueueError('Failed during queue claim', err);
    }
  }

  async ackJob(jobId: string, runId: string): Promise<void> {
    const sql = `
      UPDATE research_job_queue
      SET status = 'COMPLETED',
          updated_at = NOW()
      WHERE id = $1
    `;

    try {
      await executeQuery(this.pool, sql, [jobId]);
      logger.info('QUEUE_JOB_ACKNOWLEDGED', 'Research job acknowledged as completed', {
        jobId,
        runId,
      });
    } catch (err: unknown) {
      logger.error('QUEUE_JOB_ACK_FAILED', 'Failed to acknowledge completed queue job', {
        jobId,
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new QueueError('Failed to acknowledge job completion', err);
    }
  }

  async failJob(jobId: string, runId: string, error: string): Promise<void> {
    const sql = `
      UPDATE research_job_queue
      SET status = 'FAILED',
          last_error = $2,
          updated_at = NOW()
      WHERE id = $1
    `;

    try {
      await executeQuery(this.pool, sql, [jobId, error]);
      logger.warn('QUEUE_JOB_FAILED', 'Research job marked as failed in queue', {
        jobId,
        runId,
        error,
      });
    } catch (err: unknown) {
      logger.error('QUEUE_JOB_FAIL_FAILED', 'Failed to record job failure in queue', {
        jobId,
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new QueueError('Failed to mark job as failed', err);
    }
  }

  async scheduleRetry(
    jobId: string,
    runId: string,
    error: string,
    delayMs: number,
    category?: string | undefined
  ): Promise<void> {
    const sql = `
      UPDATE research_job_queue
      SET status = 'QUEUED',
          claimed_by = NULL,
          claimed_at = NULL,
          lease_expires_at = NULL,
          scheduled_at = NOW() + ($2 || ' milliseconds')::INTERVAL,
          last_error = $3,
          failure_category = $4,
          updated_at = NOW()
      WHERE id = $1
    `;

    try {
      await executeQuery(this.pool, sql, [
        jobId,
        Math.max(0, Math.floor(delayMs)).toString(),
        error,
        category ?? 'TRANSIENT',
      ]);
      logger.info('QUEUE_JOB_RETRY_SCHEDULED', 'Research job rescheduled for retry', {
        jobId,
        runId,
        delayMs,
        category,
      });
    } catch (err: unknown) {
      logger.error('QUEUE_JOB_RETRY_FAILED', 'Failed to schedule job retry', {
        jobId,
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new QueueError('Failed to schedule job retry', err);
    }
  }

  async renewLease(jobId: string, leaseDurationMs: number = 30000): Promise<boolean> {
    const sql = `
      UPDATE research_job_queue
      SET lease_expires_at = NOW() + ($2 || ' milliseconds')::INTERVAL,
          updated_at = NOW()
      WHERE id = $1 AND status = 'PROCESSING'
      RETURNING id
    `;

    try {
      const result = await executeQuery<{ id: string }>(this.pool, sql, [
        jobId,
        Math.max(1000, Math.floor(leaseDurationMs)).toString(),
      ]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (err: unknown) {
      logger.warn('QUEUE_LEASE_RENEW_FAILED', 'Failed to renew worker lease heartbeat', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async cancelJob(jobId: string, runId: string, reason?: string | undefined): Promise<void> {
    const sql = `
      UPDATE research_job_queue
      SET status = 'FAILED',
          last_error = $2,
          failure_category = 'CANCELLED',
          updated_at = NOW()
      WHERE id = $1
    `;

    try {
      await executeQuery(this.pool, sql, [jobId, reason ?? 'Cancelled by user']);
      logger.info('QUEUE_JOB_CANCELLED', 'Research job marked as cancelled in queue', {
        jobId,
        runId,
        reason,
      });
    } catch (err: unknown) {
      logger.error('QUEUE_JOB_CANCEL_FAILED', 'Failed to cancel queue job', {
        jobId,
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new QueueError('Failed to cancel job in queue', err);
    }
  }

  async getExpiredProcessingJobs(now: Date = new Date()): Promise<ClaimedResearchJob[]> {
    const sql = `
      SELECT id, run_id, task_id, user_id, priority, attempts, max_attempts, lease_expires_at, payload
      FROM research_job_queue
      WHERE status = 'PROCESSING' AND lease_expires_at < $1
    `;

    try {
      const result = await executeQuery<{
        id: string;
        run_id: string;
        task_id: string;
        user_id: string;
        priority: number;
        attempts: number;
        max_attempts: number;
        lease_expires_at: string | null;
        payload: ResearchJobPayload | string;
      }>(this.pool, sql, [now]);

      return result.rows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        taskId: row.task_id,
        userId: row.user_id,
        priority: row.priority,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        leaseExpiresAt: row.lease_expires_at,
        payload:
          typeof row.payload === 'string'
            ? (JSON.parse(row.payload) as ResearchJobPayload)
            : row.payload,
      }));
    } catch (err: unknown) {
      logger.error('QUEUE_GET_EXPIRED_FAILED', 'Failed to retrieve expired processing jobs', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new QueueError('Failed to query expired processing jobs', err);
    }
  }

  async getMetrics(): Promise<QueueMetrics> {
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'QUEUED')::int AS queued,
        COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
        COUNT(*)::int AS total
      FROM research_job_queue
    `;

    try {
      const res = await executeQuery<{
        queued: number;
        processing: number;
        completed: number;
        failed: number;
        total: number;
      }>(this.pool, sql, []);

      const row = res.rows[0];
      return {
        queued: row?.queued ?? 0,
        processing: row?.processing ?? 0,
        completed: row?.completed ?? 0,
        failed: row?.failed ?? 0,
        total: row?.total ?? 0,
      };
    } catch (err: unknown) {
      logger.error('QUEUE_METRICS_FAILED', 'Failed to retrieve queue metrics', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new QueueError('Failed to query queue metrics', err);
    }
  }

  async getJobByRunId(runId: string): Promise<ResearchJobQueueRow | null> {
    const sql = 'SELECT * FROM research_job_queue WHERE run_id = $1';
    try {
      const res = await executeQuery<ResearchJobQueueRow>(this.pool, sql, [runId]);
      return res.rows[0] ?? null;
    } catch (err: unknown) {
      throw new QueueError('Failed to retrieve job by runId', err);
    }
  }
}
