import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ResearchRunRepository } from '@/server/persistence/repositories';
import { logger } from '@/lib/logging/logger';

const runRepo = new ResearchRunRepository();

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

/**
 * GET /api/research/runs/[runId]
 * Returns run status, current stage, telemetry counters, and lifecycle timestamps.
 * Strictly enforces owner isolation.
 */
export async function GET(_req: NextRequest, context: RouteContext): Promise<NextResponse> {
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

    return NextResponse.json(
      {
        id: run.id,
        taskId: run.task_id,
        status: run.status,
        currentStage: run.current_stage,
        stageCounters: run.stage_counters,
        usage: run.usage,
        selectedProvider: run.selected_provider,
        selectedModel: run.selected_model,
        errorMessage: run.error_message,
        cancellationReason: run.cancellation_reason,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('RESEARCH_RUN_GET_FAILED', 'Failed to retrieve research run status', {
      runId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to retrieve research run' }, { status: 500 });
  }
}

