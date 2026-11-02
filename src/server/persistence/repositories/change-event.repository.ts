import 'server-only';
import { PoolClient } from 'pg';
import { ChangeEventRow, ChangeType } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateChangeEventInput {
  id?: string;
  task_id: string;
  current_run_id: string;
  baseline_run_id?: string | null;
  user_id: string;
  entity_type: string;
  entity_id: string;
  change_type: ChangeType;
  previous_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
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
   * Records an immutable change event between research runs.
   */
  async create(
    input: CreateChangeEventInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ChangeEventRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO change_events (
        id, task_id, current_run_id, baseline_run_id, user_id,
        entity_type, entity_id, change_type, previous_value, new_value
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.task_id,
      input.current_run_id,
      input.baseline_run_id ?? null,
      input.user_id,
      input.entity_type,
      input.entity_id,
      input.change_type,
      input.previous_value ? JSON.stringify(input.previous_value) : null,
      input.new_value ? JSON.stringify(input.new_value) : null,
    ];

    const result = await executeQuery<ChangeEventRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create change event: database returned no rows');
    }
    return row;
  }
}
