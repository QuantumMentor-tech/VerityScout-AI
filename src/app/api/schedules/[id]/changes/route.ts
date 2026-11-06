import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchScheduleRepository,
  ResearchComparisonRepository,
  ChangeEventRepository,
} from '@/server/persistence/repositories';
import { AppError } from '@/lib/errors/app-error';

const scheduleRepo = new ResearchScheduleRepository();
const comparisonRepo = new ResearchComparisonRepository();
const changeEventRepo = new ChangeEventRepository();

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/schedules/[id]/changes
 * Lists detected change history and comparisons for a recurring research schedule.
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

  try {
    // 1. Verify schedule exists and belongs to user
    const schedule = await scheduleRepo.findById(id, userId);
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found or access denied' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100);
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1);

    // 2. Fetch comparisons for this schedule
    const comparisonsResult = await comparisonRepo.listByScheduleId(id, userId, {
      limit,
      page,
    });

    // 3. If there is a latest comparison, fetch its change events
    const latestComparison = comparisonsResult.data[0] ?? null;
    let latestChanges: unknown[] = [];

    if (latestComparison) {
      latestChanges = await changeEventRepo.listByComparisonId(latestComparison.id, userId);
    }

    return NextResponse.json({
      scheduleId: id,
      latestComparison,
      latestChanges,
      comparisons: comparisonsResult.data,
      pagination: comparisonsResult.pagination,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

