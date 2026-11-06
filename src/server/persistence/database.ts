import 'server-only';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getServerEnv } from '@/lib/config/server-env';
import { AppError } from '@/lib/errors/app-error';
import { logger } from '@/lib/logging/logger';

/**
 * Singleton database connection pool instance for server runtime.
 */
let poolInstance: Pool | null = null;

/**
 * Redacts credentials from database connection strings or config summaries.
 * Guaranteed never to log or expose database passwords.
 */
export function redactDatabaseUrl(urlOrHost: string): string {
  if (!urlOrHost) return '';
  return urlOrHost.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@.+)/i, '$1*****$2');
}

/**
 * Custom error class for operational database failures.
 */
export class DatabaseError extends AppError {
  public readonly originalCode?: string | undefined;

  constructor(message: string, originalError?: unknown) {
    const code = (originalError as { code?: string })?.code;
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Database operation failed: ${message}`,
      publicMessage: 'A persistent database service error occurred. Please try again later.',
      statusCode: 500,
      isOperational: true,
      cause: originalError,
    });
    this.name = 'DatabaseError';
    this.originalCode = code;
  }
}

export interface DatabasePoolConfig {
  connectionString?: string | undefined;
  host?: string | undefined;
  port?: number | undefined;
  user?: string | undefined;
  password?: string | undefined;
  database?: string | undefined;
  ssl?: boolean | { rejectUnauthorized: boolean } | undefined;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * Builds standard connection configuration options from validated server environment.
 */
export function getDatabasePoolConfig(): DatabasePoolConfig {
  const env = getServerEnv();

  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      ssl: env.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined,
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
    };
  }

  return {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    ssl: env.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
  };
}

/**
 * Retrieves or lazily creates the server singleton connection pool.
 */
export function getPool(): Pool {
  if (!poolInstance) {
    const config = getDatabasePoolConfig();
    const targetDisplay = config.connectionString
      ? redactDatabaseUrl(config.connectionString)
      : `${config.user}@${config.host}:${config.port}/${config.database}`;

    logger.info('DB_POOL_INIT', `Initializing PostgreSQL connection pool targeting ${targetDisplay}`);

    poolInstance = new Pool(config);

    // Guard against idle client errors triggering unhandled promise rejections
    poolInstance.on('error', (err: Error) => {
      logger.error('DB_IDLE_CLIENT_ERROR', 'Unexpected error on idle PostgreSQL client in pool', {
        error: err.message,
      });
    });
  }

  return poolInstance;
}

/**
 * Acquires a checked-out client from the connection pool.
 * Caller is strictly responsible for releasing client in a finally block.
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  try {
    return await pool.connect();
  } catch (error) {
    logger.error('DB_CONNECT_ERROR', 'Failed to acquire PostgreSQL client from pool', {
      error: (error as Error).message,
    });
    throw new DatabaseError('Failed to establish database connection', error);
  }
}

/**
 * Executes a parameterized SQL query on the centralized connection pool.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const pool = getPool();
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    logger.error('DB_QUERY_ERROR', 'Database query execution error', {
      error: (error as Error).message,
      querySnippet: text.slice(0, 100),
      paramCount: params.length,
    });
    throw new DatabaseError((error as Error).message, error);
  }
}

/**
 * Gracefully shuts down and drains the database pool.
 * Used during application termination, integration tests, or worker shutdown.
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    logger.info('DB_POOL_CLOSE', 'Draining and closing PostgreSQL connection pool');
    await poolInstance.end();
    poolInstance = null;
  }
}

/**
 * Testing helper: sets the pool singleton directly (e.g. For in-memory integration test pools).
 */
export function _setPoolForTesting(pool: Pool | null): void {
  poolInstance = pool;
}

/**
 * Testing helper: resets the pool singleton without draining if already closed.
 */
export function _resetPoolForTesting(): void {
  poolInstance = null;
}
