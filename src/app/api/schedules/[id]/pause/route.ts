import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchScheduleRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { ScheduleLifecycleService } from '@/server/schedules';
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
 * POST /api/schedules/[id]/pause
 * Pauses a recurring research schedule.
 */
export async function POST(
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
    const updated = await lifecycleService.pause(id, userId);
    return NextResponse.json({
      schedule: updated,
      message: 'Schedule paused successfully',
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to pause schedule' },
      { status: 500 }
    );
  }
}

