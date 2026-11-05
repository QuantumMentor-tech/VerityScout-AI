import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchTaskRepository,
  ResearchScheduleRepository,
} from '@/server/persistence/repositories';
import { withTransaction } from '@/server/persistence/transaction';
import { TaskType, ScheduleStatus } from '@/server/persistence/types';
import {
  RecurrenceService,
  isValidIanaTimezone,
  RecurrenceRule,
  ScheduleRequestSnapshot,
  RECURRENCE_RULE_VERSION,
} from '@/server/schedules';
import { logger } from '@/lib/logging/logger';

const RecurrenceRuleSchema = z.object({
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in 24-hour HH:mm format'),
  interval: z.number().int().min(1).max(365).optional().default(1),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  monthBoundaryPolicy: z.enum(['CLAMP_TO_LAST_DAY', 'SKIP_MONTH']).optional().default('CLAMP_TO_LAST_DAY'),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

const CreateScheduleSchema = z.object({
  query: z.string().trim().min(3, 'Query must be at least 3 characters').max(2000, 'Query exceeds 2,000 character limit'),
  name: z.string().trim().max(255).optional(),
  taskType: z.enum(['PRODUCT_RESEARCH', 'GENERAL_RESEARCH', 'PRICE_MONITOR', 'SPEC_VERIFICATION']).optional().default('PRODUCT_RESEARCH'),
  constraints: z.record(z.string(), z.unknown()).optional(),
  limits: z.record(z.string(), z.unknown()).optional(),
  modelPolicy: z.record(z.string(), z.unknown()).optional(),
  recurrence: RecurrenceRuleSchema,
  timezone: z.string().trim().min(1, 'Timezone is required'),
});

const taskRepo = new ResearchTaskRepository();
const scheduleRepo = new ResearchScheduleRepository();

/**
 * POST /api/schedules
 * Creates and persists a recurring research schedule.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = CreateScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { query, name, taskType, constraints, limits, modelPolicy, recurrence, timezone } = parsed.data;

  // Validate timezone
  if (!isValidIanaTimezone(timezone)) {
    return NextResponse.json(
      { error: `Invalid IANA timezone identifier: "${timezone}"` },
      { status: 400 }
    );
  }

  // Validate recurrence rule
  const rule: RecurrenceRule = {
    frequency: recurrence.frequency,
    time: recurrence.time,
    interval: recurrence.interval,
    weekdays: recurrence.weekdays,
    dayOfMonth: recurrence.dayOfMonth,
    monthBoundaryPolicy: recurrence.monthBoundaryPolicy,
    startDate: recurrence.startDate,
    endDate: recurrence.endDate,
    version: RECURRENCE_RULE_VERSION,
  };

  try {
    RecurrenceService.validateRule(rule);
  } catch (valErr) {
    return NextResponse.json(
      { error: valErr instanceof Error ? valErr.message : 'Invalid recurrence rule' },
      { status: 400 }
    );
  }

  // Calculate first eligible next_run_at
  const nextRunResult = RecurrenceService.calculateNextRun(rule, timezone);
  if (!nextRunResult) {
    return NextResponse.json(
      { error: 'Recurrence rule does not yield any upcoming execution instant' },
      { status: 400 }
    );
  }

  const cronExpression = RecurrenceService.toCronExpression(rule);
  const snapshot: ScheduleRequestSnapshot = {
    query,
    title: name ?? query.slice(0, 100),
    taskType,
    constraints,
    limits,
    modelPolicy,
  };

  try {
    const result = await withTransaction(async (tx) => {
      // 1. Create parent research task template
      const task = await taskRepo.create(
        {
          user_id: userId,
          title: name ?? query.slice(0, 100),
          original_query: query,
          task_type: taskType as TaskType,
          constraints,
          limits,
          model_policy: modelPolicy,
        },
        tx
      );

      // 2. Create schedule definition
      const schedule = await scheduleRepo.create(
        {
          task_id: task.id,
          user_id: userId,
          name: name ?? query.slice(0, 100),
          cron_expression: cronExpression,
          recurrence_rule: rule as unknown as Record<string, unknown>,
          scheduled_time: rule.time,
          request_snapshot: snapshot as unknown as Record<string, unknown>,
          timezone,
          status: ScheduleStatus.ACTIVE,
          next_run_at: nextRunResult.nextRunAt,
        },
        tx
      );

      return { schedule, task };
    });

    logger.info('RESEARCH_SCHEDULE_CREATED', 'Recurring research schedule created successfully', {
      scheduleId: result.schedule.id,
      userId,
      timezone,
      nextRunAt: nextRunResult.isoString,
      frequency: rule.frequency,
    });

    return NextResponse.json(
      {
        schedule: result.schedule,
        nextRun: nextRunResult,
        description: RecurrenceService.describeRule(rule, timezone),
      },
      { status: 201 }
    );
  } catch (persistErr) {
    logger.error('RESEARCH_SCHEDULE_CREATION_FAILED', 'Failed to persist research schedule', {
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      userId,
    });
    return NextResponse.json(
      { error: 'Failed to create research schedule due to database error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/schedules
 * Lists all recurring schedules owned by the authenticated caller.
 */
export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const schedules = await scheduleRepo.listByOwner(userId);
    const enriched = schedules.map((s) => {
      const rule = (s.recurrence_rule as RecurrenceRule | null) ?? null;
      return {
        ...s,
        description: rule ? RecurrenceService.describeRule(rule, s.timezone) : `${s.cron_expression} (${s.timezone})`,
      };
    });

    return NextResponse.json({ schedules: enriched });
  } catch (err) {
    logger.error('RESEARCH_SCHEDULE_LIST_FAILED', 'Failed to list research schedules', {
      error: err instanceof Error ? err.message : String(err),
      userId,
    });
    return NextResponse.json(
      { error: 'Failed to retrieve research schedules' },
      { status: 500 }
    );
  }
}

