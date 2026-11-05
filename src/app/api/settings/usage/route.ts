import { NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { executeQuery } from '@/server/persistence/repositories/base.repository';
import { getPool } from '@/server/persistence/database';
import { logger } from '@/lib/logging/logger';

/**
 * GET /api/settings/usage
 * Returns user-level aggregated AI usage accounting across all operations.
 */
export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const sql = `
      SELECT
        provider_id,
        operation_type,
        COUNT(*)::int AS requests_count,
        COALESCE(SUM(input_tokens), 0)::bigint AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::bigint AS total_output_tokens,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::text AS total_estimated_cost_usd,
        currency
      FROM model_usage_events
      WHERE user_id = $1
      GROUP BY provider_id, operation_type, currency
      ORDER BY provider_id ASC, operation_type ASC
    `;

    const res = await executeQuery<{
      provider_id: string;
      operation_type: string;
      requests_count: number;
      total_input_tokens: string;
      total_output_tokens: string;
      total_tokens: string;
      total_estimated_cost_usd: string;
      currency: string;
    }>(pool, sql, [userId]);

    let totalTokens = 0;
    let totalCostUsd = 0;
    let totalRequests = 0;

    const breakdown = res.rows.map((r) => {
      const tokens = parseInt(r.total_tokens, 10) || 0;
      const cost = parseFloat(r.total_estimated_cost_usd) || 0;
      totalTokens += tokens;
      totalCostUsd += cost;
      totalRequests += r.requests_count;

      return {
        providerId: r.provider_id,
        operationType: r.operation_type,
        requestsCount: r.requests_count,
        inputTokens: parseInt(r.total_input_tokens, 10) || 0,
        outputTokens: parseInt(r.total_output_tokens, 10) || 0,
        totalTokens: tokens,
        estimatedCostUsd: cost.toFixed(6),
        currency: r.currency,
      };
    });

    return NextResponse.json(
      {
        userId,
        totalRequests,
        totalTokens,
        totalEstimatedCostUsd: totalCostUsd.toFixed(6),
        currency: 'USD',
        breakdown,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('SETTINGS_USAGE_FAILED', 'Failed to retrieve user usage breakdown', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to retrieve usage summary' }, { status: 500 });
  }
}
