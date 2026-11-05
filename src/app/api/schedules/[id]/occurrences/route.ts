import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchScheduleRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { ScheduleLifecycleService } from '@/server/schedules';
import { OccurrenceStatus } from '@/server/persistence/types';
import { AppError } from '@/lib/errors/app-error';

const scheduleRepo = new ResearchScheduleRepository();
const occurrenceRepo = new ScheduleOccurrenceRepository();
const lifecycleService = new ScheduleLifecycleService({ scheduleRepo, occurrenceRepo });

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/schedules/[id]/occurrences
 * Lists occurrence execution history for a schedule with tenant authorization.
 */
export async function GET(
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

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') as OccurrenceStatus | null;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  const validStatuses = Object.values(OccurrenceStatus);
  const statusFilter = statusParam && validStatuses.includes(statusParam) ? statusParam : undefined;

  try {
    const result = await lifecycleService.listOccurrences(id, userId, {
      status: statusFilter,
      limit,
      offset,
    });

    return NextResponse.json({
      occurrences: result.occurrences,
      total: result.total,
      limit,
      offset,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to retrieve occurrences' },
      { status: 500 }
    );
  }
}

