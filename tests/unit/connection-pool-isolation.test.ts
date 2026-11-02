import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withUserContext } from '@/server/persistence/transaction';
import * as databaseModule from '@/server/persistence/database';
import { PoolClient } from 'pg';

describe('Database Connection Pool & RLS Identity Context Isolation (Step 24 / AC-09, AC-10)', () => {
  const userA = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const userB = 'b1ffcd88-8d1c-3fe7-aa5c-5aa8ac270b22';

  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('set_config')) {
          return Promise.resolve({ rows: [{ set_config: 'ok' }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };

    vi.spyOn(databaseModule, 'getClient').mockResolvedValue(mockClient as unknown as PoolClient);
  });

  it('POOL-ISO-001: Validates UUID format and rejects invalid or injected user IDs', async () => {
    const maliciousInput = "a0eebc99'; DROP TABLE research_tasks; --";

    await expect(
      withUserContext(maliciousInput, async () => 'test')
    ).rejects.toThrow(/Invalid user ID format/i);

    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('POOL-ISO-002: Binds identity context locally with is_local=true within transaction', async () => {
    const result = await withUserContext(userA, async (tx) => {
      await tx.query('SELECT * FROM research_tasks');
      return 'user-a-success';
    });

    expect(result).toBe('user-a-success');

    // Expected sequence: BEGIN -> set_config(..., true) -> query -> COMMIT -> release()
    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      `SELECT set_config('app.current_user_id', $1, true)`,
      [userA]
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(3, 'SELECT * FROM research_tasks', []);
    expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('POOL-ISO-003: Ensures sequential transactions from User A and User B receive isolated contexts', async () => {
    // 1. Run User A transaction
    await withUserContext(userA, async (tx) => {
      await tx.query('SELECT COUNT(*) FROM research_tasks');
    });

    // Verify User A context call
    expect(mockClient.query).toHaveBeenCalledWith(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [userA]
    );

    mockClient.query.mockClear();

    // 2. Run User B transaction on (simulated reused) connection
    await withUserContext(userB, async (tx) => {
      await tx.query('SELECT COUNT(*) FROM research_tasks');
    });

    // Verify User B context call does not carry User A
    expect(mockClient.query).toHaveBeenCalledWith(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [userB]
    );
  });

  it('POOL-ISO-004: Cleanly rolls back on error and releases connection without context leakage', async () => {
    await expect(
      withUserContext(userA, async () => {
        throw new Error('Simulated query failure during transaction');
      })
    ).rejects.toThrow(/Simulated query failure/i);

    // Verify ROLLBACK and release() were called
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
