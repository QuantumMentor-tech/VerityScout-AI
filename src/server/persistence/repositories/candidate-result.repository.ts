import 'server-only';
import { PoolClient } from 'pg';
import { CandidateResultRow, MatchClassification } from '../types';
import { TransactionContext, withTransaction } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateCandidateResultInput {
  id?: string;
  run_id: string;
  user_id: string;
  name: string;
  match_classification: MatchClassification;
  brand?: string | null;
  model_number?: string | null;
  price_numeric?: string | null;
  currency_code?: string;
  availability_status?: string | null;
  primary_source_url?: string | null;
  specifications?: Record<string, unknown>;
  conflicts?: Record<string, unknown>;
  exclusion_reason?: string | null;
}

export interface CandidateEvidenceLinkInput {
  evidence_record_id: string;
  claim_type?: string;
}

export interface CreateCandidateWithEvidenceInput extends CreateCandidateResultInput {
  evidence_links: CandidateEvidenceLinkInput[];
}

export class CandidateResultRepository {
  /**
   * Retrieves a candidate result by ID, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<CandidateResultRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM candidate_results WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM candidate_results WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await executeQuery<CandidateResultRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists candidate results for a given research run with bounded pagination and optional owner scoping.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<CandidateResultRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM candidate_results WHERE run_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM candidate_results WHERE run_id = $1';
    const countParams = userId ? [runId, userId] : [runId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = userId
      ? `
        SELECT * FROM candidate_results
        WHERE run_id = $1 AND user_id = $2
        ORDER BY created_at ASC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM candidate_results
        WHERE run_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
      `;
    const dataParams = userId ? [runId, userId, limit, offset] : [runId, limit, offset];

    const dataRes = await executeQuery<CandidateResultRow>(executor, dataSql, dataParams);

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
   * Retrieves linked evidence records for a candidate from the junction table.
   */
  async listLinkedEvidence(
    candidateId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<Array<{ evidence_record_id: string; claim_type: string }>> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT evidence_record_id, claim_type
      FROM candidate_evidence_links
      WHERE candidate_id = $1
    `;
    const res = await executeQuery<{ evidence_record_id: string; claim_type: string }>(
      executor,
      sql,
      [candidateId]
    );
    return res.rows;
  }

  /**
   * Atomically creates a candidate result and associates all supporting evidence links
   * within a single database transaction. If any evidence link fails or attempts ID
   * substitution from another owner, the entire operation safely rolls back.
   */
  async createWithEvidence(
    input: CreateCandidateWithEvidenceInput,
    tx?: TransactionContext | PoolClient
  ): Promise<CandidateResultRow> {
    const client = tx && 'client' in tx ? tx.client : (tx as PoolClient | undefined);

    return withTransaction(async (transactionTx) => {
      const candidateSql = `
        INSERT INTO candidate_results (
          id, run_id, user_id, name, match_classification, brand, model_number,
          price_numeric, currency_code, availability_status, primary_source_url,
          specifications, conflicts, exclusion_reason
        ) VALUES (
          COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING *
      `;
      const candidateParams = [
        input.id ?? null,
        input.run_id,
        input.user_id,
        input.name,
        input.match_classification,
        input.brand ?? null,
        input.model_number ?? null,
        input.price_numeric ?? null,
        input.currency_code ?? 'USD',
        input.availability_status ?? null,
        input.primary_source_url ?? null,
        JSON.stringify(input.specifications ?? {}),
        JSON.stringify(input.conflicts ?? {}),
        input.exclusion_reason ?? null,
      ];

      const candidateRes = await transactionTx.query<CandidateResultRow>(
        candidateSql,
        candidateParams
      );
      const candidate = candidateRes.rows[0];
      if (!candidate) {
        throw new Error('Failed to create candidate result: database returned no rows');
      }

      // Insert junction records in candidate_evidence_links while verifying owner coherence
      for (const link of input.evidence_links) {
        // Anti-ID substitution check: verify linked evidence record is owned by same user (AC-05)
        const evCheck = await transactionTx.query<{ user_id: string }>(
          'SELECT user_id FROM evidence_records WHERE id = $1',
          [link.evidence_record_id]
        );
        if (evCheck.rows[0] && evCheck.rows[0].user_id !== input.user_id) {
          throw new Error(
            `ID substitution violation: evidence record ${link.evidence_record_id} does not belong to user ${input.user_id}`
          );
        }

        const linkSql = `
          INSERT INTO candidate_evidence_links (
            candidate_id, evidence_record_id, claim_type
          ) VALUES ($1, $2, $3)
          ON CONFLICT (candidate_id, evidence_record_id) DO NOTHING
        `;
        await transactionTx.query(linkSql, [
          candidate.id,
          link.evidence_record_id,
          link.claim_type ?? 'general',
        ]);
      }

      return candidate;
    }, client);
  }

  /**
   * Updates the deterministic constraint evaluation JSON on an existing candidate result,
   * scoped to tenant ownership.
   */
  async updateConstraintEvaluation(
    candidateId: string,
    evaluation: {
      passedConstraints: readonly string[];
      failedConstraints: readonly string[];
      mismatchReason?: string | undefined;
    },
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<CandidateResultRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? `
        UPDATE candidate_results
        SET constraint_evaluation = $1
        WHERE id = $2 AND user_id = $3
        RETURNING *
      `
      : `
        UPDATE candidate_results
        SET constraint_evaluation = $1
        WHERE id = $2
        RETURNING *
      `;
    const params = userId
      ? [JSON.stringify(evaluation), candidateId, userId]
      : [JSON.stringify(evaluation), candidateId];

    const result = await executeQuery<CandidateResultRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }
}
