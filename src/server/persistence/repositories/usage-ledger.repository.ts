import 'server-only';
import { PoolClient } from 'pg';
import { UsageLedgerRow } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateUsageLedgerInput {
  id?: string;
  user_id: string;
  run_id?: string | null;
  task_id?: string | null;
  provider_type: string;
  provider_name: string;
  model_name?: string | null;
  operation_type: string;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  tokens_total?: number | null;
  cost_usd: string;
  is_estimated?: boolean;
  duration_ms?: number | null;
}

export class UsageLedgerRepository {
  /**
   * Inserts an immutable financial usage entry.
   */
  async create(
    input: CreateUsageLedgerInput,
    tx?: TransactionContext | PoolClient
  ): Promise<UsageLedgerRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO usage_ledger (
        id, user_id, run_id, task_id, provider_type, provider_name,
        model_name, operation_type, tokens_prompt, tokens_completion,
        tokens_total, cost_usd, is_estimated, duration_ms
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.user_id,
      input.run_id ?? null,
      input.task_id ?? null,
      input.provider_type,
      input.provider_name,
      input.model_name ?? null,
      input.operation_type,
      input.tokens_prompt ?? null,
      input.tokens_completion ?? null,
      input.tokens_total ?? null,
      input.cost_usd,
      input.is_estimated ?? false,
      input.duration_ms ?? null,
    ];

    const result = await executeQuery<UsageLedgerRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create usage ledger entry: database returned no rows');
    }
    return row;
  }

  /**
   * Lists all usage entries attributed to a specific research run, optionally scoped to owner.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<UsageLedgerRow[]> {
    const executor = getExecutor(tx);
    const sql = userId
      ? `
        SELECT * FROM usage_ledger
        WHERE run_id = $1 AND user_id = $2
        ORDER BY recorded_at ASC
      `
      : `
        SELECT * FROM usage_ledger
        WHERE run_id = $1
        ORDER BY recorded_at ASC
      `;
    const params = userId ? [runId, userId] : [runId];
    const result = await executeQuery<UsageLedgerRow>(executor, sql, params);
    return result.rows;
  }

  /**
   * Calculates total aggregated monetary cost and token usage for a research task, optionally scoped to owner.
   */
  async getAggregatedCostByTask(
    taskId: string,
    userIdOrTx?: string | TransactionContext | PoolClient,
    maybeTx?: TransactionContext | PoolClient
  ): Promise<{ totalCostUsd: string; totalTokens: number }> {
    const userId = typeof userIdOrTx === 'string' ? userIdOrTx : undefined;
    const tx = typeof userIdOrTx === 'string' ? maybeTx : userIdOrTx;
    const executor = getExecutor(tx);
    const sql = userId
      ? `
        SELECT
          COALESCE(SUM(cost_usd), 0)::text AS total_cost_usd,
          COALESCE(SUM(tokens_total), 0)::int AS total_tokens
        FROM usage_ledger
        WHERE task_id = $1 AND user_id = $2
      `
      : `
        SELECT
          COALESCE(SUM(cost_usd), 0)::text AS total_cost_usd,
          COALESCE(SUM(tokens_total), 0)::int AS total_tokens
        FROM usage_ledger
        WHERE task_id = $1
      `;
    const params = userId ? [taskId, userId] : [taskId];
    const result = await executeQuery<{ total_cost_usd: string; total_tokens: number }>(
      executor,
      sql,
      params
    );
    const row = result.rows[0];
    return {
      totalCostUsd: row?.total_cost_usd ?? '0.000000',
      totalTokens: row?.total_tokens ?? 0,
    };
  }


  /**
   * Calculates total aggregated monetary spend and token usage for an owner.
   */
  async getAggregatedCostByOwner(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<{ totalCostUsd: string; totalTokens: number }> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT
        COALESCE(SUM(cost_usd), 0)::text AS total_cost_usd,
        COALESCE(SUM(tokens_total), 0)::int AS total_tokens
      FROM usage_ledger
      WHERE user_id = $1
    `;
    const result = await executeQuery<{ total_cost_usd: string; total_tokens: number }>(
      executor,
      sql,
      [userId]
    );
    const row = result.rows[0];
    return {
      totalCostUsd: row?.total_cost_usd ?? '0.000000',
      totalTokens: row?.total_tokens ?? 0,
    };
  }
}
