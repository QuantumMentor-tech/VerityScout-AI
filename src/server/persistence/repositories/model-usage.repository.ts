import 'server-only';
import { PoolClient } from 'pg';
import {
  ModelUsageEventRow,
  UsageSource,
  CostStatus,
} from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateModelUsageEventInput {
  id?: string | undefined;
  user_id: string;
  run_id?: string | null | undefined;
  task_id?: string | null | undefined;
  attempt?: number | undefined;
  provider_id: string;
  model_id: string;
  operation_type: string;
  request_id?: string | null | undefined;
  idempotency_key: string;
  input_tokens?: number | null | undefined;
  output_tokens?: number | null | undefined;
  total_tokens?: number | null | undefined;
  cached_tokens?: number | null | undefined;
  reasoning_tokens?: number | null | undefined;
  usage_source?: UsageSource | undefined;
  estimated_cost_usd?: string | null | undefined;
  provider_cost_usd?: string | null | undefined;
  currency?: string | undefined;
  cost_status?: CostStatus | undefined;
  pricing_version?: string | null | undefined;
  cost_explanation?: string | null | undefined;
  latency_ms?: number | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RunUsageSummary {
  readonly runId: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
  readonly totalRequests: number;
  readonly knownUsageRequests: number;
  readonly unknownUsageRequests: number;
  readonly totalEstimatedCostUsd: string | null;
  readonly totalProviderCostUsd: string | null;
  readonly currency: string;
  readonly unknownCostRequests: number;
  readonly attemptsCount: number;
  readonly byOperation: Record<
    string,
    {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd: string | null;
    }
  >;
  readonly byModel: Record<
    string,
    {
      providerId: string;
      modelId: string;
      requests: number;
      totalTokens: number;
      estimatedCostUsd: string | null;
    }
  >;
}

export class ModelUsageRepository {
  /**
   * Persists an immutable usage event with strict idempotency protection.
   */
  async create(
    input: CreateModelUsageEventInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ModelUsageEventRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO model_usage_events (
        id, user_id, run_id, task_id, attempt, provider_id, model_id,
        operation_type, request_id, idempotency_key, input_tokens, output_tokens,
        total_tokens, cached_tokens, reasoning_tokens, usage_source,
        estimated_cost_usd, provider_cost_usd, currency, cost_status,
        pricing_version, cost_explanation, latency_ms, metadata
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24
      )
      ON CONFLICT (idempotency_key) DO UPDATE
      SET metadata = model_usage_events.metadata
      RETURNING *
    `;

    const params = [
      input.id ?? null,
      input.user_id,
      input.run_id ?? null,
      input.task_id ?? null,
      input.attempt ?? 1,
      input.provider_id,
      input.model_id,
      input.operation_type,
      input.request_id ?? null,
      input.idempotency_key,
      input.input_tokens ?? null,
      input.output_tokens ?? null,
      input.total_tokens ?? null,
      input.cached_tokens ?? null,
      input.reasoning_tokens ?? null,
      input.usage_source ?? 'PROVIDER_REPORTED',
      input.estimated_cost_usd ?? null,
      input.provider_cost_usd ?? null,
      input.currency ?? 'USD',
      input.cost_status ?? 'CALCULATED_ESTIMATE',
      input.pricing_version ?? null,
      input.cost_explanation ?? null,
      input.latency_ms ?? null,
      JSON.stringify(input.metadata ?? {}),
    ];

    const result = await executeQuery<ModelUsageEventRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to insert model usage event: no rows returned');
    }
    return row;
  }

  /**
   * Retrieves a model usage event by idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ModelUsageEventRow | null> {
    const executor = getExecutor(tx);
    const sql = 'SELECT * FROM model_usage_events WHERE idempotency_key = $1';
    const result = await executeQuery<ModelUsageEventRow>(executor, sql, [idempotencyKey]);
    return result.rows[0] ?? null;
  }

  /**
   * Lists all usage events recorded for a given research run.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ModelUsageEventRow[]> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM model_usage_events WHERE run_id = $1 AND user_id = $2 ORDER BY recorded_at ASC, attempt ASC'
      : 'SELECT * FROM model_usage_events WHERE run_id = $1 ORDER BY recorded_at ASC, attempt ASC';
    const params = userId ? [runId, userId] : [runId];
    const result = await executeQuery<ModelUsageEventRow>(executor, sql, params);
    return result.rows;
  }

  /**
   * Generates a comprehensive, honest usage and cost summary for a research run.
   * Preserves unknown usage/cost distinctions rather than silently assuming zero.
   */
  async getRunUsageSummary(
    runId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<RunUsageSummary> {
    const events = await this.listByRunId(runId, userId, tx);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let cachedTokens = 0;
    let reasoningTokens = 0;
    let knownUsageRequests = 0;
    let unknownUsageRequests = 0;
    let unknownCostRequests = 0;
    let maxAttempt = 0;
    let totalEstimatedCostUsd = 0;
    let hasEstimatedCost = false;
    let totalProviderCostUsd = 0;
    let hasProviderCost = false;

    const byOperation: RunUsageSummary['byOperation'] = {};
    const byModel: RunUsageSummary['byModel'] = {};

    for (const evt of events) {
      if (evt.attempt > maxAttempt) {
        maxAttempt = evt.attempt;
      }

      const hasKnownTokens = evt.total_tokens !== null && evt.usage_source !== 'UNKNOWN';
      if (hasKnownTokens) {
        knownUsageRequests++;
        totalInputTokens += evt.input_tokens ?? 0;
        totalOutputTokens += evt.output_tokens ?? 0;
        totalTokens += evt.total_tokens ?? 0;
        cachedTokens += evt.cached_tokens ?? 0;
        reasoningTokens += evt.reasoning_tokens ?? 0;
      } else {
        unknownUsageRequests++;
      }

      if (evt.cost_status === 'UNKNOWN_COST' || evt.estimated_cost_usd === null) {
        unknownCostRequests++;
      } else {
        hasEstimatedCost = true;
        totalEstimatedCostUsd += parseFloat(evt.estimated_cost_usd);
      }

      if (evt.provider_cost_usd !== null) {
        hasProviderCost = true;
        totalProviderCostUsd += parseFloat(evt.provider_cost_usd);
      }

      // Group by operation
      const opKey = evt.operation_type;
      const opEntry = byOperation[opKey] ?? {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: null,
      };
      opEntry.requests++;
      if (evt.input_tokens) opEntry.inputTokens += evt.input_tokens;
      if (evt.output_tokens) opEntry.outputTokens += evt.output_tokens;
      if (evt.total_tokens) opEntry.totalTokens += evt.total_tokens;
      if (evt.estimated_cost_usd !== null) {
        const current = opEntry.estimatedCostUsd ? parseFloat(opEntry.estimatedCostUsd) : 0;
        opEntry.estimatedCostUsd = (current + parseFloat(evt.estimated_cost_usd)).toFixed(6);
      }
      byOperation[opKey] = opEntry;

      // Group by model
      const modelKey = `${evt.provider_id}:${evt.model_id}`;
      const modelEntry = byModel[modelKey] ?? {
        providerId: evt.provider_id,
        modelId: evt.model_id,
        requests: 0,
        totalTokens: 0,
        estimatedCostUsd: null,
      };
      modelEntry.requests++;
      if (evt.total_tokens) modelEntry.totalTokens += evt.total_tokens;
      if (evt.estimated_cost_usd !== null) {
        const current = modelEntry.estimatedCostUsd ? parseFloat(modelEntry.estimatedCostUsd) : 0;
        modelEntry.estimatedCostUsd = (current + parseFloat(evt.estimated_cost_usd)).toFixed(6);
      }
      byModel[modelKey] = modelEntry;
    }

    return {
      runId,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      cachedTokens,
      reasoningTokens,
      totalRequests: events.length,
      knownUsageRequests,
      unknownUsageRequests,
      totalEstimatedCostUsd: hasEstimatedCost ? totalEstimatedCostUsd.toFixed(6) : null,
      totalProviderCostUsd: hasProviderCost ? totalProviderCostUsd.toFixed(6) : null,
      currency: 'USD',
      unknownCostRequests,
      attemptsCount: Math.max(1, maxAttempt),
      byOperation,
      byModel,
    };
  }
}

