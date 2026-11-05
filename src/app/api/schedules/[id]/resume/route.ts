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
 * POST /api/schedules/[id]/resume
 * Resumes an active recurring research schedule.
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
    const updated = await lifecycleService.resume(id, userId);
    return NextResponse.json({
      schedule: updated,
      message: 'Schedule resumed successfully',
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to resume schedule' },
      { status: 500 }
    );
  }
}

