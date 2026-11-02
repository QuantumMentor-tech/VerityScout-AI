import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTransaction } from '@/server/persistence/transaction';
import * as dbModule from '@/server/persistence/database';
import { PoolClient } from 'pg';

describe('Transaction Manager & Atomic Operations (Step 22)', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      release: vi.fn(),
    };
    vi.spyOn(dbModule, 'getClient').mockResolvedValue(mockClient as unknown as PoolClient);
  });

  it('TX-TEST-001: Successfully commits top-level transaction and releases client', async () => {
    const result = await withTransaction(async (tx) => {
      await tx.query('INSERT INTO research_tasks (id) VALUES ($1)', ['task-123']);
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'INSERT INTO research_tasks (id) VALUES ($1)', ['task-123']);
    expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('TX-TEST-002: Executes ROLLBACK and rethrows original error on failure', async () => {
    const errorToThrow = new Error('Constraint violation error');

    await expect(
      withTransaction(async (tx) => {
        await tx.query('INSERT INTO research_tasks (id) VALUES ($1)', ['task-123']);
        throw errorToThrow;
      })
    ).rejects.toThrow(/Constraint violation error/);

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'INSERT INTO research_tasks (id) VALUES ($1)', ['task-123']);
    expect(mockClient.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('TX-TEST-003: Releases client even if ROLLBACK itself encounters an error', async () => {
    mockClient.query = vi.fn().mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql === 'ROLLBACK') return Promise.reject(new Error('Connection lost during rollback'));
      return Promise.reject(new Error('Original operation failed'));
    });

    await expect(
      withTransaction(async (tx) => {
        await tx.query('SELECT 1');
      })
    ).rejects.toThrow(/Original operation failed/);

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('TX-TEST-004: Participates in outer transaction using SAVEPOINT when existing client is passed', async () => {
    const outerClient: Partial<PoolClient> & { query: ReturnType<typeof vi.fn> } = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const res = await withTransaction(async (tx) => {
      await tx.query('UPDATE research_runs SET status = $1', ['RUNNING']);
      return 42;
    }, outerClient as unknown as PoolClient);

    expect(res).toBe(42);
    // Should NOT have called getClient from pool
    expect(dbModule.getClient).not.toHaveBeenCalled();
    // Should have created and released a SAVEPOINT on the outerClient
    expect(outerClient.query).toHaveBeenCalledWith(expect.stringMatching(/^SAVEPOINT sp_/));
    expect(outerClient.query).toHaveBeenCalledWith('UPDATE research_runs SET status = $1', ['RUNNING']);
    expect(outerClient.query).toHaveBeenCalledWith(expect.stringMatching(/^RELEASE SAVEPOINT sp_/));
  });

  it('TX-TEST-005: Rolls back to SAVEPOINT on failure without releasing outer client', async () => {
    const outerClient: Partial<PoolClient> & { query: ReturnType<typeof vi.fn> } = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await expect(
      withTransaction(async () => {
        throw new Error('Nested failure');
      }, outerClient as unknown as PoolClient)
    ).rejects.toThrow('Nested failure');

    expect(outerClient.query).toHaveBeenCalledWith(expect.stringMatching(/^SAVEPOINT sp_/));
    expect(outerClient.query).toHaveBeenCalledWith(expect.stringMatching(/^ROLLBACK TO SAVEPOINT sp_/));
  });
});
