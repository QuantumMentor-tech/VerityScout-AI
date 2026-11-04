import 'server-only';
import { randomUUID } from 'node:crypto';
import { IResearchJobQueue } from '@/server/queue/queue.types';
import { getResearchJobQueue } from '@/server/queue';
import { ResearchPipelineOrchestrator } from '@/server/research/orchestration/research-pipeline-orchestrator';
import { logger } from '@/lib/logging/logger';

export interface ResearchWorkerOptions {
  readonly workerId?: string | undefined;
  readonly pollIntervalMs?: number | undefined;
  readonly queue?: IResearchJobQueue | undefined;
  readonly orchestrator?: ResearchPipelineOrchestrator | undefined;
}

export class ResearchWorker {
  public readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly queue: IResearchJobQueue;
  private readonly orchestrator: ResearchPipelineOrchestrator;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private pollTimeout: NodeJS.Timeout | null = null;

  constructor(options?: ResearchWorkerOptions) {
    this.workerId = options?.workerId ?? `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = options?.pollIntervalMs ?? 1000;
    this.queue = options?.queue ?? getResearchJobQueue();
    this.orchestrator = options?.orchestrator ?? new ResearchPipelineOrchestrator();
  }

  /**
   * Starts the worker continuous polling loop.
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('WORKER_ALREADY_RUNNING', 'Worker is already running', { workerId: this.workerId });
      return;
    }

    this.isRunning = true;
    logger.info('WORKER_STARTED', 'Persistent research worker daemon started', {
      workerId: this.workerId,
      pollIntervalMs: this.pollIntervalMs,
    });

    this.scheduleNextPoll(0);
  }

  /**
   * Gracefully stops the worker polling loop.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('WORKER_STOPPING', 'Worker stop requested; completing in-flight jobs', {
      workerId: this.workerId,
    });

    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Wait for in-flight job if currently processing
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info('WORKER_STOPPED', 'Research worker daemon stopped cleanly', {
      workerId: this.workerId,
    });
  }

  /**
   * Executes a single polling iteration.
   * Returns true if a job was claimed and processed, false if queue was empty.
   */
  async runOnce(): Promise<boolean> {
    try {
      this.isProcessing = true;
      const claimedJob = await this.queue.claimNextJob(this.workerId);

      if (!claimedJob) {
        return false;
      }

      logger.info('WORKER_JOB_PROCESSING', 'Executing claimed research job', {
        workerId: this.workerId,
        jobId: claimedJob.id,
        runId: claimedJob.runId,
        taskId: claimedJob.taskId,
      });

      const result = await this.orchestrator.execute(claimedJob);

      if (result.success) {
        await this.queue.ackJob(claimedJob.id, claimedJob.runId);
        logger.info('WORKER_JOB_SUCCESS', 'Job completed and acknowledged', {
          workerId: this.workerId,
          jobId: claimedJob.id,
          runId: claimedJob.runId,
          durationMs: result.durationMs,
        });
      } else {
        await this.queue.failJob(claimedJob.id, claimedJob.runId, result.error ?? 'Unknown pipeline error');
        logger.warn('WORKER_JOB_FAILURE', 'Job failed during execution', {
          workerId: this.workerId,
          jobId: claimedJob.id,
          runId: claimedJob.runId,
          error: result.error,
        });
      }

      return true;
    } catch (err: unknown) {
      logger.error('WORKER_UNHANDLED_ERROR', 'Unexpected error in worker loop', {
        workerId: this.workerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      this.isProcessing = false;
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.isRunning) return;

    this.pollTimeout = setTimeout(async () => {
      let hadWork = false;
      try {
        hadWork = await this.runOnce();
      } catch (err: unknown) {
        logger.error('WORKER_POLL_ERROR', 'Error during poll iteration', {
          workerId: this.workerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // If work was found, poll immediately for the next job; otherwise sleep pollIntervalMs
      const nextDelay = hadWork ? 0 : this.pollIntervalMs;
      this.scheduleNextPoll(nextDelay);
    }, delayMs);
  }

  get active(): boolean {
    return this.isRunning;
  }
}

