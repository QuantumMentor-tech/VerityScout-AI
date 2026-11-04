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
        WHERE status = 'QUEUED'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE research_job_queue q
      SET status = 'PROCESSING',
          claimed_by = $1,
          claimed_at = NOW(),
          attempts = q.attempts + 1,
          updated_at = NOW()
      FROM next_job
      WHERE q.id = next_job.id
      RETURNING q.id, q.run_id, q.task_id, q.user_id, q.priority, q.attempts, q.payload;
    `;

    try {
      const result = await executeQuery<{
        id: string;
        run_id: string;
        task_id: string;
        user_id: string;
        priority: number;
        attempts: number;
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
      });

      return {
        id: row.id,
        runId: row.run_id,
        taskId: row.task_id,
        userId: row.user_id,
        priority: row.priority,
        attempts: row.attempts,
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
          updated_at = NOW()
      WHERE id = $1
    `;

    try {
      await executeQuery(this.pool, sql, [jobId]);
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
