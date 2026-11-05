import 'server-only';
import { PoolClient } from 'pg';
import { ScheduleOccurrenceRow, OccurrenceStatus } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateOccurrenceInput {
  readonly id?: string | undefined;
  readonly schedule_id: string;
  readonly user_id: string;
  readonly schedule_revision?: number | undefined;
  readonly scheduled_at: Date | string;
  readonly idempotency_key?: string | undefined;
  readonly status?: OccurrenceStatus | undefined;
}

export interface UpdateOccurrenceStatusInput {
  readonly research_run_id?: string | null | undefined;
  readonly queue_job_id?: string | null | undefined;
  readonly dispatched_at?: Date | null | undefined;
  readonly started_at?: Date | null | undefined;
  readonly completed_at?: Date | null | undefined;
  readonly error_message?: string | null | undefined;
  readonly recovery_metadata?: Record<string, unknown> | null | undefined;
}

export interface ListOccurrencesOptions {
  readonly status?: OccurrenceStatus | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export class ScheduleOccurrenceRepository {
  /**
   * Generates a stable, deterministic idempotency key for a scheduled occurrence.
   */
  static generateIdempotencyKey(scheduleId: string, scheduledAt: Date | string): string {
    const iso = scheduledAt instanceof Date ? scheduledAt.toISOString() : new Date(scheduledAt).toISOString();
    return `occ_${scheduleId}_${iso}`;
  }

  /**
   * Idempotently creates or retrieves a schedule occurrence for a specific scheduled instant.
   * If an occurrence already exists for (schedule_id, scheduled_at), returns the existing row.
   */
  async createOrGet(
    input: CreateOccurrenceInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow> {
    const executor = getExecutor(tx);
    const scheduledAt = input.scheduled_at instanceof Date ? input.scheduled_at : new Date(input.scheduled_at);
    const idempotencyKey = input.idempotency_key ?? ScheduleOccurrenceRepository.generateIdempotencyKey(input.schedule_id, scheduledAt);
    const status = input.status ?? OccurrenceStatus.PLANNED;
    const revision = input.schedule_revision ?? 1;

    const sql = `
      INSERT INTO schedule_occurrences (
        id, schedule_id, user_id, schedule_revision, idempotency_key, scheduled_at, status
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7
      )
      ON CONFLICT (schedule_id, scheduled_at)
      DO UPDATE SET updated_at = schedule_occurrences.updated_at
      RETURNING *
    `;

    const params = [
      input.id ?? null,
      input.schedule_id,
      input.user_id,
      revision,
      idempotencyKey,
      scheduledAt,
      status,
    ];

    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create or retrieve schedule occurrence: database returned no rows');
    }
    return row;
  }

  /**
   * Retrieves an occurrence by primary ID with optional user isolation.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM schedule_occurrences WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM schedule_occurrences WHERE id = $1';
    const params = userId ? [id, userId] : [id];

    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Retrieves an occurrence by its deterministic idempotency key.
   */
  async findByIdempotencyKey(
    key: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow | null> {
    const executor = getExecutor(tx);
    const sql = 'SELECT * FROM schedule_occurrences WHERE idempotency_key = $1';
    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, [key]);
    return result.rows[0] ?? null;
  }

  /**
   * Retrieves an occurrence linked to a specific research run.
   */
  async findByRunId(
    runId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow | null> {
    const executor = getExecutor(tx);
    const sql = 'SELECT * FROM schedule_occurrences WHERE research_run_id = $1';
    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, [runId]);
    return result.rows[0] ?? null;
  }

  /**
   * Retrieves an occurrence linked to a queue job ID.
   */
  async findByJobId(
    jobId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow | null> {
    const executor = getExecutor(tx);
    const sql = 'SELECT * FROM schedule_occurrences WHERE queue_job_id = $1';
    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, [jobId]);
    return result.rows[0] ?? null;
  }

  /**
   * Lists occurrences for a given schedule with optional status filtering and pagination.
   */
  async listByScheduleId(
    scheduleId: string,
    userId?: string,
    options?: ListOccurrencesOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow[]> {
    const executor = getExecutor(tx);
    const conditions: string[] = ['schedule_id = $1'];
    const params: unknown[] = [scheduleId];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }

    if (options?.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }

    let sql = `SELECT * FROM schedule_occurrences WHERE ${conditions.join(' AND ')} ORDER BY scheduled_at DESC`;

    const limit = Math.min(options?.limit ?? 50, 100);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    if (options?.offset) {
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, params);
    return result.rows;
  }

  /**
   * Counts occurrences for a schedule.
   */
  async countByScheduleId(
    scheduleId: string,
    userId?: string,
    status?: OccurrenceStatus,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    const executor = getExecutor(tx);
    const conditions: string[] = ['schedule_id = $1'];
    const params: unknown[] = [scheduleId];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const sql = `SELECT COUNT(*) AS total FROM schedule_occurrences WHERE ${conditions.join(' AND ')}`;
    const result = await executeQuery<{ total: string }>(executor, sql, params);
    return parseInt(result.rows[0]?.total ?? '0', 10);
  }

  /**
   * Updates occurrence lifecycle status, timestamps, linkage, or errors.
   */
  async updateStatus(
    id: string,
    status: OccurrenceStatus,
    updates?: UpdateOccurrenceStatusInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow | null> {
    const executor = getExecutor(tx);
    const setClauses: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: unknown[] = [id, status];

    if (updates?.research_run_id !== undefined) {
      params.push(updates.research_run_id);
      setClauses.push(`research_run_id = $${params.length}`);
    }

    if (updates?.queue_job_id !== undefined) {
      params.push(updates.queue_job_id);
      setClauses.push(`queue_job_id = $${params.length}`);
    }

    if (updates?.dispatched_at !== undefined) {
      params.push(updates.dispatched_at);
      setClauses.push(`dispatched_at = $${params.length}`);
    }

    if (updates?.started_at !== undefined) {
      params.push(updates.started_at);
      setClauses.push(`started_at = $${params.length}`);
    }

    if (updates?.completed_at !== undefined) {
      params.push(updates.completed_at);
      setClauses.push(`completed_at = $${params.length}`);
    }

    if (updates?.error_message !== undefined) {
      params.push(updates.error_message);
      setClauses.push(`error_message = $${params.length}`);
    }

    if (updates?.recovery_metadata !== undefined) {
      params.push(updates.recovery_metadata ? JSON.stringify(updates.recovery_metadata) : null);
      setClauses.push(`recovery_metadata = $${params.length}`);
    }

    const sql = `
      UPDATE schedule_occurrences
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Marks all undispatched (PLANNED) occurrences for a schedule as SKIPPED.
   * Useful when a schedule definition is edited or paused/retired.
   */
  async markPendingAsSkippedForSchedule(
    scheduleId: string,
    reason: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE schedule_occurrences
      SET status = 'SKIPPED',
          error_message = $2,
          updated_at = NOW()
      WHERE schedule_id = $1 AND status = 'PLANNED'
      RETURNING id
    `;
    const result = await executeQuery<{ id: string }>(executor, sql, [scheduleId, reason]);
    return result.rows.length;
  }

  /**
   * Finds occurrences stuck in DISPATCHING longer than olderThan cutoff.
   */
  async findStuckDispatching(
    olderThan: Date,
    limit: number = 50,
    tx?: TransactionContext | PoolClient
  ): Promise<ScheduleOccurrenceRow[]> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT * FROM schedule_occurrences
      WHERE status = 'DISPATCHING'
        AND updated_at <= $1
      ORDER BY updated_at ASC
      LIMIT $2
    `;
    const result = await executeQuery<ScheduleOccurrenceRow>(executor, sql, [olderThan, limit]);
    return result.rows;
  }

  /**
   * Finds occurrences in DISPATCHED or RUNNING whose associated research run is terminal.
   */
  async findUnsynchronizedTerminalRuns(
    limit: number = 50,
    tx?: TransactionContext | PoolClient
  ): Promise<Array<ScheduleOccurrenceRow & { run_status: string; run_error: string | null }>> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT o.*, r.status AS run_status, r.error_message AS run_error
      FROM schedule_occurrences o
      JOIN research_runs r ON o.research_run_id = r.id
      WHERE o.status IN ('DISPATCHED', 'RUNNING')
        AND r.status IN ('COMPLETED', 'FAILED', 'CANCELLED')
      LIMIT $1
    `;
    const result = await executeQuery<ScheduleOccurrenceRow & { run_status: string; run_error: string | null }>(
      executor,
      sql,
      [limit]
    );
    return result.rows;
  }
}

