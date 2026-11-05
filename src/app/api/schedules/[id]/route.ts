import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchScheduleRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import {
  RecurrenceService,
  ScheduleLifecycleService,
} from '@/server/schedules';
import { RecurrenceRule } from '@/server/schedules/recurrence.types';
import { TaskType } from '@/server/persistence/types';
import { AppError } from '@/lib/errors/app-error';

const scheduleRepo = new ResearchScheduleRepository();
const occurrenceRepo = new ScheduleOccurrenceRepository();
const lifecycleService = new ScheduleLifecycleService({ scheduleRepo, occurrenceRepo });

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

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

const EditScheduleSchema = z.object({
  name: z.string().trim().max(255).optional().nullable(),
  query: z.string().trim().min(3).max(2000).optional(),
  taskType: z.enum(['PRODUCT_RESEARCH', 'GENERAL_RESEARCH', 'PRICE_MONITOR', 'SPEC_VERIFICATION']).optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
  limits: z.record(z.string(), z.unknown()).optional(),
  modelPolicy: z.record(z.string(), z.unknown()).optional(),
  recurrence: RecurrenceRuleSchema.optional(),
  timezone: z.string().trim().min(1).optional(),
  expectedRevision: z.number().int().min(1).optional(),
});

/**
 * GET /api/schedules/[id]
 * Retrieves details for a specific schedule with strict tenant isolation.
 */
export async function GET(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const schedule = await scheduleRepo.findById(id, userId);
    if (!schedule) {
      return NextResponse.json({ error: 'Research schedule not found' }, { status: 404 });
    }

    let occurrencesCount = 0;
    try {
      occurrencesCount = await occurrenceRepo.countByScheduleId(id, userId);
    } catch {
      // Non-fatal fallback for occurrence count
    }

    const rule = (schedule.recurrence_rule as RecurrenceRule | null) ?? null;
    const description = rule
      ? RecurrenceService.describeRule(rule, schedule.timezone)
      : `${schedule.cron_expression} (${schedule.timezone})`;

    return NextResponse.json({
      schedule: {
        ...schedule,
        occurrences_count: occurrencesCount,
        description,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve schedule' }, { status: 500 });
  }
}

/**
 * PATCH /api/schedules/[id]
 * Edits an existing schedule definition, creates a new revision, and updates recurrence.
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = EditScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const updated = await lifecycleService.edit(id, userId, {
      name: parsed.data.name,
      query: parsed.data.query,
      taskType: parsed.data.taskType as TaskType | undefined,
      constraints: parsed.data.constraints,
      limits: parsed.data.limits,
      modelPolicy: parsed.data.modelPolicy,
      recurrence: parsed.data.recurrence as RecurrenceRule | undefined,
      timezone: parsed.data.timezone,
      expectedRevision: parsed.data.expectedRevision,
    });

    return NextResponse.json({
      schedule: updated,
      message: 'Schedule definition updated successfully',
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update schedule' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/schedules/[id]
 * Retires (soft-deletes) a schedule, preserving all historical runs, occurrences, and evidence.
 */
export async function DELETE(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const retired = await lifecycleService.retire(id, userId);
    return NextResponse.json({
      schedule: retired,
      message: 'Schedule successfully retired; historical executions preserved',
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to retire schedule' },
      { status: 500 }
    );
  }
}
