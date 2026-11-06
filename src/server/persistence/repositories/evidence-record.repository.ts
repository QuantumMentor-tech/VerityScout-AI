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
  source_id?: string;
  source_document_id?: string;
  run_id: string;
  user_id: string;
  candidate_id?: string | null;
  claim_key?: string;
  claim_text?: string;
  extracted_raw_value?: string;
  normalized_value?: string;
  unit_or_currency?: string | null;
  verbatim_quote?: string;
  verbatim_excerpt?: string;
  verification_state: VerificationState;
  conflict_details?: string | null;
  extraction_method?: 'LLM_STRUCTURED' | 'REGEX_DETERMINISTIC' | 'META_TAG' | 'DOM_SELECTOR';
  location_in_document?: string | null;
  confidence_score?: string | number | null;
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
        WHERE source_id = $1 AND user_id = $2
        ORDER BY extracted_at ASC
      `
      : `
        SELECT * FROM evidence_records
        WHERE source_id = $1
        ORDER BY extracted_at ASC
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
        ORDER BY extracted_at ASC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM evidence_records
        WHERE run_id = $1
        ORDER BY extracted_at ASC
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
        id, source_id, run_id, user_id, candidate_id, claim_key,
        extracted_raw_value, normalized_value, unit_or_currency,
        verbatim_quote, verification_state, conflict_details,
        extraction_method, location_in_document, confidence_score
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING *
    `;
    const sourceId = input.source_id ?? input.source_document_id ?? '';
    const claimKey = input.claim_key ?? input.claim_text ?? 'general_claim';
    const rawVal = input.extracted_raw_value ?? input.claim_text ?? '';
    const normVal = input.normalized_value ?? rawVal;
    const verbatim = input.verbatim_quote ?? input.verbatim_excerpt ?? rawVal;
    const method = input.extraction_method ?? 'LLM_STRUCTURED';
    const confidence = input.confidence_score !== undefined && input.confidence_score !== null
      ? String(input.confidence_score)
      : '1.0000';

    const params = [
      input.id ?? null,
      sourceId,
      input.run_id,
      input.user_id,
      input.candidate_id ?? null,
      claimKey,
      rawVal,
      normVal,
      input.unit_or_currency ?? null,
      verbatim,
      input.verification_state,
      input.conflict_details ?? null,
      method,
      input.location_in_document ?? null,
      confidence,
    ];

    const result = await executeQuery<EvidenceRecordRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create evidence record: database returned no rows');
    }
    return row;
  }

  /**
   * Concurrently creates multiple evidence records within an optional transaction.
   */
  async batchCreate(
    inputs: readonly CreateEvidenceRecordInput[],
    tx?: TransactionContext | PoolClient
  ): Promise<EvidenceRecordRow[]> {
    const results: EvidenceRecordRow[] = [];
    for (const input of inputs) {
      const record = await this.create(input, tx);
      results.push(record);
    }
    return results;
  }
}
