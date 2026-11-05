import 'server-only';
import { PoolClient } from 'pg';
import { RunStage, ProgressEventType, ResearchProgressEventRow } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateProgressEventInput {
  run_id: string;
  user_id: string;
  stage: RunStage;
  event_type: ProgressEventType;
  message: string;
  sequence_number?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class ProgressEventRepository {
  /**
   * Appends an immutable progress event for a research run.
   * If sequence_number is not explicitly provided, it is atomically assigned
   * as the next incremental sequence number for the run.
   */
  async create(
    input: CreateProgressEventInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchProgressEventRow> {
    const executor = getExecutor(tx);

    let sql: string;
    let params: unknown[];

    if (input.sequence_number !== undefined) {
      sql = `
        INSERT INTO research_progress_events (
          run_id, user_id, stage, event_type, sequence_number, message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      params = [
        input.run_id,
        input.user_id,
        input.stage,
        input.event_type,
        input.sequence_number,
        input.message,
        JSON.stringify(input.metadata ?? {}),
      ];
    } else {
      sql = `
        INSERT INTO research_progress_events (
          run_id, user_id, stage, event_type, sequence_number, message, metadata
        ) VALUES (
          $1, $2, $3, $4,
          COALESCE((SELECT MAX(sequence_number) FROM research_progress_events WHERE run_id = $1), 0) + 1,
          $5, $6
        )
        RETURNING *
      `;
      params = [
        input.run_id,
        input.user_id,
        input.stage,
        input.event_type,
        input.message,
        JSON.stringify(input.metadata ?? {}),
      ];
    }

    const result = await executeQuery<ResearchProgressEventRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to insert research progress event: no rows returned');
    }
    return row;
  }

  /**
   * Lists all progress events for a run ordered chronologically by sequence_number.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchProgressEventRow[]> {
    const executor = getExecutor(tx);
    const sql = userId
      ? `
        SELECT * FROM research_progress_events
        WHERE run_id = $1 AND user_id = $2
        ORDER BY sequence_number ASC
      `
      : `
        SELECT * FROM research_progress_events
        WHERE run_id = $1
        ORDER BY sequence_number ASC
      `;
    const params = userId ? [runId, userId] : [runId];

    const result = await executeQuery<ResearchProgressEventRow>(executor, sql, params);
    return result.rows;
  }

  /**
   * Retrieves the most recent progress event recorded for a run.
   */
  async getLatestEvent(
    runId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchProgressEventRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT * FROM research_progress_events
      WHERE run_id = $1
      ORDER BY sequence_number DESC
      LIMIT 1
    `;
    const result = await executeQuery<ResearchProgressEventRow>(executor, sql, [runId]);
    return result.rows[0] ?? null;
  }
}

