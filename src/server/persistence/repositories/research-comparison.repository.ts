import 'server-only';
import { PoolClient } from 'pg';
import { ResearchComparisonRow, ComparisonStatus } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateResearchComparisonInput {
  id?: string | undefined;
  task_id: string;
  schedule_id?: string | null | undefined;
  user_id: string;
  baseline_run_id: string;
  current_run_id: string;
  status?: ComparisonStatus | undefined;
  comparison_policy_version?: string | undefined;
  reason_code?: string | null | undefined;
  summary?: Record<string, unknown> | undefined;
  detected_at?: Date | undefined;
}

export class ResearchComparisonRepository {
  /**
   * Retrieves a comparison by ID, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchComparisonRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM research_comparisons WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM research_comparisons WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await executeQuery<ResearchComparisonRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Retrieves a comparison by baseline and current run IDs (unique constraint).
   */
  async findByRuns(
    baselineRunId: string,
    currentRunId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchComparisonRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM research_comparisons WHERE baseline_run_id = $1 AND current_run_id = $2 AND user_id = $3'
      : 'SELECT * FROM research_comparisons WHERE baseline_run_id = $1 AND current_run_id = $2';
    const params = userId ? [baselineRunId, currentRunId, userId] : [baselineRunId, currentRunId];
    const result = await executeQuery<ResearchComparisonRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Finds the latest comparison record for a recurring schedule.
   */
  async findLatestByScheduleId(
    scheduleId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchComparisonRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? `SELECT * FROM research_comparisons WHERE schedule_id = $1 AND user_id = $2 ORDER BY detected_at DESC LIMIT 1`
      : `SELECT * FROM research_comparisons WHERE schedule_id = $1 ORDER BY detected_at DESC LIMIT 1`;
    const params = userId ? [scheduleId, userId] : [scheduleId];
    const result = await executeQuery<ResearchComparisonRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists comparisons for a schedule with pagination.
   */
  async listByScheduleId(
    scheduleId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<ResearchComparisonRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM research_comparisons WHERE schedule_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM research_comparisons WHERE schedule_id = $1';
    const countParams = userId ? [scheduleId, userId] : [scheduleId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = userId
      ? `
        SELECT * FROM research_comparisons
        WHERE schedule_id = $1 AND user_id = $2
        ORDER BY detected_at DESC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM research_comparisons
        WHERE schedule_id = $1
        ORDER BY detected_at DESC
        LIMIT $2 OFFSET $3
      `;
    const dataParams = userId ? [scheduleId, userId, limit, offset] : [scheduleId, limit, offset];
    const dataRes = await executeQuery<ResearchComparisonRow>(executor, dataSql, dataParams);

    return {
      data: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Creates or returns an existing comparison session idempotently.
   */
  async create(
    input: CreateResearchComparisonInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchComparisonRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO research_comparisons (
        id, task_id, schedule_id, user_id, baseline_run_id, current_run_id,
        status, comparison_policy_version, reason_code, summary, detected_at
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW())
      )
      ON CONFLICT (baseline_run_id, current_run_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        reason_code = EXCLUDED.reason_code,
        summary = EXCLUDED.summary,
        detected_at = EXCLUDED.detected_at
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.task_id,
      input.schedule_id ?? null,
      input.user_id,
      input.baseline_run_id,
      input.current_run_id,
      input.status ?? ComparisonStatus.COMPLETED,
      input.comparison_policy_version ?? 'v1.0',
      input.reason_code ?? null,
      JSON.stringify(input.summary ?? {}),
      input.detected_at ?? null,
    ];

    const result = await executeQuery<ResearchComparisonRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create research comparison: database returned no rows');
    }
    return row;
  }
}

