import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadMigrationFiles,
  computeSha256,
  getMigrationStatus,
  applyMigrations,
  MigrationDriftError,
  MigrationExecutionError,
} from '@/server/persistence/migrations/migrator';
import { PoolClient } from 'pg';

describe('Versioned Database Migration Engine (Step 22)', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
  });

  it('MIGRATE-001: Computes deterministic SHA-256 checksums for migration contents', () => {
    const text = 'CREATE TABLE test_table (id UUID PRIMARY KEY);';
    const hash1 = computeSha256(text);
    const hash2 = computeSha256(text);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('MIGRATE-002: Loads versioned migration files in alphanumeric sort order', () => {
    const files = loadMigrationFiles();

    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files[0]!.name).toBe('0001_initial_schema.sql');
    expect(files[0]!.checksum).toHaveLength(64);
    expect(files[0]!.content).toContain('CREATE TABLE IF NOT EXISTS research_tasks');
  });

  it('MIGRATE-003: Reports pending status when migrations have not yet been applied', async () => {
    mockClient.query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, name, applied_at, checksum FROM _migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const status = await getMigrationStatus(mockClient as unknown as PoolClient);

    expect(status.totalMigrations).toBeGreaterThanOrEqual(1);
    expect(status.appliedCount).toBe(0);
    expect(status.pendingCount).toBe(status.totalMigrations);
    expect(status.hasDrift).toBe(false);
    expect(status.items[0]!.isApplied).toBe(false);
  });

  it('MIGRATE-004: Detects schema drift if an applied migration checksum does not match disk', async () => {
    const files = loadMigrationFiles();
    const target = files[0]!;

    mockClient.query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, name, applied_at, checksum FROM _migrations')) {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              name: target.name,
              applied_at: new Date(),
              checksum: 'tampered_or_outdated_checksum_that_differs_from_disk_hash_1234567890',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const status = await getMigrationStatus(mockClient as unknown as PoolClient);

    expect(status.hasDrift).toBe(true);
    expect(status.items[0]!.isDrifted).toBe(true);

    await expect(applyMigrations(mockClient as unknown as PoolClient)).rejects.toThrow(MigrationDriftError);
  });

  it('MIGRATE-005: Applies pending migrations within transactions and records them in _migrations', async () => {
    const files = loadMigrationFiles();
    mockClient.query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, name, applied_at, checksum FROM _migrations')) {
        return Promise.resolve({ rows: [] }); // None applied yet
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await applyMigrations(mockClient as unknown as PoolClient);

    expect(result.appliedCount).toBe(files.length);
    expect(result.appliedMigrations).toContain('0001_initial_schema.sql');

    // Should have called BEGIN, migration DDL, INSERT into _migrations, and COMMIT
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(files[0]!.content);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO _migrations'),
      [files[0]!.name, files[0]!.checksum]
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('MIGRATE-006: Rolls back transaction and throws MigrationExecutionError on SQL execution failure', async () => {
    mockClient.query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, name, applied_at, checksum FROM _migrations')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('CREATE TABLE IF NOT EXISTS research_tasks')) {
        return Promise.reject(new Error('Syntax error in DDL statement'));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(applyMigrations(mockClient as unknown as PoolClient)).rejects.toThrow(MigrationExecutionError);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
