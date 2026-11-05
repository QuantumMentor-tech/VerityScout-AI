import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import {
  ResearchRunRepository,
  ModelUsageRepository,
} from '@/server/persistence/repositories';
import { logger } from '@/lib/logging/logger';

const runRepo = new ResearchRunRepository();
const usageRepo = new ModelUsageRepository();

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

/**
 * GET /api/research/runs/[runId]/usage
 * Returns full AI usage accounting and cost breakdown for a research run.
 * Strictly verifies ownership and preserves unknown usage / cost states.
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

    const [summary, events] = await Promise.all([
      usageRepo.getRunUsageSummary(runId, userId),
      usageRepo.listByRunId(runId, userId),
    ]);

    return NextResponse.json(
      {
        runId,
        taskId: run.task_id,
        summary,
        events: events.map((e) => ({
          id: e.id,
          attempt: e.attempt,
          providerId: e.provider_id,
          modelId: e.model_id,
          operationType: e.operation_type,
          requestId: e.request_id,
          inputTokens: e.input_tokens,
          outputTokens: e.output_tokens,
          totalTokens: e.total_tokens,
          cachedTokens: e.cached_tokens,
          reasoningTokens: e.reasoning_tokens,
          usageSource: e.usage_source,
          estimatedCostUsd: e.estimated_cost_usd,
          providerCostUsd: e.provider_cost_usd,
          currency: e.currency,
          costStatus: e.cost_status,
          pricingVersion: e.pricing_version,
          costExplanation: e.cost_explanation,
          latencyMs: e.latency_ms,
          recordedAt: e.recorded_at,
        })),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('RESEARCH_RUN_USAGE_FAILED', 'Failed to retrieve usage accounting for run', {
      runId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to retrieve research run usage' }, { status: 500 });
  }
}

