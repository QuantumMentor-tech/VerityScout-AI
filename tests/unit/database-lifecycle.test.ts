import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  redactDatabaseUrl,
  DatabaseError,
  getDatabasePoolConfig,
  getPool,
  closePool,
  _resetPoolForTesting,
} from '@/server/persistence/database';
import { _resetServerEnvCacheForTesting } from '@/lib/config/server-env';

describe('Database Connection & Lifecycle Management (Step 22)', () => {
  beforeEach(() => {
    _resetServerEnvCacheForTesting();
    _resetPoolForTesting();
  });

  afterEach(async () => {
    await closePool();
    _resetServerEnvCacheForTesting();
    _resetPoolForTesting();
  });

  it('DB-LIFECYCLE-001: Redacts sensitive passwords from PostgreSQL connection URLs', () => {
    const rawUrl = 'postgres://admin:super_secret_password_1234@db.production.internal:5432/verityscout';
    const redacted = redactDatabaseUrl(rawUrl);

    expect(redacted).not.toContain('super_secret_password_1234');
    expect(redacted).toBe('postgres://admin:*****@db.production.internal:5432/verityscout');
  });

  it('DB-LIFECYCLE-002: Builds valid pool config from server environment defaults', () => {
    const config = getDatabasePoolConfig();

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(5432);
    expect(config.user).toBe('verityscout');
    expect(config.database).toBe('verityscout_dev');
    expect(config.max).toBe(10);
    expect(config.idleTimeoutMillis).toBe(30000);
    expect(config.connectionTimeoutMillis).toBe(5000);
  });

  it('DB-LIFECYCLE-003: DatabaseError formats error message without leaking sensitive cause properties', () => {
    const fakeError = new Error('password authentication failed for user "verityscout"');
    (fakeError as any).code = '28P01';

    const dbError = new DatabaseError('Authentication failed', fakeError);

    expect(dbError.name).toBe('DatabaseError');
    expect(dbError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(dbError.originalCode).toBe('28P01');
    expect(dbError.publicMessage).toBe('A persistent database service error occurred. Please try again later.');
    expect(dbError.isOperational).toBe(true);
  });

  it('DB-LIFECYCLE-004: getPool returns singleton pool and closePool drains cleanly', async () => {
    const pool1 = getPool();
    const pool2 = getPool();

    expect(pool1).toBe(pool2);

    const endSpy = vi.spyOn(pool1, 'end').mockResolvedValue(undefined as any);
    await closePool();

    expect(endSpy).toHaveBeenCalled();
  });
});
