import 'server-only';
import type { PoolClient } from 'pg';
import type { TransactionContext } from '@/server/persistence/transaction';
import type { ResearchJobQueueRow } from '@/server/persistence/types';
import { AppError } from '@/lib/errors/app-error';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ResearchJobPayload {
  readonly runId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly query: string;
  readonly taskType?: string | undefined;
  readonly constraints?: Record<string, unknown> | undefined;
  readonly limits?: Record<string, unknown> | undefined;
  readonly modelPolicy?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface ClaimedResearchJob {
  readonly id: string;
  readonly runId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly priority: number;
  readonly attempts: number;
  readonly maxAttempts?: number | undefined;
  readonly leaseExpiresAt?: string | null | undefined;
  readonly payload: ResearchJobPayload;
}

export interface EnqueueJobOptions {
  readonly priority?: number | undefined;
  readonly maxAttempts?: number | undefined;
  readonly tx?: TransactionContext | PoolClient | undefined;
}

export interface QueueMetrics {
  readonly queued: number;
  readonly processing: number;
  readonly completed: number;
  readonly failed: number;
  readonly total: number;
}

export class QueueError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Queue operation failed: ${message}`,
      publicMessage: 'An error occurred while processing the research queue.',
      statusCode: 500,
      isOperational: true,
      cause,
    });
    this.name = 'QueueError';
  }
}

export interface IResearchJobQueue {
  /**
   * Enqueues a new research job for asynchronous background processing.
   * Atomically commits within the supplied database transaction if provided.
   */
  enqueue(payload: ResearchJobPayload, options?: EnqueueJobOptions): Promise<string>;

  /**
   * Atomically claims the next eligible QUEUED job via FOR UPDATE SKIP LOCKED.
   * Increments the job's attempt counter and transitions status to PROCESSING.
   */
  claimNextJob(workerId: string): Promise<ClaimedResearchJob | null>;

  /**
   * Acknowledges that the research job successfully completed.
   * Transitions queue status to COMPLETED.
   */
  ackJob(jobId: string, runId: string): Promise<void>;

  /**
   * Records a fatal failure for the research job.
   * Transitions queue status to FAILED with the safe error message.
   */
  failJob(jobId: string, runId: string, error: string): Promise<void>;

  /**
   * Reschedules a job for delayed retry with exponential backoff.
   * Transitions status back to QUEUED with future scheduled_at.
   */
  scheduleRetry(
    jobId: string,
    runId: string,
    error: string,
    delayMs: number,
    category?: string | undefined
  ): Promise<void>;

  /**
   * Renews the active worker lease deadline to signal worker vitality.
   */
  renewLease(jobId: string, leaseDurationMs?: number | undefined): Promise<boolean>;

  /**
   * Cancels a queued or processing job.
   */
  cancelJob(jobId: string, runId: string, reason?: string | undefined): Promise<void>;

  /**
   * Retrieves processing jobs whose worker lease has expired.
   */
  getExpiredProcessingJobs(now?: Date | undefined): Promise<ClaimedResearchJob[]>;

  /**
   * Returns operational queue metrics partitioned by job status.
   */
  getMetrics(): Promise<QueueMetrics>;

  /**
   * Retrieves the raw queue row for a given research run ID.
   */
  getJobByRunId(runId: string): Promise<ResearchJobQueueRow | null>;
}

