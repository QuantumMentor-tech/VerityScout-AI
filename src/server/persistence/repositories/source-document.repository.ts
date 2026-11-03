import 'server-only';
import { PoolClient } from 'pg';
import { SourceDocumentRow, SourceAccessState, ExtractionState } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateSourceDocumentInput {
  id?: string;
  run_id: string;
  user_id: string;
  url?: string;
  original_url?: string;
  canonical_url?: string | null;
  domain: string;
  title?: string | null;
  discovery_provider?: string;
  publisher?: string | null;
  published_at?: Date | null;
  access_state?: SourceAccessState;
  extraction_state?: ExtractionState;
  http_status_code?: number | null;
  content_hash?: string | null;
  extracted_text_excerpt?: string | null;
  metadata?: Record<string, unknown>;
}

export class SourceDocumentRepository {
  /**
   * Retrieves a single source document by ID, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<SourceDocumentRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM source_documents WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM source_documents WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await executeQuery<SourceDocumentRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Retrieves a source document by its canonical URL within a specific research run,
   * with optional owner isolation.
   */
  async findByCanonicalUrl(
    runId: string,
    canonicalUrl: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<SourceDocumentRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM source_documents WHERE run_id = $1 AND canonical_url = $2 AND user_id = $3'
      : 'SELECT * FROM source_documents WHERE run_id = $1 AND canonical_url = $2';
    const params = userId ? [runId, canonicalUrl, userId] : [runId, canonicalUrl];
    const result = await executeQuery<SourceDocumentRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists source documents for a given research run with bounded pagination and optional owner scoping.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<SourceDocumentRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM source_documents WHERE run_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM source_documents WHERE run_id = $1';
    const countParams = userId ? [runId, userId] : [runId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = userId
      ? `
        SELECT * FROM source_documents
        WHERE run_id = $1 AND user_id = $2
        ORDER BY retrieved_at ASC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM source_documents
        WHERE run_id = $1
        ORDER BY retrieved_at ASC
        LIMIT $2 OFFSET $3
      `;
    const dataParams = userId ? [runId, userId, limit, offset] : [runId, limit, offset];

    const dataRes = await executeQuery<SourceDocumentRow>(executor, dataSql, dataParams);

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
   * Inserts a new source document, strictly enforcing the 50KB excerpt bounding rule.
   */
  async create(
    input: CreateSourceDocumentInput,
    tx?: TransactionContext | PoolClient
  ): Promise<SourceDocumentRow> {
    const executor = getExecutor(tx);

    // Enforce SEC-032 50KB excerpt cap defensively in code before hitting database constraint
    let excerpt = input.extracted_text_excerpt ?? null;
    if (excerpt && Buffer.byteLength(excerpt, 'utf-8') > 51200) {
      excerpt = Buffer.from(excerpt, 'utf-8').subarray(0, 51200).toString('utf-8');
    }

    const sql = `
      INSERT INTO source_documents (
        id, run_id, user_id, url, canonical_url, domain, title, publisher,
        published_at, access_state, extraction_state, http_status_code,
        extracted_text_excerpt, metadata
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.run_id,
      input.user_id,
      input.url,
      input.canonical_url ?? null,
      input.domain,
      input.title ?? null,
      input.publisher ?? null,
      input.published_at ?? null,
      input.access_state ?? SourceAccessState.ACCESSIBLE,
      input.extraction_state ?? ExtractionState.SUCCESS,
      input.http_status_code ?? null,
      excerpt,
      JSON.stringify(input.metadata ?? {}),
    ];

    const result = await executeQuery<SourceDocumentRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create source document: database returned no rows');
    }
    return row;
  }

  /**
   * Updates source document retrieval and extraction state.
   */
  async updateState(
    id: string,
    accessState: SourceAccessState,
    extractionState: ExtractionState,
    httpStatusCode?: number | null,
    tx?: TransactionContext | PoolClient
  ): Promise<SourceDocumentRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE source_documents
      SET access_state = $2,
          extraction_state = $3,
          http_status_code = COALESCE($4, http_status_code)
      WHERE id = $1
      RETURNING *
    `;
    const result = await executeQuery<SourceDocumentRow>(executor, sql, [
      id,
      accessState,
      extractionState,
      httpStatusCode ?? null,
    ]);
    return result.rows[0] ?? null;
  }

  /**
   * Concurrency-safe atomic insert-or-resolve method for canonical source documents.
   * If a source document with the same (run_id, canonical_url) already exists within the run,
   * returns the existing row with isNew: false.
   */
  async upsertOrResolve(
    input: CreateSourceDocumentInput,
    tx?: TransactionContext | PoolClient
  ): Promise<{ document: SourceDocumentRow; isNew: boolean }> {
    const canonicalUrl = input.canonical_url ?? input.original_url ?? input.url ?? '';
    const existing = await this.findByCanonicalUrl(input.run_id, canonicalUrl, input.user_id, tx);
    if (existing) {
      return { document: existing, isNew: false };
    }

    try {
      const created = await this.create(input, tx);
      return { document: created, isNew: true };
    } catch (err: unknown) {
      // Concurrency race defense: if another concurrent transaction inserted the same (run_id, canonical_url)
      const isUniqueViolation =
        (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505') ||
        (err instanceof Error && err.message.includes('uq_source_documents_run_canonical'));

      if (isUniqueViolation) {
        const resolved = await this.findByCanonicalUrl(input.run_id, canonicalUrl, input.user_id, tx);
        if (resolved) {
          return { document: resolved, isNew: false };
        }
      }
      throw err;
    }
  }
}
