import 'server-only';
import { PoolClient } from 'pg';
import { ResearchRunRow, RunStatus, RunStage } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateResearchRunInput {
  id?: string;
  task_id: string;
  user_id: string;
  schedule_id?: string | null;
  status?: RunStatus;
  current_stage?: RunStage;
  idempotency_key?: string;
}

export interface UpdateRunLifecycleInput {
  completed_at?: Date;
  error_code?: string | null;
  error_message?: string | null;
  progress_percent?: number;
  total_cost_usd?: string;
  execution_duration_ms?: number;
  synthesis?: Record<string, unknown> | null;
}

export class ResearchRunRepository {
  /**
   * Retrieves a single research run by ID, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchRunRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM research_runs WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM research_runs WHERE id = $1';
    const params = userId ? [id, userId] : [id];

    const result = await executeQuery<ResearchRunRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists runs associated with a specific research task, optionally scoped to owner.
   */
  async listByTaskId(
    taskId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<ResearchRunRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM research_runs WHERE task_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM research_runs WHERE task_id = $1';
    const countParams = userId ? [taskId, userId] : [taskId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const sql = userId
      ? `
        SELECT * FROM research_runs
        WHERE task_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM research_runs
        WHERE task_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
    const params = userId ? [taskId, userId, limit, offset] : [taskId, limit, offset];
    const dataRes = await executeQuery<ResearchRunRow>(executor, sql, params);

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
   * Lists runs associated with a specific recurring schedule, optionally scoped to owner.
   */
  async listByScheduleId(
    scheduleId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<ResearchRunRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM research_runs WHERE schedule_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM research_runs WHERE schedule_id = $1';
    const countParams = userId ? [scheduleId, userId] : [scheduleId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const sql = userId
      ? `
        SELECT * FROM research_runs
        WHERE schedule_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM research_runs
        WHERE schedule_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
    const params = userId ? [scheduleId, userId, limit, offset] : [scheduleId, limit, offset];
    const dataRes = await executeQuery<ResearchRunRow>(executor, sql, params);

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
   * Lists all research runs owned by a user across all tasks.
   */
  async listByOwner(
    userId: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<ResearchRunRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countRes = await executeQuery<{ total: number }>(
      executor,
      'SELECT COUNT(*)::int AS total FROM research_runs WHERE user_id = $1',
      [userId]
    );
    const total = countRes.rows[0]?.total ?? 0;

    const sql = `
      SELECT * FROM research_runs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const dataRes = await executeQuery<ResearchRunRow>(executor, sql, [userId, limit, offset]);

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
   * Creates a new research run execution instance.
   */
  async create(
    input: CreateResearchRunInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchRunRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO research_runs (
        id, task_id, user_id, schedule_id, status, current_stage, idempotency_key
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, COALESCE($7, gen_random_uuid()::text)
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.task_id,
      input.user_id,
      input.schedule_id ?? null,
      input.status ?? RunStatus.QUEUED,
      input.current_stage ?? RunStage.INITIATED,
      input.idempotency_key ?? null,
    ];

    const result = await executeQuery<ResearchRunRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create research run: database returned no rows');
    }
    return row;
  }

  /**
   * Transitions run status and stage with optional error, execution metrics, and owner scoping.
   */
  async updateStatus(
    id: string,
    status: RunStatus,
    stage?: RunStage,
    updates?: UpdateRunLifecycleInput,
    userIdOrTx?: string | TransactionContext | PoolClient,
    maybeTx?: TransactionContext | PoolClient
  ): Promise<ResearchRunRow | null> {
    const userId = typeof userIdOrTx === 'string' ? userIdOrTx : undefined;
    const tx = typeof userIdOrTx === 'string' ? maybeTx : userIdOrTx;
    const executor = getExecutor(tx);
    const setClauses: string[] = ['status = $2'];
    const params: unknown[] = [id, status];
    let paramIndex = 3;

    if (stage !== undefined) {
      setClauses.push(`current_stage = $${paramIndex++}`);
      params.push(stage);
    }
    if (updates?.completed_at !== undefined) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      params.push(updates.completed_at);
    }
    if (updates?.error_code !== undefined) {
      setClauses.push(`error_code = $${paramIndex++}`);
      params.push(updates.error_code);
    }
    if (updates?.error_message !== undefined) {
      setClauses.push(`error_message = $${paramIndex++}`);
      params.push(updates.error_message);
    }
    if (updates?.progress_percent !== undefined) {
      setClauses.push(`progress_percent = $${paramIndex++}`);
      params.push(updates.progress_percent);
    }
    if (updates?.total_cost_usd !== undefined) {
      setClauses.push(`total_cost_usd = $${paramIndex++}`);
      params.push(updates.total_cost_usd);
    }
    if (updates?.execution_duration_ms !== undefined) {
      setClauses.push(`execution_duration_ms = $${paramIndex++}`);
      params.push(updates.execution_duration_ms);
    }
    if (updates?.synthesis !== undefined) {
      setClauses.push(`synthesis = $${paramIndex++}`);
      params.push(updates.synthesis ? JSON.stringify(updates.synthesis) : null);
    }

    setClauses.push('updated_at = NOW()');

    let sql = `UPDATE research_runs SET ${setClauses.join(', ')} WHERE id = $1`;
    if (userId) {
      sql += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }
    sql += ' RETURNING *';

    const result = await executeQuery<ResearchRunRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Cancels an active or queued research run, strictly scoped to the owner.
   */
  async cancel(
    id: string,
    reason: string = 'Cancelled by user',
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchRunRow | null> {
    return this.updateStatus(
      id,
      RunStatus.CANCELLED,
      undefined,
      { error_message: reason },
      userId,
      tx
    );
  }


  /**
   * Updates stage counters for telemetry.
   */
  async updateCounters(
    id: string,
    counters: Record<string, number>,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchRunRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE research_runs
      SET stage_counters = stage_counters || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await executeQuery<ResearchRunRow>(executor, sql, [id, JSON.stringify(counters)]);
    return result.rows[0] ?? null;
  }
}
