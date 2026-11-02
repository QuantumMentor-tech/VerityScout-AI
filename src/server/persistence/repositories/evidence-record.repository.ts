import 'server-only';
import { PoolClient } from 'pg';
import { EvidenceRecordRow, VerificationState } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateEvidenceRecordInput {
  id?: string;
  source_document_id: string;
  run_id: string;
  user_id: string;
  claim_text: string;
  verbatim_excerpt: string;
  verification_state: VerificationState;
  confidence_score?: string;
  char_offset_start?: number | null;
  char_offset_end?: number | null;
  evaluation_details?: Record<string, unknown>;
}

export class EvidenceRecordRepository {
  /**
   * Retrieves an evidence record by ID, optionally scoped to owner.
   */
  async findById(

    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<EvidenceRecordRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM evidence_records WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM evidence_records WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await executeQuery<EvidenceRecordRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists all evidence records extracted from a specific source document, optionally scoped to owner.
   */
  async listBySourceId(
    sourceDocumentId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<EvidenceRecordRow[]> {
    const executor = getExecutor(tx);
    const sql = userId
      ? `
        SELECT * FROM evidence_records
        WHERE source_document_id = $1 AND user_id = $2
        ORDER BY char_offset_start ASC NULLS LAST
      `
      : `
        SELECT * FROM evidence_records
        WHERE source_document_id = $1
        ORDER BY char_offset_start ASC NULLS LAST
      `;
    const params = userId ? [sourceDocumentId, userId] : [sourceDocumentId];
    const result = await executeQuery<EvidenceRecordRow>(executor, sql, params);
    return result.rows;
  }

  /**
   * Lists evidence records associated with a research run with bounded pagination and optional owner scoping.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<EvidenceRecordRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM evidence_records WHERE run_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM evidence_records WHERE run_id = $1';
    const countParams = userId ? [runId, userId] : [runId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = userId
      ? `
        SELECT * FROM evidence_records
        WHERE run_id = $1 AND user_id = $2
        ORDER BY created_at ASC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM evidence_records
        WHERE run_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
      `;
    const dataParams = userId ? [runId, userId, limit, offset] : [runId, limit, offset];

    const dataRes = await executeQuery<EvidenceRecordRow>(executor, dataSql, dataParams);

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
   * Creates an evidence record strictly linked to its parent source document.
   */
  async create(
    input: CreateEvidenceRecordInput,
    tx?: TransactionContext | PoolClient
  ): Promise<EvidenceRecordRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO evidence_records (
        id, source_document_id, run_id, user_id, claim_text,
        verbatim_excerpt, verification_state, confidence_score,
        char_offset_start, char_offset_end, evaluation_details
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.source_document_id,
      input.run_id,
      input.user_id,
      input.claim_text,
      input.verbatim_excerpt,
      input.verification_state,
      input.confidence_score ?? '1.000',
      input.char_offset_start ?? null,
      input.char_offset_end ?? null,
      JSON.stringify(input.evaluation_details ?? {}),
    ];

    const result = await executeQuery<EvidenceRecordRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create evidence record: database returned no rows');
    }
    return row;
  }
}
