import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchRunRepository,
  ResearchComparisonRepository,
  ChangeEventRepository,
} from '@/server/persistence/repositories';
import { AppError } from '@/lib/errors/app-error';

const runRepo = new ResearchRunRepository();
const comparisonRepo = new ResearchComparisonRepository();
const changeEventRepo = new ChangeEventRepository();

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

/**
 * GET /api/research/runs/[runId]/changes
 * Retrieves change detection comparison and delta events for a specific research run.
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

  const { runId } = await context.params;

  try {
    // 1. Verify run exists and belongs to user
    const run = await runRepo.findById(runId, userId);
    if (!run) {
      return NextResponse.json(
        { error: 'Research run not found or access denied' },
        { status: 404 }
      );
    }

    // 2. Fetch change events for this run
    const events = await changeEventRepo.listByRunId(runId, userId);

    // 3. Look up parent comparison record if available
    let comparison = null;
    if (events.length > 0 && events[0]?.comparison_id) {
      comparison = await comparisonRepo.findById(events[0].comparison_id, userId);
    }

    return NextResponse.json({
      runId,
      comparison,
      changes: events,
      totalChanges: events.length,
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

