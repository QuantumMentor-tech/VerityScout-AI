import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchRunRepository,
  ProgressEventRepository,
} from '@/server/persistence/repositories';
import { logger } from '@/lib/logging/logger';

const runRepo = new ResearchRunRepository();
const progressRepo = new ProgressEventRepository();

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

/**
 * GET /api/research/runs/[runId]/progress
 * Returns durable progress snapshot, current stage percentage, stage counters,
 * and the chronological audit trail of progress events.
 * Strictly enforces owner isolation.
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
    const run = await runRepo.findById(runId, userId);
    if (!run) {
      return NextResponse.json({ error: 'Research run not found' }, { status: 404 });
    }

    const events = await progressRepo.listByRunId(runId, userId);

    return NextResponse.json(
      {
        runId: run.id,
        taskId: run.task_id,
        status: run.status,
        currentStage: run.current_stage,
        progressPercent: run.progress_percent ?? 0,
        stageCounters: run.stage_counters,
        executionDurationMs: run.execution_duration_ms ?? null,
        errorMessage: run.error_message,
        cancellationReason: run.cancellation_reason,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        events: events.map((e) => ({
          id: e.id,
          stage: e.stage,
          eventType: e.event_type,
          sequenceNumber: e.sequence_number,
          message: e.message,
          metadata: e.metadata,
          createdAt: e.created_at,
        })),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('RESEARCH_RUN_PROGRESS_FAILED', 'Failed to retrieve research run progress', {
      runId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to retrieve research run progress' }, { status: 500 });
  }
}

