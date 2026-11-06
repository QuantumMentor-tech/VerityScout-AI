import 'server-only';
import { PoolClient } from 'pg';
import { ChangeEventRow, ChangeType, ChangeStatus } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateChangeEventInput {
  id?: string | undefined;
  task_id: string;
  schedule_id?: string | null | undefined;
  user_id: string;
  previous_run_id?: string | undefined;
  baseline_run_id?: string | null | undefined;
  current_run_id: string;
  change_type: ChangeType;
  field_name?: string | undefined;
  entity_type?: string | undefined;
  entity_id?: string | undefined;
  previous_value?: string | Record<string, unknown> | null | undefined;
  new_value?: string | Record<string, unknown> | null | undefined;
  percentage_delta?: number | null | undefined;
  candidate_title?: string | undefined;
  canonical_url?: string | undefined;
  evidence_id?: string | null | undefined;
  comparison_id?: string | null | undefined;
  candidate_id?: string | null | undefined;
  baseline_evidence_id?: string | null | undefined;
  reason_code?: string | null | undefined;
  change_status?: ChangeStatus | undefined;
  explanation?: string | null | undefined;
  idempotency_key?: string | null | undefined;
}

export class ChangeEventRepository {
  /**
   * Retrieves a change event by ID, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ChangeEventRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM change_events WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM change_events WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await executeQuery<ChangeEventRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists change events for a research task with bounded pagination and optional owner scoping.
   */
  async listByTaskId(
    taskId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<ChangeEventRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM change_events WHERE task_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM change_events WHERE task_id = $1';
    const countParams = userId ? [taskId, userId] : [taskId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = userId
      ? `
        SELECT * FROM change_events
        WHERE task_id = $1 AND user_id = $2
        ORDER BY detected_at DESC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM change_events
        WHERE task_id = $1
        ORDER BY detected_at DESC
        LIMIT $2 OFFSET $3
      `;
    const dataParams = userId ? [taskId, userId, limit, offset] : [taskId, limit, offset];

    const dataRes = await executeQuery<ChangeEventRow>(executor, dataSql, dataParams);

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
   * Lists change events for a specific comparison session.
   */
  async listByComparisonId(
    comparisonId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ChangeEventRow[]> {
    const executor = getExecutor(tx);
    const sql = userId
      ? `SELECT * FROM change_events WHERE comparison_id = $1 AND user_id = $2 ORDER BY detected_at DESC`
      : `SELECT * FROM change_events WHERE comparison_id = $1 ORDER BY detected_at DESC`;
    const params = userId ? [comparisonId, userId] : [comparisonId];
    const res = await executeQuery<ChangeEventRow>(executor, sql, params);
    return res.rows;
  }

  /**
   * Lists change events detected in a specific research run.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ChangeEventRow[]> {
    const executor = getExecutor(tx);
    const sql = userId
      ? `SELECT * FROM change_events WHERE current_run_id = $1 AND user_id = $2 ORDER BY detected_at DESC`
      : `SELECT * FROM change_events WHERE current_run_id = $1 ORDER BY detected_at DESC`;
    const params = userId ? [runId, userId] : [runId];
    const res = await executeQuery<ChangeEventRow>(executor, sql, params);
    return res.rows;
  }

  /**
   * Records an immutable change event between research runs.
   */
  async create(
    input: CreateChangeEventInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ChangeEventRow> {
    const executor = getExecutor(tx);
    const previousRunId = input.previous_run_id ?? input.baseline_run_id ?? input.current_run_id;
    const fieldName = input.field_name ?? input.entity_type ?? 'general';
    const prevVal = typeof input.previous_value === 'object' && input.previous_value !== null
      ? JSON.stringify(input.previous_value)
      : String(input.previous_value ?? '');
    const newVal = typeof input.new_value === 'object' && input.new_value !== null
      ? JSON.stringify(input.new_value)
      : String(input.new_value ?? '');
    const candidateTitle = input.candidate_title ?? input.entity_id ?? 'Unknown Subject';
    const canonicalUrl = input.canonical_url ?? '';

    const sql = `
      INSERT INTO change_events (
        id, task_id, schedule_id, user_id, previous_run_id, current_run_id,
        change_type, field_name, previous_value, new_value, percentage_delta,
        candidate_title, canonical_url, evidence_id, comparison_id, candidate_id,
        baseline_evidence_id, reason_code, change_status, explanation, idempotency_key
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21
      )
      ON CONFLICT (idempotency_key) DO UPDATE SET detected_at = change_events.detected_at
      RETURNING *
    `;

    const params = [
      input.id ?? null,
      input.task_id,
      input.schedule_id ?? null,
      input.user_id,
      previousRunId,
      input.current_run_id,
      input.change_type,
      fieldName,
      prevVal,
      newVal,
      input.percentage_delta !== undefined ? input.percentage_delta : null,
      candidateTitle,
      canonicalUrl,
      input.evidence_id ?? null,
      input.comparison_id ?? null,
      input.candidate_id ?? null,
      input.baseline_evidence_id ?? null,
      input.reason_code ?? null,
      input.change_status ?? ChangeStatus.SUPPORTED,
      input.explanation ?? null,
      input.idempotency_key ?? null,
    ];

    const result = await executeQuery<ChangeEventRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create change event: database returned no rows');
    }
    return row;
  }

  /**
   * Idempotently persists a batch of detected changes within a single transaction.
   */
  async createBatch(
    inputs: CreateChangeEventInput[],
    tx?: TransactionContext | PoolClient
  ): Promise<ChangeEventRow[]> {
    if (inputs.length === 0) return [];
    const results: ChangeEventRow[] = [];
    for (const input of inputs) {
      const row = await this.create(input, tx);
      results.push(row);
    }
    return results;
  }
}
