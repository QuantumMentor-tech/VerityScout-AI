import 'server-only';
import { randomUUID } from 'node:crypto';
import { IResearchJobQueue } from '@/server/queue/queue.types';
import { getResearchJobQueue } from '@/server/queue';
import { ResearchPipelineOrchestrator } from '@/server/research/orchestration/research-pipeline-orchestrator';
import {
  ProgressEventRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { RunStage, OccurrenceStatus } from '@/server/persistence/types';
import { classifyError, calculateRetryDelay, shouldRetry } from '@/server/research/retry';
import { ResearchRecoveryService } from './research-recovery.service';
import { ResearchSchedulerService } from '@/server/schedules';
import { logger } from '@/lib/logging/logger';

export interface ResearchWorkerOptions {
  readonly workerId?: string | undefined;
  readonly pollIntervalMs?: number | undefined;
  readonly heartbeatIntervalMs?: number | undefined;
  readonly leaseDurationMs?: number | undefined;
  readonly queue?: IResearchJobQueue | undefined;
  readonly orchestrator?: ResearchPipelineOrchestrator | undefined;
  readonly progressRepo?: ProgressEventRepository | undefined;
  readonly occurrenceRepo?: ScheduleOccurrenceRepository | undefined;
  readonly recoveryService?: ResearchRecoveryService | undefined;
  readonly schedulerService?: ResearchSchedulerService | undefined;
}

export class ResearchWorker {
  public readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly leaseDurationMs: number;
  private readonly queue: IResearchJobQueue;
  private readonly orchestrator: ResearchPipelineOrchestrator;
  private readonly progressRepo: ProgressEventRepository;
  private readonly occurrenceRepo: ScheduleOccurrenceRepository;
  private readonly recoveryService: ResearchRecoveryService;
  private readonly schedulerService: ResearchSchedulerService;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private loopCounter: number = 0;

  constructor(options?: ResearchWorkerOptions) {
    this.workerId = options?.workerId ?? `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = options?.pollIntervalMs ?? 1000;
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 10000;
    this.leaseDurationMs = options?.leaseDurationMs ?? 30000;
    this.queue = options?.queue ?? getResearchJobQueue();
    this.orchestrator = options?.orchestrator ?? new ResearchPipelineOrchestrator();
    this.progressRepo = options?.progressRepo ?? new ProgressEventRepository();
    this.occurrenceRepo = options?.occurrenceRepo ?? new ScheduleOccurrenceRepository();
    this.recoveryService =
      options?.recoveryService ??
      new ResearchRecoveryService({
        queue: this.queue,
        progressRepo: this.progressRepo,
        occurrenceRepo: this.occurrenceRepo,
      });
    this.schedulerService =
      options?.schedulerService ??
      new ResearchSchedulerService({
        queue: this.queue,
        occurrenceRepo: this.occurrenceRepo,
      });
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
      this.loopCounter++;

      // Periodically check for stale jobs needing recovery (e.g. every 30 polls)
      if (this.loopCounter % 30 === 0) {
        try {
          await this.recoveryService.reconcileStaleJobs();
          await this.recoveryService.reconcileOccurrences();
        } catch (recErr) {
          logger.warn('WORKER_PERIODIC_RECOVERY_ERROR', 'Error during periodic recovery pass', {
            error: recErr instanceof Error ? recErr.message : String(recErr),
          });
        }
      }

      // Periodically evaluate due recurring research schedules (e.g. every 10 polls)
      if (this.loopCounter % 10 === 0) {
        try {
          await this.schedulerService.evaluateAndDispatchDueSchedules();
        } catch (schedErr) {
          logger.warn('WORKER_PERIODIC_SCHEDULE_ERROR', 'Error during periodic schedule evaluation pass', {
            error: schedErr instanceof Error ? schedErr.message : String(schedErr),
          });
        }
      }

      const claimedJob = await this.queue.claimNextJob(this.workerId);

      if (!claimedJob) {
        return false;
      }

      const occurrenceId = (claimedJob.payload?.metadata?.occurrenceId as string | undefined) ?? undefined;

      // Validate occurrence state before executing: abort if occurrence was cancelled or superseded
      if (occurrenceId) {
        try {
          const occ = await this.occurrenceRepo.findById(occurrenceId);
          if (occ && (occ.status === OccurrenceStatus.CANCELLED || occ.status === OccurrenceStatus.SKIPPED)) {
            logger.info('WORKER_JOB_SKIPPED_INACTIVE_OCCURRENCE', 'Skipping job execution because occurrence was cancelled or skipped', {
              workerId: this.workerId,
              jobId: claimedJob.id,
              occurrenceId,
              status: occ.status,
            });
            await this.queue.cancelJob(claimedJob.id, claimedJob.runId, `Occurrence was ${occ.status}`);
            return true;
          }
          await this.occurrenceRepo.updateStatus(occurrenceId, OccurrenceStatus.RUNNING, {
            started_at: new Date(),
          });
        } catch (occErr) {
          logger.warn('WORKER_OCCURRENCE_START_UPDATE_FAILED', 'Failed to update occurrence to RUNNING', {
            occurrenceId,
            error: occErr instanceof Error ? occErr.message : String(occErr),
          });
        }
      }

      logger.info('WORKER_JOB_PROCESSING', 'Executing claimed research job', {
        workerId: this.workerId,
        jobId: claimedJob.id,
        runId: claimedJob.runId,
        taskId: claimedJob.taskId,
        attempts: claimedJob.attempts,
      });

      // Start background heartbeat lease renewal
      let heartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
        try {
          await this.queue.renewLease(claimedJob.id, this.leaseDurationMs);
        } catch (hbErr) {
          logger.warn('WORKER_HEARTBEAT_FAILED', 'Failed to renew worker lease heartbeat', {
            workerId: this.workerId,
            jobId: claimedJob.id,
            error: hbErr instanceof Error ? hbErr.message : String(hbErr),
          });
        }
      }, this.heartbeatIntervalMs);

      try {
        const result = await this.orchestrator.execute(claimedJob);

        if (result.cancelled) {
          await this.queue.cancelJob(
            claimedJob.id,
            claimedJob.runId,
            result.error ?? 'Cancelled by user request'
          );
          if (occurrenceId) {
            try {
              await this.occurrenceRepo.updateStatus(occurrenceId, OccurrenceStatus.CANCELLED, {
                completed_at: new Date(),
                error_message: result.error ?? 'Cancelled by user request',
              });
            } catch {
              // Non-fatal
            }
          }
          logger.info('WORKER_JOB_CANCELLED', 'Job cancelled as requested by caller', {
            workerId: this.workerId,
            jobId: claimedJob.id,
            runId: claimedJob.runId,
          });
        } else if (result.success) {
          await this.queue.ackJob(claimedJob.id, claimedJob.runId);
          if (occurrenceId) {
            try {
              await this.occurrenceRepo.updateStatus(occurrenceId, OccurrenceStatus.COMPLETED, {
                completed_at: new Date(),
              });
            } catch {
              // Non-fatal
            }
          }
          logger.info('WORKER_JOB_SUCCESS', 'Job completed and acknowledged', {
            workerId: this.workerId,
            jobId: claimedJob.id,
            runId: claimedJob.runId,
            durationMs: result.durationMs,
          });
        } else {
          // Failure handling with classification and bounded exponential retries
          const safeError = result.error ?? 'Unknown research pipeline failure';
          const classification = classifyError(safeError);
          const maxAttempts = claimedJob.maxAttempts ?? 3;

          if (shouldRetry(claimedJob.attempts, maxAttempts, classification.category)) {
            const delayMs = calculateRetryDelay(
              claimedJob.attempts,
              classification.retryAfterSeconds
            );

            await this.queue.scheduleRetry(
              claimedJob.id,
              claimedJob.runId,
              safeError,
              delayMs,
              classification.category
            );

            try {
              await this.progressRepo.create({
                run_id: claimedJob.runId,
                user_id: claimedJob.userId,
                stage: RunStage.FINALIZING,
                event_type: 'RETRY_SCHEDULED',
                message: `Transient error encountered (attempt ${claimedJob.attempts}/${maxAttempts}); retrying in ${Math.round(delayMs / 1000)}s: ${safeError}`,
                metadata: {
                  attempt: claimedJob.attempts,
                  maxAttempts,
                  delayMs,
                  category: classification.category,
                },
              });
            } catch (progErr) {
              logger.warn('WORKER_PROGRESS_EVENT_FAILED', 'Failed to record RETRY_SCHEDULED event', {
                runId: claimedJob.runId,
                error: progErr instanceof Error ? progErr.message : String(progErr),
              });
            }

            logger.info('WORKER_JOB_RETRY_SCHEDULED', 'Job retry scheduled after transient error', {
              workerId: this.workerId,
              jobId: claimedJob.id,
              runId: claimedJob.runId,
              attempt: claimedJob.attempts,
              maxAttempts,
              delayMs,
            });
          } else {
            // Fatal failure: max attempts exhausted or permanent error
            await this.queue.failJob(claimedJob.id, claimedJob.runId, safeError);
            if (occurrenceId) {
              try {
                await this.occurrenceRepo.updateStatus(occurrenceId, OccurrenceStatus.FAILED, {
                  completed_at: new Date(),
                  error_message: safeError,
                });
              } catch {
                // Non-fatal
              }
            }
            logger.warn('WORKER_JOB_FAILURE', 'Job fatally failed during execution', {
              workerId: this.workerId,
              jobId: claimedJob.id,
              runId: claimedJob.runId,
              category: classification.category,
              error: safeError,
            });
          }
        }
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
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
