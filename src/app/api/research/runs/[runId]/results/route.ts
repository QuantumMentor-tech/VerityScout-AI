import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchRunRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
  SourceDocumentRepository,
} from '@/server/persistence/repositories';
import { RunStatus } from '@/server/persistence/types';
import { logger } from '@/lib/logging/logger';

const runRepo = new ResearchRunRepository();
const candidateRepo = new CandidateResultRepository();
const evidenceRepo = new EvidenceRecordRepository();
const sourceDocRepo = new SourceDocumentRepository();

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

/**
 * GET /api/research/runs/[runId]/results
 * Returns the verified candidates, evidence, sources, and synthesis for a completed run.
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

    if (run.status === RunStatus.QUEUED || run.status === RunStatus.RUNNING) {
      return NextResponse.json(
        {
          runId: run.id,
          status: run.status,
          currentStage: run.current_stage,
          completed: false,
          message: 'Research run is currently in progress.',
          stageCounters: run.stage_counters,
        },
        { status: 200 }
      );
    }

    if (run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED) {
      return NextResponse.json(
        {
          runId: run.id,
          status: run.status,
          currentStage: run.current_stage,
          completed: false,
          error: run.error_message ?? run.cancellation_reason ?? 'Research run did not complete successfully.',
        },
        { status: 200 }
      );
    }

    // Run is COMPLETED (or PARTIALLY_COMPLETED)
    const [candidatesRes, evidenceRes, sourcesRes] = await Promise.all([
      candidateRepo.listByRunId(runId, userId, { limit: 50 }),
      evidenceRepo.listByRunId(runId, userId, { limit: 100 }),
      sourceDocRepo.listByRunId(runId, userId, { limit: 50 }),
    ]);

    return NextResponse.json(
      {
        runId: run.id,
        status: run.status,
        currentStage: run.current_stage,
        completed: true,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        stageCounters: run.stage_counters,
        synthesis: run.synthesis ?? null,
        candidates: candidatesRes.data,
        evidence: evidenceRes.data,
        sources: sourcesRes.data,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('RESEARCH_RUN_RESULTS_FAILED', 'Failed to retrieve research run results', {
      runId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to retrieve research run results' }, { status: 500 });
  }
}

