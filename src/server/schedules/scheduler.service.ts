import 'server-only';
import {
  ResearchScheduleRepository,
  ResearchRunRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { withTransaction } from '@/server/persistence/transaction';
import { IResearchJobQueue } from '@/server/queue/queue.types';
import { getResearchJobQueue } from '@/server/queue';
import { RunStatus, RunStage, ResearchScheduleRow, OccurrenceStatus } from '@/server/persistence/types';
import { RecurrenceService } from './recurrence.service';
import { RecurrenceRule, ScheduleRequestSnapshot } from './recurrence.types';
import { logger } from '@/lib/logging/logger';

export interface SchedulerServiceOptions {
  readonly scheduleRepo?: ResearchScheduleRepository | undefined;
  readonly runRepo?: ResearchRunRepository | undefined;
  readonly occurrenceRepo?: ScheduleOccurrenceRepository | undefined;
  readonly queue?: IResearchJobQueue | undefined;
}

export interface DueEvaluationSummary {
  readonly evaluatedCount: number;
  readonly dispatchedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly durationMs: number;
}

export class ResearchSchedulerService {
  private readonly scheduleRepo: ResearchScheduleRepository;
  private readonly runRepo: ResearchRunRepository;
  private readonly occurrenceRepo: ScheduleOccurrenceRepository;
  private readonly queue: IResearchJobQueue;

  constructor(options?: SchedulerServiceOptions) {
    this.scheduleRepo = options?.scheduleRepo ?? new ResearchScheduleRepository();
    this.runRepo = options?.runRepo ?? new ResearchRunRepository();
    this.occurrenceRepo = options?.occurrenceRepo ?? new ScheduleOccurrenceRepository();
    this.queue = options?.queue ?? getResearchJobQueue();
  }

  /**
   * Evaluates all active schedules due on or before referenceDate (defaults to now).
   * Dispatches eligible jobs through the persistent research queue and advances next_run_at.
   */
  async evaluateAndDispatchDueSchedules(
    referenceDate: Date = new Date(),
    batchLimit: number = 50
  ): Promise<DueEvaluationSummary> {
    const startTime = Date.now();
    let dispatchedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    const dueSchedules = await this.scheduleRepo.listActiveDue(referenceDate, batchLimit);

    if (dueSchedules.length === 0) {
      return {
        evaluatedCount: 0,
        dispatchedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    logger.info('SCHEDULE_DUE_DETECTED', `Found ${dueSchedules.length} active due schedule(s) for execution`, {
      dueCount: dueSchedules.length,
      cutoff: referenceDate.toISOString(),
    });

    for (const schedule of dueSchedules) {
      try {
        const dispatched = await this.dispatchSingleSchedule(schedule, referenceDate);
        if (dispatched) {
          dispatchedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        failedCount++;
        logger.error('SCHEDULE_DISPATCH_FAILED', 'Failed to dispatch due schedule', {
          scheduleId: schedule.id,
          userId: schedule.user_id,
          error: err instanceof Error ? err.message : String(err),
        });

        // Record execution failure count to prevent infinite loops
        try {
          await this.scheduleRepo.updateExecution(schedule.id, referenceDate, null, true);
        } catch {
          // Non-fatal logging
        }
      }
    }

    return {
      evaluatedCount: dueSchedules.length,
      dispatchedCount,
      failedCount,
      skippedCount,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Safely dispatches a single due schedule within a transaction.
   */
  private async dispatchSingleSchedule(
    schedule: ResearchScheduleRow,
    referenceDate: Date
  ): Promise<boolean> {
    // 1. Parse request snapshot and recurrence rule
    const snapshot = (schedule.request_snapshot as ScheduleRequestSnapshot | null) ?? null;
    const recurrenceRule = (schedule.recurrence_rule as RecurrenceRule | null) ?? null;

    if (!snapshot || !snapshot.query) {
      logger.warn('SCHEDULE_SKIPPED_INVALID_SNAPSHOT', 'Schedule skipped due to missing request snapshot', {
        scheduleId: schedule.id,
      });
      return false;
    }

    if (!recurrenceRule) {
      logger.warn('SCHEDULE_SKIPPED_NO_RECURRENCE', 'Schedule skipped due to missing recurrence rule', {
        scheduleId: schedule.id,
      });
      return false;
    }

    // 2. Calculate the next future execution instant relative to referenceDate
    const nextRunResult = RecurrenceService.calculateNextRun(
      recurrenceRule,
      schedule.timezone,
      referenceDate
    );

    const nextRunDate = nextRunResult ? nextRunResult.nextRunAt : null;
    const scheduledAt = new Date(schedule.next_run_at);

    // 3. Idempotently create or retrieve the schedule occurrence record
    const occurrence = await this.occurrenceRepo.createOrGet({
      schedule_id: schedule.id,
      user_id: schedule.user_id,
      schedule_revision: schedule.revision ?? 1,
      scheduled_at: scheduledAt,
      status: OccurrenceStatus.PLANNED,
    });

    // Check if this occurrence was already dispatched or is in terminal state
    if (
      occurrence.status === OccurrenceStatus.DISPATCHED ||
      occurrence.status === OccurrenceStatus.RUNNING ||
      occurrence.status === OccurrenceStatus.COMPLETED ||
      occurrence.status === OccurrenceStatus.FAILED
    ) {
      logger.info('SCHEDULE_OCCURRENCE_ALREADY_DISPATCHED', 'Occurrence already dispatched in prior cycle; advancing schedule pointer', {
        scheduleId: schedule.id,
        occurrenceId: occurrence.id,
        status: occurrence.status,
      });
      await this.scheduleRepo.claimAndAdvance(
        schedule.id,
        nextRunDate,
        occurrence.research_run_id ?? schedule.last_run_id ?? ''
      );
      return false;
    }

    if (
      occurrence.status === OccurrenceStatus.SKIPPED ||
      occurrence.status === OccurrenceStatus.CANCELLED
    ) {
      logger.info('SCHEDULE_OCCURRENCE_SKIPPED', 'Occurrence was skipped or cancelled; advancing schedule pointer', {
        scheduleId: schedule.id,
        occurrenceId: occurrence.id,
        status: occurrence.status,
      });
      await this.scheduleRepo.claimAndAdvance(
        schedule.id,
        nextRunDate,
        schedule.last_run_id ?? ''
      );
      return false;
    }

    // 4. Mark occurrence as DISPATCHING while submitting to queue
    await this.occurrenceRepo.updateStatus(occurrence.id, OccurrenceStatus.DISPATCHING);

    // 5. Atomically create child run, enqueue persistent job, link occurrence, and advance schedule
    try {
      const result = await withTransaction(async (tx) => {
        // Create child research run
        const run = await this.runRepo.create(
          {
            task_id: schedule.task_id,
            user_id: schedule.user_id,
            status: RunStatus.QUEUED,
            current_stage: RunStage.INITIATED,
            schedule_id: schedule.id,
          },
          tx
        );

        // Enqueue job into persistent queue with occurrence metadata
        const jobId = await this.queue.enqueue(
          {
            runId: run.id,
            taskId: schedule.task_id,
            userId: schedule.user_id,
            query: snapshot.query,
            taskType: snapshot.taskType,
            constraints: snapshot.constraints,
            limits: snapshot.limits,
            modelPolicy: snapshot.modelPolicy,
            metadata: {
              scheduleId: schedule.id,
              occurrenceId: occurrence.id,
              scheduleName: schedule.name,
              scheduledTime: schedule.scheduled_time,
              timezone: schedule.timezone,
            },
          },
          { tx }
        );

        // Update occurrence with run linkage and DISPATCHED state
        await this.occurrenceRepo.updateStatus(
          occurrence.id,
          OccurrenceStatus.DISPATCHED,
          {
            research_run_id: run.id,
            queue_job_id: jobId,
            dispatched_at: new Date(),
          },
          tx
        );

        // Advance schedule next_run_at and update last_dispatched_at
        const updatedSchedule = await this.scheduleRepo.claimAndAdvance(
          schedule.id,
          nextRunDate,
          run.id,
          tx
        );

        return { run, jobId, updatedSchedule };
      });

      logger.info('SCHEDULE_RUN_DISPATCHED', 'Recurring research run dispatched to persistent queue', {
        scheduleId: schedule.id,
        occurrenceId: occurrence.id,
        runId: result.run.id,
        jobId: result.jobId,
        nextRunAt: nextRunDate ? nextRunDate.toISOString() : 'ENDED',
        timezone: schedule.timezone,
      });

      return true;
    } catch (dispatchErr) {
      // Reconcile occurrence status on dispatch failure
      try {
        await this.occurrenceRepo.updateStatus(
          occurrence.id,
          OccurrenceStatus.RECONCILIATION_REQUIRED,
          {
            error_message: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
          }
        );
      } catch {
        // Non-fatal logging
      }
      throw dispatchErr;
    }
  }
}

