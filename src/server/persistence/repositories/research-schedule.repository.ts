import 'server-only';
import { PoolClient } from 'pg';
import { ResearchScheduleRow, ScheduleStatus } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateResearchScheduleInput {
  id?: string | undefined;
  task_id: string;
  user_id: string;
  name?: string | null | undefined;
  revision?: number | undefined;
  cron_expression: string;
  recurrence_rule?: Record<string, unknown> | null | undefined;
  scheduled_time?: string | null | undefined;
  request_snapshot?: Record<string, unknown> | null | undefined;
  timezone?: string | undefined;
  status?: ScheduleStatus | undefined;
  next_run_at?: Date | null | undefined;
}

export interface UpdateScheduleDefinitionInput {
  name?: string | null | undefined;
  cron_expression?: string | undefined;
  recurrence_rule?: Record<string, unknown> | null | undefined;
  scheduled_time?: string | null | undefined;
  request_snapshot?: Record<string, unknown> | null | undefined;
  timezone?: string | undefined;
  next_run_at?: Date | null | undefined;
  expectedRevision?: number | undefined;
  userId?: string | undefined;
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
   * Bounded by limit to prevent memory exhaustion under high schedule volume.
   */
  async listActiveDue(
    cutoff: Date = new Date(),
    limit: number = 50,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow[]> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT * FROM research_schedules
      WHERE status = 'ACTIVE'
        AND next_run_at IS NOT NULL
        AND next_run_at <= $1
      ORDER BY next_run_at ASC
      LIMIT $2
    `;
    const result = await executeQuery<ResearchScheduleRow>(executor, sql, [cutoff, limit]);
    return result.rows;
  }

  /**
   * Creates a recurring research schedule rule with snapshot and timezone data.
   */
  async create(
    input: CreateResearchScheduleInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO research_schedules (
        id, task_id, user_id, name, revision, cron_expression, recurrence_rule,
        scheduled_time, request_snapshot, timezone, status, next_run_at
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.task_id,
      input.user_id,
      input.name ?? null,
      input.revision ?? 1,
      input.cron_expression,
      input.recurrence_rule ? JSON.stringify(input.recurrence_rule) : null,
      input.scheduled_time ?? null,
      input.request_snapshot ? JSON.stringify(input.request_snapshot) : null,
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
   * Atomically records a successful dispatch, advancing next_run_at and linking last_run_id.
   * If nextRunAt is null (schedule ended), transitions status to ARCHIVED.
   */
  async claimAndAdvance(
    scheduleId: string,
    nextRunAt: Date | null,
    lastRunId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE research_schedules
      SET next_run_at = $2,
          last_run_at = NOW(),
          last_dispatched_at = NOW(),
          last_run_id = $3,
          consecutive_failures = 0,
          status = CASE WHEN $2 IS NULL THEN 'ARCHIVED' ELSE status END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await executeQuery<ResearchScheduleRow>(executor, sql, [
      scheduleId,
      nextRunAt,
      lastRunId,
    ]);
    return result.rows[0] ?? null;
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
   * Optionally resets consecutive_failures and sets next_run_at (e.g. on resume).
   * Backwards-compatible signature supporting (id, status, userId, tx) and (id, status, userId, nextRunAt, tx).
   */
  async updateStatus(
    id: string,
    status: ScheduleStatus,
    userId?: string,
    nextRunAtOrTx?: Date | null | TransactionContext | PoolClient,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow | null> {
    let nextRunAt: Date | null | undefined = undefined;
    let actualTx: TransactionContext | PoolClient | undefined = tx;

    if (nextRunAtOrTx !== undefined) {
      if (
        nextRunAtOrTx === null ||
        nextRunAtOrTx instanceof Date
      ) {
        nextRunAt = nextRunAtOrTx;
      } else {
        actualTx = nextRunAtOrTx;
      }
    }

    const executor = getExecutor(actualTx);
    const setClauses: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: unknown[] = [id, status];

    if (nextRunAt !== undefined) {
      params.push(nextRunAt);
      setClauses.push(`next_run_at = $${params.length}`);
    }

    if (status === ScheduleStatus.ACTIVE) {
      setClauses.push('consecutive_failures = 0');
    }

    let sql = `
      UPDATE research_schedules
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `;

    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }
    sql += ' RETURNING *';

    const result = await executeQuery<ResearchScheduleRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Safely edits a schedule definition, bumping the revision counter and updating snapshot.
   * If expectedRevision is provided, enforces optimistic concurrency locking.
   */
  async updateDefinition(
    id: string,
    input: UpdateScheduleDefinitionInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow | null> {
    const executor = getExecutor(tx);
    const setClauses: string[] = ['revision = revision + 1', 'updated_at = NOW()'];
    const params: unknown[] = [id];

    if (input.name !== undefined) {
      params.push(input.name);
      setClauses.push(`name = $${params.length}`);
    }

    if (input.cron_expression !== undefined) {
      params.push(input.cron_expression);
      setClauses.push(`cron_expression = $${params.length}`);
    }

    if (input.recurrence_rule !== undefined) {
      params.push(input.recurrence_rule ? JSON.stringify(input.recurrence_rule) : null);
      setClauses.push(`recurrence_rule = $${params.length}`);
    }

    if (input.scheduled_time !== undefined) {
      params.push(input.scheduled_time);
      setClauses.push(`scheduled_time = $${params.length}`);
    }

    if (input.request_snapshot !== undefined) {
      params.push(input.request_snapshot ? JSON.stringify(input.request_snapshot) : null);
      setClauses.push(`request_snapshot = $${params.length}`);
    }

    if (input.timezone !== undefined) {
      params.push(input.timezone);
      setClauses.push(`timezone = $${params.length}`);
    }

    if (input.next_run_at !== undefined) {
      params.push(input.next_run_at);
      setClauses.push(`next_run_at = $${params.length}`);
    }

    let sql = `
      UPDATE research_schedules
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `;

    if (input.expectedRevision !== undefined) {
      params.push(input.expectedRevision);
      sql += ` AND revision = $${params.length}`;
    }

    if (input.userId) {
      params.push(input.userId);
      sql += ` AND user_id = $${params.length}`;
    }

    sql += ' RETURNING *';

    const result = await executeQuery<ResearchScheduleRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Safely retires (soft-deletes) a schedule, setting status to ARCHIVED and next_run_at to NULL.
   * Preserves all historical runs, occurrences, and evidence intact.
   */
  async retire(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchScheduleRow | null> {
    const executor = getExecutor(tx);
    let sql = `
      UPDATE research_schedules
      SET status = 'ARCHIVED',
          next_run_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `;
    const params: unknown[] = [id];

    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }

    sql += ' RETURNING *';
    const result = await executeQuery<ResearchScheduleRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }
}
