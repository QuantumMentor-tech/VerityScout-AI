import 'server-only';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getPool } from '../database';
import { TransactionContext } from '../transaction';

export type QueryExecutor = Pool | PoolClient | TransactionContext;

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Resolves the query execution context: uses the caller's transaction context if provided,
 * otherwise falls back to the application connection pool.
 */
export function getExecutor(txOrClient?: TransactionContext | PoolClient): QueryExecutor {
  if (txOrClient) {
    return txOrClient;
  }
  return getPool();
}

/**
 * Executes a parameterized SQL query safely against the provided executor.
 */
export async function executeQuery<T extends QueryResultRow = QueryResultRow>(
  executor: QueryExecutor,
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return (executor as { query: (sql: string, p: unknown[]) => Promise<QueryResult<T>> }).query(text, params);
}

/**
 * Validates and sanitizes dynamic ORDER BY clauses against a strict schema allowlist.
 * Prevents SQL injection via sorting parameters.
 */
export function sanitizeOrderBy(
  allowedColumns: readonly string[],
  requestedColumn?: string,
  requestedDirection?: 'ASC' | 'DESC' | 'asc' | 'desc',
  fallback: string = 'created_at DESC'
): string {
  if (!requestedColumn) {
    return fallback;
  }

  const normalizedColumn = requestedColumn.toLowerCase().trim();
  if (!allowedColumns.includes(normalizedColumn)) {
    return fallback;
  }

  const direction = requestedDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return `${normalizedColumn} ${direction}`;
}

/**
 * Computes deterministic, bounded pagination metadata.
 */
export function resolvePagination(options?: PaginationOptions): PaginationMeta {
  const page = Math.max(1, Math.floor(options?.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(options?.limit ?? 20)));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
