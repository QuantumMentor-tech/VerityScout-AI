import 'server-only';
import { PoolClient } from 'pg';
import { SourceDiscoveryRow } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateSourceDiscoveryInput {
  id?: string;
  source_document_id: string;
  run_id: string;
  user_id: string;
  query_variant_id?: string | null;
  query_text: string;
  discovery_provider: string;
  provider_result_id?: string | null;
  original_url: string;
  title: string;
  snippet?: string | null;
  relevance_score?: number | null;
  discovered_at?: Date | null;
}

export class SourceDiscoveryRepository {
  /**
   * Retrieves a single discovery record by ID, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<SourceDiscoveryRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM source_discoveries WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM source_discoveries WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await executeQuery<SourceDiscoveryRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists discovery records linked to a specific canonical source document.
   */
  async listBySourceId(
    sourceDocumentId: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<SourceDiscoveryRow[]> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM source_discoveries WHERE source_document_id = $1 AND user_id = $2 ORDER BY discovered_at ASC'
      : 'SELECT * FROM source_discoveries WHERE source_document_id = $1 ORDER BY discovered_at ASC';
    const params = userId ? [sourceDocumentId, userId] : [sourceDocumentId];
    const result = await executeQuery<SourceDiscoveryRow>(executor, sql, params);
    return result.rows;
  }

  /**
   * Lists all discovery records for a given research run with pagination and owner scoping.
   */
  async listByRunId(
    runId: string,
    userId?: string,
    options?: PaginationOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<SourceDiscoveryRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const countSql = userId
      ? 'SELECT COUNT(*)::int AS total FROM source_discoveries WHERE run_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*)::int AS total FROM source_discoveries WHERE run_id = $1';
    const countParams = userId ? [runId, userId] : [runId];

    const countRes = await executeQuery<{ total: number }>(executor, countSql, countParams);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = userId
      ? `
        SELECT * FROM source_discoveries
        WHERE run_id = $1 AND user_id = $2
        ORDER BY discovered_at ASC
        LIMIT $3 OFFSET $4
      `
      : `
        SELECT * FROM source_discoveries
        WHERE run_id = $1
        ORDER BY discovered_at ASC
        LIMIT $2 OFFSET $3
      `;
    const dataParams = userId ? [runId, userId, limit, offset] : [runId, limit, offset];

    const dataRes = await executeQuery<SourceDiscoveryRow>(executor, dataSql, dataParams);

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
   * Inserts a new discovery record linking a query variant search lead to a canonical source document.
   */
  async create(
    input: CreateSourceDiscoveryInput,
    tx?: TransactionContext | PoolClient
  ): Promise<SourceDiscoveryRow> {
    const executor = getExecutor(tx);

    const sql = `
      INSERT INTO source_discoveries (
        id, source_document_id, run_id, user_id, query_variant_id,
        query_text, discovery_provider, provider_result_id, original_url,
        title, snippet, relevance_score, discovered_at
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12, COALESCE($13, NOW())
      )
      RETURNING *
    `;

    const params = [
      input.id ?? null,
      input.source_document_id,
      input.run_id,
      input.user_id,
      input.query_variant_id ?? null,
      input.query_text,
      input.discovery_provider,
      input.provider_result_id ?? null,
      input.original_url,
      input.title,
      input.snippet ?? null,
      input.relevance_score ?? null,
      input.discovered_at ?? null,
    ];

    const result = await executeQuery<SourceDiscoveryRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create source discovery: database returned no rows');
    }
    return row;
  }
}

