import 'server-only';
import { PoolClient } from 'pg';
import { ResearchScheduleRow, ScheduleStatus } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateResearchScheduleInput {
  id?: string;
  task_id: string;
  user_id: string;
  cron_expression: string;
  timezone?: string;
  status?: ScheduleStatus;
  next_run_at?: Date | null;
}

export class ResearchScheduleRepository {
  /**
   * Retrieves a single schedule by ID.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM research_schedules WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM research_schedules WHERE id = $1';
    const params = userId ? [id, userId] : [id];

    const result = await executeQuery<ResearchScheduleRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists all research schedules owned by a user.
   */
  async listByOwner(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow[]> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT * FROM research_schedules
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await executeQuery<ResearchScheduleRow>(executor, sql, [userId]);
    return result.rows;
  }

  /**
   * Finds active schedules that are due for execution (next_run_at <= cutoff).
   */
  async listActiveDue(
    cutoff: Date = new Date(),
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow[]> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT * FROM research_schedules
      WHERE status = 'ACTIVE'
        AND next_run_at IS NOT NULL
        AND next_run_at <= $1
      ORDER BY next_run_at ASC
    `;
    const result = await executeQuery<ResearchScheduleRow>(executor, sql, [cutoff]);
    return result.rows;
  }

  /**
   * Creates a recurring research schedule rule.
   */
  async create(
    input: CreateResearchScheduleInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO research_schedules (
        id, task_id, user_id, cron_expression, timezone, status, next_run_at
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.task_id,
      input.user_id,
      input.cron_expression,
      input.timezone ?? 'UTC',
      input.status ?? ScheduleStatus.ACTIVE,
      input.next_run_at ?? null,
    ];

    const result = await executeQuery<ResearchScheduleRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create research schedule: database returned no rows');
    }
    return row;
  }

  /**
   * Records schedule execution results and manages failure counts/circuit breaker.
   */
  async updateExecution(
    id: string,
    lastRunAt: Date,
    nextRunAt: Date | null,
    isFailure: boolean,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE research_schedules
      SET last_run_at = $2,
          next_run_at = $3,
          consecutive_failures = CASE WHEN $4 THEN consecutive_failures + 1 ELSE 0 END,
          status = CASE
            WHEN $4 AND consecutive_failures + 1 >= 5 THEN 'DISABLED_ERROR'
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await executeQuery<ResearchScheduleRow>(executor, sql, [
      id,
      lastRunAt,
      nextRunAt,
      isFailure,
    ]);
    return result.rows[0] ?? null;
  }

  /**
   * Updates schedule operational status (e.g. PAUSED, ACTIVE, ARCHIVED).
   */
  async updateStatus(
    id: string,
    status: ScheduleStatus,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow | null> {
    const executor = getExecutor(tx);
    let sql = `
      UPDATE research_schedules
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
    `;
    const params: unknown[] = [id, status];
    if (userId) {
      sql += ' AND user_id = $3';
      params.push(userId);
    }
    sql += ' RETURNING *';

    const result = await executeQuery<ResearchScheduleRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }
}
