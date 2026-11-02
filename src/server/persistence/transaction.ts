import 'server-only';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getClient, DatabaseError } from './database';
import { logger } from '@/lib/logging/logger';

/**
 * Contextual transaction interface provided to transactional operations.
 * Guarantees that all queries execute on the exact same underlying connection.
 */
export interface TransactionContext {
  /**
   * Executes a parameterized query within this transaction's connection scope.
   */
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;

  /**
   * The underlying PostgreSQL client connection.
   */
  readonly client: PoolClient;
}

/**
 * Executes a callback within a managed PostgreSQL ACID transaction.
 *
 * Rules:
 * - If an existingClient is provided, the operation participates in the existing transaction context
 *   (using a SAVEPOINT to protect parent transaction integrity).
 * - If no existingClient is provided, a fresh connection is checked out from the pool,
 *   BEGIN is executed, the callback runs, and on success COMMIT is executed.
 * - On any error, ROLLBACK is issued, preserving the original error for diagnostics without leaking credentials.
 * - The connection is guaranteed to be released back to the pool in a finally block.
 */
export async function withTransaction<T>(
  operation: (tx: TransactionContext) => Promise<T>,
  existingClient?: PoolClient
): Promise<T> {
  // If already participating in an outer transaction, use a Savepoint
  if (existingClient) {
    const savepointId = `sp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await existingClient.query(`SAVEPOINT ${savepointId}`);

    const txContext: TransactionContext = {
      query: <R extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) =>
        existingClient.query<R>(text, params),
      client: existingClient,
    };

    try {
      const result = await operation(txContext);
      await existingClient.query(`RELEASE SAVEPOINT ${savepointId}`);
      return result;
    } catch (err) {
      try {
        await existingClient.query(`ROLLBACK TO SAVEPOINT ${savepointId}`);
      } catch (rollbackErr) {
        logger.error('TX_SAVEPOINT_ROLLBACK_ERROR', 'Failed to rollback to savepoint in nested transaction', {
          error: (rollbackErr as Error).message,
        });
      }
      throw err;
    }
  }

  // Standalone top-level transaction
  const client = await getClient();
  const txContext: TransactionContext = {
    query: <R extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) =>
      client.query<R>(text, params),
    client,
  };

  try {
    await client.query('BEGIN');
    const result = await operation(txContext);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('TX_ROLLBACK_SECONDARY_ERROR', 'Secondary error during PostgreSQL transaction rollback', {
        rollbackError: (rollbackError as Error).message,
        originalError: (error as Error).message,
      });
    }

    if (error instanceof DatabaseError) {
      throw error;
    }
    throw new DatabaseError((error as Error).message, error);
  } finally {
    client.release();
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executes a callback within a managed transaction that is securely bound to a specific user's
 * identity context for PostgreSQL Row-Level Security (RLS) enforcement.
 *
 * Security Invariants:
 * 1. Validates userId is a valid UUIDv4 format.
 * 2. Executes `SELECT set_config('app.current_user_id', $1, true)` where `is_local = true`.
 *    This scopes the setting strictly to the current transaction.
 * 3. On COMMIT or ROLLBACK, PostgreSQL automatically removes the local transaction setting.
 * 4. The pooled connection is guaranteed clean upon return to pg.Pool, preventing tenant cross-contamination.
 */
export async function withUserContext<T>(
  userId: string,
  operation: (tx: TransactionContext) => Promise<T>,
  existingClient?: PoolClient
): Promise<T> {
  if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
    throw new DatabaseError(`Invalid user ID format for database security context: ${userId}`);
  }

  return withTransaction(async (tx) => {
    // Parameterized transaction-local session configuration (SEC-008)
    await tx.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    return operation(tx);
  }, existingClient);
}

