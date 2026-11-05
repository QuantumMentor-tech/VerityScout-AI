import 'server-only';
import {
  ResearchScheduleRepository,
  ScheduleOccurrenceRepository,
  ListOccurrencesOptions,
} from '@/server/persistence/repositories';
import { withTransaction } from '@/server/persistence/transaction';
import {
  ScheduleStatus,
  ResearchScheduleRow,
  ScheduleOccurrenceRow,
  TaskType,
} from '@/server/persistence/types';
import { RecurrenceService } from './recurrence.service';
import { isValidIanaTimezone } from './timezone.utils';
import {
  RecurrenceRule,
  ScheduleRequestSnapshot,
  RECURRENCE_RULE_VERSION,
} from './recurrence.types';
import { AppError } from '@/lib/errors/app-error';
import { logger } from '@/lib/logging/logger';

export interface EditScheduleInput {
  readonly name?: string | null | undefined;
  readonly query?: string | undefined;
  readonly taskType?: TaskType | undefined;
  readonly constraints?: Record<string, unknown> | undefined;
  readonly limits?: Record<string, unknown> | undefined;
  readonly modelPolicy?: Record<string, unknown> | undefined;
  readonly recurrence?: RecurrenceRule | undefined;
  readonly timezone?: string | undefined;
  readonly expectedRevision?: number | undefined;
}

export interface ScheduleLifecycleOptions {
  readonly scheduleRepo?: ResearchScheduleRepository | undefined;
  readonly occurrenceRepo?: ScheduleOccurrenceRepository | undefined;
}

export class ScheduleLifecycleService {
  private readonly scheduleRepo: ResearchScheduleRepository;
  private readonly occurrenceRepo: ScheduleOccurrenceRepository;

  constructor(options?: ScheduleLifecycleOptions) {
    this.scheduleRepo = options?.scheduleRepo ?? new ResearchScheduleRepository();
    this.occurrenceRepo = options?.occurrenceRepo ?? new ScheduleOccurrenceRepository();
  }

  /**
   * Pauses an active schedule, preventing future occurrences from dispatching.
   * Marks undispatched pending occurrences as SKIPPED. Does NOT cancel in-flight running research.
   */
  async pause(scheduleId: string, userId: string): Promise<ResearchScheduleRow> {
    const schedule = await this.scheduleRepo.findById(scheduleId, userId);
    if (!schedule) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Research schedule not found',
        statusCode: 404,
      });
    }

    if (schedule.status === ScheduleStatus.PAUSED) {
      return schedule;
    }

    if (schedule.status === ScheduleStatus.ARCHIVED || schedule.status === ScheduleStatus.RETIRED) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Cannot pause an archived or retired schedule',
        statusCode: 400,
      });
    }

    const updated = await withTransaction(async (tx) => {
      // Invalidate any planned occurrences not yet dispatched
      await this.occurrenceRepo.markPendingAsSkippedForSchedule(
        scheduleId,
        'Schedule paused by user',
        tx
      );

      const res = await this.scheduleRepo.updateStatus(
        scheduleId,
        ScheduleStatus.PAUSED,
        userId,
        undefined,
        tx
      );

      if (!res) {
        throw new AppError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update schedule status to PAUSED',
          statusCode: 500,
        });
      }

      return res;
    });

    logger.info('SCHEDULE_PAUSED', 'Recurring research schedule paused', {
      scheduleId,
      userId,
      revision: updated.revision,
    });

    return updated;
  }

  /**
   * Resumes a paused schedule, recalculating next_run_at relative to current time.
   * Strictly adheres to the bounded missed-run policy (at most 1 upcoming run).
   */
  async resume(scheduleId: string, userId: string): Promise<ResearchScheduleRow> {
    const schedule = await this.scheduleRepo.findById(scheduleId, userId);
    if (!schedule) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Research schedule not found',
        statusCode: 404,
      });
    }

    if (schedule.status === ScheduleStatus.ACTIVE) {
      return schedule;
    }

    if (schedule.status === ScheduleStatus.ARCHIVED || schedule.status === ScheduleStatus.RETIRED) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Cannot resume an archived or retired schedule',
        statusCode: 400,
      });
    }

    const recurrence = (schedule.recurrence_rule as RecurrenceRule | null) ?? null;
    if (!recurrence) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Schedule lacks recurrence rule definition',
        statusCode: 500,
      });
    }

    const nextRunResult = RecurrenceService.calculateNextRun(
      recurrence,
      schedule.timezone,
      new Date()
    );

    const nextRunAt = nextRunResult ? nextRunResult.nextRunAt : null;

    const updated = await withTransaction(async (tx) => {
      const res = await this.scheduleRepo.updateStatus(
        scheduleId,
        ScheduleStatus.ACTIVE,
        userId,
        nextRunAt,
        tx
      );

      if (!res) {
        throw new AppError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resume schedule',
          statusCode: 500,
        });
      }

      return res;
    });

    logger.info('SCHEDULE_RESUMED', 'Recurring research schedule resumed', {
      scheduleId,
      userId,
      nextRunAt: nextRunAt ? nextRunAt.toISOString() : 'ENDED',
      revision: updated.revision,
    });

    return updated;
  }

  /**
   * Safely edits schedule definition fields, creates a new revision, supersedes old pending
   * occurrences, and recalculates next_run_at when recurrence rules or timezones change.
   */
  async edit(
    scheduleId: string,
    userId: string,
    input: EditScheduleInput
  ): Promise<ResearchScheduleRow> {
    const schedule = await this.scheduleRepo.findById(scheduleId, userId);
    if (!schedule) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Research schedule not found',
        statusCode: 404,
      });
    }

    if (schedule.status === ScheduleStatus.ARCHIVED || schedule.status === ScheduleStatus.RETIRED) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Cannot edit an archived or retired schedule',
        statusCode: 400,
      });
    }

    // Optimistic concurrency check
    if (input.expectedRevision !== undefined && schedule.revision !== input.expectedRevision) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `Conflict: Schedule revision mismatch. Current revision is ${schedule.revision}, expected ${input.expectedRevision}.`,
        statusCode: 409,
      });
    }

    const timezone = input.timezone ?? schedule.timezone;
    if (input.timezone && !isValidIanaTimezone(timezone)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: `Invalid IANA timezone identifier: "${timezone}"`,
        statusCode: 400,
      });
    }

    let recurrenceRule = (schedule.recurrence_rule as RecurrenceRule | null) ?? null;
    let scheduledTime = schedule.scheduled_time;
    let cronExpression = schedule.cron_expression;

    if (input.recurrence) {
      const ruleToValidate: RecurrenceRule = {
        ...input.recurrence,
        version: RECURRENCE_RULE_VERSION,
      };
      RecurrenceService.validateRule(ruleToValidate);
      recurrenceRule = ruleToValidate;
      scheduledTime = input.recurrence.time;
      cronExpression = RecurrenceService.toCronExpression(ruleToValidate);
    }

    // Merge request snapshot
    const existingSnapshot = (schedule.request_snapshot as ScheduleRequestSnapshot | null) ?? {
      query: '',
      taskType: 'PRODUCT_RESEARCH',
    };

    const newSnapshot: ScheduleRequestSnapshot = {
      query: input.query ?? existingSnapshot.query,
      taskType: input.taskType ?? existingSnapshot.taskType,
      constraints: input.constraints ?? existingSnapshot.constraints,
      limits: input.limits ?? existingSnapshot.limits,
      modelPolicy: input.modelPolicy ?? existingSnapshot.modelPolicy,
    };

    // Recalculate next run instant
    let nextRunAt: Date | null = schedule.next_run_at ? new Date(schedule.next_run_at) : null;
    if (recurrenceRule && (input.recurrence || input.timezone)) {
      const nextRunResult = RecurrenceService.calculateNextRun(
        recurrenceRule,
        timezone,
        new Date()
      );
      nextRunAt = nextRunResult ? nextRunResult.nextRunAt : null;
    }

    const newRevision = schedule.revision + 1;

    const updated = await withTransaction(async (tx) => {
      // Supersede old pending occurrences for this schedule
      await this.occurrenceRepo.markPendingAsSkippedForSchedule(
        scheduleId,
        `Superseded by schedule revision ${newRevision}`,
        tx
      );

      const res = await this.scheduleRepo.updateDefinition(
        scheduleId,
        {
          name: input.name !== undefined ? input.name : schedule.name,
          cron_expression: cronExpression,
          recurrence_rule: recurrenceRule as Record<string, unknown> | null,
          scheduled_time: scheduledTime,
          request_snapshot: newSnapshot as unknown as Record<string, unknown>,
          timezone,
          next_run_at: nextRunAt,
          expectedRevision: input.expectedRevision,
          userId,
        },
        tx
      );

      if (!res) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: 'Concurrent update conflict while saving schedule changes',
          statusCode: 409,
        });
      }

      return res;
    });

    logger.info('SCHEDULE_EDITED', 'Schedule definition updated to new revision', {
      scheduleId,
      userId,
      oldRevision: schedule.revision,
      newRevision: updated.revision,
      nextRunAt: nextRunAt ? nextRunAt.toISOString() : 'ENDED',
    });

    return updated;
  }

  /**
   * Safely retires (soft-deletes) a schedule.
   * Cancels future recurrence, supersedes planned occurrences, and preserves historical runs.
   */
  async retire(scheduleId: string, userId: string): Promise<ResearchScheduleRow> {
    const schedule = await this.scheduleRepo.findById(scheduleId, userId);
    if (!schedule) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Research schedule not found',
        statusCode: 404,
      });
    }

    if (schedule.status === ScheduleStatus.ARCHIVED || schedule.status === ScheduleStatus.RETIRED) {
      return schedule;
    }

    const updated = await withTransaction(async (tx) => {
      // Invalidate planned occurrences
      await this.occurrenceRepo.markPendingAsSkippedForSchedule(
        scheduleId,
        'Schedule retired/archived by user',
        tx
      );

      const res = await this.scheduleRepo.retire(scheduleId, userId, tx);
      if (!res) {
        throw new AppError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retire schedule',
          statusCode: 500,
        });
      }
      return res;
    });

    logger.info('SCHEDULE_RETIRED', 'Schedule retired and future occurrences cancelled', {
      scheduleId,
      userId,
      revision: updated.revision,
    });

    return updated;
  }

  /**
   * Lists occurrence history for a schedule with tenant authorization.
   */
  async listOccurrences(
    scheduleId: string,
    userId: string,
    options?: ListOccurrencesOptions
  ): Promise<{ occurrences: ScheduleOccurrenceRow[]; total: number }> {
    const schedule = await this.scheduleRepo.findById(scheduleId, userId);
    if (!schedule) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Research schedule not found',
        statusCode: 404,
      });
    }

    const [occurrences, total] = await Promise.all([
      this.occurrenceRepo.listByScheduleId(scheduleId, userId, options),
      this.occurrenceRepo.countByScheduleId(scheduleId, userId, options?.status),
    ]);

    return { occurrences, total };
  }
}
