import 'server-only';
import { IResearchJobQueue } from '@/server/queue/queue.types';
import { getResearchJobQueue } from '@/server/queue';
import {
  ResearchRunRepository,
  ProgressEventRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { RunStatus, RunStage, OccurrenceStatus } from '@/server/persistence/types';
import { calculateRetryDelay } from '@/server/research/retry';
import { logger } from '@/lib/logging/logger';

export interface RecoverySummary {
  readonly checkedCount: number;
  readonly reconciledCount: number;
  readonly reScheduledCount: number;
  readonly failedCount: number;
  readonly cancelledCount: number;
}

export interface OccurrenceRecoverySummary {
  readonly stuckChecked: number;
  readonly stuckReconciled: number;
  readonly terminalChecked: number;
  readonly terminalReconciled: number;
}

export interface ResearchRecoveryOptions {
  readonly queue?: IResearchJobQueue | undefined;
  readonly runRepo?: ResearchRunRepository | undefined;
  readonly progressRepo?: ProgressEventRepository | undefined;
  readonly occurrenceRepo?: ScheduleOccurrenceRepository | undefined;
}

export class ResearchRecoveryService {
  private readonly queue: IResearchJobQueue;
  private readonly runRepo: ResearchRunRepository;
  private readonly progressRepo: ProgressEventRepository;
  private readonly occurrenceRepo: ScheduleOccurrenceRepository;

  constructor(options?: ResearchRecoveryOptions) {
    this.queue = options?.queue ?? getResearchJobQueue();
    this.runRepo = options?.runRepo ?? new ResearchRunRepository();
    this.progressRepo = options?.progressRepo ?? new ProgressEventRepository();
    this.occurrenceRepo = options?.occurrenceRepo ?? new ScheduleOccurrenceRepository();
  }

  /**
   * Scans for stale processing jobs with expired worker leases and safely reconciles
   * them against run state and retry thresholds without mass resets.
   */
  async reconcileStaleJobs(now: Date = new Date()): Promise<RecoverySummary> {
    const expiredJobs = await this.queue.getExpiredProcessingJobs(now);
    let reconciledCount = 0;
    let reScheduledCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;

    if (expiredJobs.length === 0) {
      return {
        checkedCount: 0,
        reconciledCount: 0,
        reScheduledCount: 0,
        failedCount: 0,
        cancelledCount: 0,
      };
    }

    logger.warn('RECOVERY_STALE_JOBS_DETECTED', 'Detected stale jobs with expired leases', {
      count: expiredJobs.length,
      timestamp: now.toISOString(),
    });

    for (const job of expiredJobs) {
      try {
        const run = await this.runRepo.findById(job.runId);

        if (!run) {
          await this.queue.failJob(job.id, job.runId, 'Associated research run not found');
          failedCount++;
          reconciledCount++;
          continue;
        }

        // Case 1: Run already succeeded in orchestrator before worker acknowledgement
        if (run.status === RunStatus.COMPLETED) {
          await this.queue.ackJob(job.id, job.runId);
          reconciledCount++;
          continue;
        }

        // Case 2: Cancellation requested while worker was processing or after crash
        if (
          run.status === RunStatus.CANCELLATION_REQUESTED ||
          run.status === RunStatus.CANCELLED
        ) {
          await this.runRepo.updateStatus(
            job.runId,
            RunStatus.CANCELLED,
            run.current_stage,
            {
              completed_at: new Date(),
              error_message: 'Cancelled while worker was interrupted',
            },
            job.userId
          );

          await this.queue.cancelJob(
            job.id,
            job.runId,
            'Cancelled while worker was interrupted'
          );

          await this.progressRepo.create({
            run_id: job.runId,
            user_id: job.userId,
            stage: run.current_stage,
            event_type: 'CANCELLED',
            message: 'Research run cancelled following worker lease expiration',
          });

          cancelledCount++;
          reconciledCount++;
          continue;
        }

        // Case 3: Run was in-progress when worker died/lease expired
        const maxAttempts = job.maxAttempts ?? 3;
        if (job.attempts < maxAttempts) {
          const delay = calculateRetryDelay(job.attempts);
          await this.queue.scheduleRetry(
            job.id,
            job.runId,
            'Worker lease expired; re-queued for execution',
            delay,
            'TRANSIENT'
          );

          await this.progressRepo.create({
            run_id: job.runId,
            user_id: job.userId,
            stage: run.current_stage ?? RunStage.INITIATED,
            event_type: 'RECOVERED',
            message: `Worker lease expired (attempt ${job.attempts}/${maxAttempts}); automatically recovered and rescheduled`,
            metadata: { attempts: job.attempts, maxAttempts, delayMs: delay },
          });

          reScheduledCount++;
          reconciledCount++;
        } else {
          // Max attempts reached; mark permanently failed
          const failureMsg = `Worker lease expired and maximum retry attempts (${maxAttempts}) exhausted`;
          await this.runRepo.updateStatus(
            job.runId,
            RunStatus.FAILED,
            run.current_stage ?? RunStage.FINALIZING,
            {
              completed_at: new Date(),
              error_message: failureMsg,
            },
            job.userId
          );

          await this.queue.failJob(job.id, job.runId, failureMsg);

          await this.progressRepo.create({
            run_id: job.runId,
            user_id: job.userId,
            stage: run.current_stage ?? RunStage.FINALIZING,
            event_type: 'FAILED',
            message: failureMsg,
            metadata: { attempts: job.attempts, maxAttempts },
          });

          failedCount++;
          reconciledCount++;
        }
      } catch (recoveryErr: unknown) {
        logger.error('RECOVERY_JOB_ERROR', 'Error recovering specific stale job', {
          jobId: job.id,
          runId: job.runId,
          error: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
        });
      }
    }

    return {
      checkedCount: expiredJobs.length,
      reconciledCount,
      reScheduledCount,
      failedCount,
      cancelledCount,
    };
  }

  /**
   * Scans for ambiguous, interrupted, or out-of-sync schedule occurrences and
   * reconciles them against durable research run and queue outcomes.
   */
  async reconcileOccurrences(now: Date = new Date()): Promise<OccurrenceRecoverySummary> {
    let stuckReconciled = 0;
    let terminalReconciled = 0;

    // 1. Reconcile occurrences stuck in DISPATCHING (> 5 minutes old)
    const stuckCutoff = new Date(now.getTime() - 5 * 60 * 1000);
    const stuckList = await this.occurrenceRepo.findStuckDispatching(stuckCutoff, 50);

    for (const occ of stuckList) {
      try {
        if (occ.queue_job_id) {
          await this.occurrenceRepo.updateStatus(occ.id, OccurrenceStatus.DISPATCHED);
          stuckReconciled++;
        } else {
          await this.occurrenceRepo.updateStatus(occ.id, OccurrenceStatus.RECONCILIATION_REQUIRED, {
            error_message: 'Dispatch timed out or was interrupted before queue submission confirmed',
            recovery_metadata: { reconciledAt: now.toISOString(), previousStatus: occ.status },
          });
          stuckReconciled++;
        }
      } catch (err) {
        logger.warn('RECOVERY_OCCURRENCE_STUCK_ERROR', 'Failed to reconcile stuck occurrence', {
          occurrenceId: occ.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Reconcile occurrences whose research run has already reached a terminal state
    const outOfSync = await this.occurrenceRepo.findUnsynchronizedTerminalRuns(50);

    for (const item of outOfSync) {
      try {
        if (item.run_status === RunStatus.COMPLETED) {
          await this.occurrenceRepo.updateStatus(item.id, OccurrenceStatus.COMPLETED, {
            completed_at: now,
          });
          terminalReconciled++;
        } else if (item.run_status === RunStatus.CANCELLED) {
          await this.occurrenceRepo.updateStatus(item.id, OccurrenceStatus.CANCELLED, {
            completed_at: now,
            error_message: item.run_error ?? 'Research run cancelled',
          });
          terminalReconciled++;
        } else if (item.run_status === RunStatus.FAILED) {
          await this.occurrenceRepo.updateStatus(item.id, OccurrenceStatus.FAILED, {
            completed_at: now,
            error_message: item.run_error ?? 'Research run failed',
          });
          terminalReconciled++;
        }
      } catch (syncErr) {
        logger.warn('RECOVERY_OCCURRENCE_SYNC_ERROR', 'Failed to synchronize terminal run to occurrence', {
          occurrenceId: item.id,
          runId: item.research_run_id,
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }

    return {
      stuckChecked: stuckList.length,
      stuckReconciled,
      terminalChecked: outOfSync.length,
      terminalReconciled,
    };
  }
}

