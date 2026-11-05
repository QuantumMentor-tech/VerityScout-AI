import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchRunRepository,
  ProgressEventRepository,
} from '@/server/persistence/repositories';
import { getResearchJobQueue } from '@/server/queue';
import { RunStatus } from '@/server/persistence/types';
import { logger } from '@/lib/logging/logger';

const runRepo = new ResearchRunRepository();
const progressRepo = new ProgressEventRepository();

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

/**
 * POST /api/research/runs/[runId]/cancel
 * Safely requests cooperative cancellation of a queued or running research run.
 * Strictly verifies ownership and prevents race-condition modification of completed runs.
 */
export async function POST(
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

  const { runId } = await context.params;

  try {
    const run = await runRepo.findById(runId, userId);
    if (!run) {
      return NextResponse.json({ error: 'Research run not found' }, { status: 404 });
    }

    // Check terminal states
    if (run.status === RunStatus.COMPLETED) {
      return NextResponse.json(
        { error: 'Cannot cancel a completed research run', status: run.status },
        { status: 409 }
      );
    }

    if (run.status === RunStatus.FAILED) {
      return NextResponse.json(
        { error: 'Cannot cancel a failed research run', status: run.status },
        { status: 409 }
      );
    }

    if (run.status === RunStatus.CANCELLED) {
      return NextResponse.json(
        {
          success: true,
          runId,
          status: RunStatus.CANCELLED,
          message: 'Research run is already cancelled',
        },
        { status: 200 }
      );
    }

    if (run.status === RunStatus.CANCELLATION_REQUESTED) {
      return NextResponse.json(
        {
          success: true,
          runId,
          status: RunStatus.CANCELLATION_REQUESTED,
          message: 'Cancellation is already in progress',
        },
        { status: 200 }
      );
    }

    // Parse optional reason from request body
    let reason = 'Cancelled by user request';
    try {
      const body = await req.json();
      if (body?.reason && typeof body.reason === 'string') {
        reason = body.reason.slice(0, 255);
      }
    } catch {
      // Body is optional
    }

    // Queued run: immediately cancel in both DB and queue
    if (run.status === RunStatus.QUEUED) {
      await runRepo.updateStatus(
        runId,
        RunStatus.CANCELLED,
        run.current_stage,
        {
          completed_at: new Date(),
          error_message: reason,
        },
        userId
      );

      const queue = getResearchJobQueue();
      const job = await queue.getJobByRunId(runId);
      if (job) {
        await queue.cancelJob(job.id, runId, reason);
      }

      await progressRepo.create({
        run_id: runId,
        user_id: userId,
        stage: run.current_stage,
        event_type: 'CANCELLED',
        message: `Research run cancelled while queued: ${reason}`,
      });

      logger.info('RESEARCH_RUN_CANCELLED_QUEUED', 'Queued research run cancelled immediately', {
        runId,
        userId,
        reason,
      });

      return NextResponse.json(
        {
          success: true,
          runId,
          status: RunStatus.CANCELLED,
          message: 'Research run was cancelled while queued',
        },
        { status: 200 }
      );
    }

    // Running run: request cooperative cancellation
    await runRepo.updateStatus(
      runId,
      RunStatus.CANCELLATION_REQUESTED,
      run.current_stage,
      {
        error_message: reason,
      },
      userId
    );

    await progressRepo.create({
      run_id: runId,
      user_id: userId,
      stage: run.current_stage,
      event_type: 'CANCELLATION_REQUESTED',
      message: `Cancellation requested by user: ${reason}`,
    });

    logger.info('RESEARCH_RUN_CANCEL_REQUESTED', 'Cancellation requested for running pipeline', {
      runId,
      userId,
      stage: run.current_stage,
      reason,
    });

    return NextResponse.json(
      {
        success: true,
        runId,
        status: RunStatus.CANCELLATION_REQUESTED,
        message: 'Cancellation requested; pipeline execution will halt at the next checkpoint',
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('RESEARCH_RUN_CANCEL_FAILED', 'Failed to cancel research run', {
      runId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to cancel research run' }, { status: 500 });
  }
}

