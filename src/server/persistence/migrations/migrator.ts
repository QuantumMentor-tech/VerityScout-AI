import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { getPool, getClient } from '../database';
import { logger } from '@/lib/logging/logger';
import { AppError } from '@/lib/errors/app-error';

export interface MigrationFile {
  name: string;
  filePath: string;
  checksum: string;
  content: string;
}

export interface AppliedMigrationRecord {
  id: number;
  name: string;
  applied_at: Date;
  checksum: string;
}

export interface MigrationStatusItem {
  name: string;
  isApplied: boolean;
  appliedAt: Date | null;
  fileChecksum: string;
  dbChecksum: string | null;
  isDrifted: boolean;
}

export interface MigrationStatusReport {
  totalMigrations: number;
  appliedCount: number;
  pendingCount: number;
  hasDrift: boolean;
  items: MigrationStatusItem[];
}

export interface MigrationApplyResult {
  appliedCount: number;
  appliedMigrations: string[];
  totalDurationMs: number;
}

export class MigrationDriftError extends AppError {
  constructor(migrationName: string, fileChecksum: string, dbChecksum: string) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Database migration drift detected in "${migrationName}". Recorded checksum: ${dbChecksum}, current file checksum: ${fileChecksum}. Applied migrations are immutable.`,
      publicMessage: 'Database schema verification failed due to version drift.',
      statusCode: 500,
      isOperational: false,
    });
    this.name = 'MigrationDriftError';
  }
}

export class MigrationExecutionError extends AppError {
  public readonly migrationName: string;

  constructor(migrationName: string, cause: unknown) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to execute database migration "${migrationName}": ${(cause as Error).message}`,
      publicMessage: 'Database migration execution failed.',
      statusCode: 500,
      isOperational: false,
      cause,
    });
    this.name = 'MigrationExecutionError';
    this.migrationName = migrationName;
  }
}

/**
 * Default directory containing versioned .sql migration files.
 */
export function getDefaultMigrationsDir(): string {
  return path.resolve(process.cwd(), 'src/server/persistence/migrations');
}

/**
 * Computes a SHA-256 checksum for a string.
 */
export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Loads and sorts all .sql migration files from the specified migrations directory.
 */
export function loadMigrationFiles(dirPath: string = getDefaultMigrationsDir()): MigrationFile[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath);
  const sqlFiles = entries
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  return sqlFiles.map((file) => {
    const fullPath = path.join(dirPath, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return {
      name: file,
      filePath: fullPath,
      checksum: computeSha256(content),
      content,
    };
  });
}

/**
 * Ensures the `_migrations` tracking table exists.
 */
export async function ensureMigrationTable(client: Pool | PoolClient): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64) NOT NULL
    );
  `;
  await client.query(ddl);
}

/**
 * Retrieves the status of all available migrations against the database.
 */
export async function getMigrationStatus(
  clientOrPool?: Pool | PoolClient,
  dirPath?: string
): Promise<MigrationStatusReport> {
  const runner = clientOrPool ?? getPool();
  await ensureMigrationTable(runner);

  const files = loadMigrationFiles(dirPath);
  const res = await runner.query<AppliedMigrationRecord>(
    'SELECT id, name, applied_at, checksum FROM _migrations ORDER BY id ASC'
  );
  const appliedMap = new Map<string, AppliedMigrationRecord>(
    res.rows.map((row) => [row.name, row])
  );

  let hasDrift = false;
  const items: MigrationStatusItem[] = files.map((file) => {
    const appliedRecord = appliedMap.get(file.name);
    const isApplied = Boolean(appliedRecord);
    const dbChecksum = appliedRecord ? appliedRecord.checksum : null;
    const isDrifted = isApplied && dbChecksum !== file.checksum;

    if (isDrifted) {
      hasDrift = true;
    }

    return {
      name: file.name,
      isApplied,
      appliedAt: appliedRecord ? new Date(appliedRecord.applied_at) : null,
      fileChecksum: file.checksum,
      dbChecksum,
      isDrifted,
    };
  });

  const appliedCount = items.filter((item) => item.isApplied).length;
  const pendingCount = items.filter((item) => !item.isApplied).length;

  return {
    totalMigrations: items.length,
    appliedCount,
    pendingCount,
    hasDrift,
    items,
  };
}

/**
 * Applies all pending database migrations in sequential order.
 * Verifies integrity of previous migrations before applying new ones.
 */
export async function applyMigrations(
  clientOrPool?: Pool | PoolClient,
  dirPath?: string
): Promise<MigrationApplyResult> {
  const startTime = Date.now();
  let client: PoolClient;
  let ownsClient = false;

  if (clientOrPool instanceof Pool) {
    // Caller supplied a Pool
    client = await clientOrPool.connect();
    ownsClient = true;
  } else if (clientOrPool) {
    // Caller supplied a checked-out client
    client = clientOrPool;
    ownsClient = false;
  } else {
    // Default: acquire from application connection pool
    client = await getClient();
    ownsClient = true;
  }

  try {
    await ensureMigrationTable(client);

    const status = await getMigrationStatus(client, dirPath);
    if (status.hasDrift) {
      const drifted = status.items.find((i) => i.isDrifted)!;
      throw new MigrationDriftError(drifted.name, drifted.fileChecksum, drifted.dbChecksum!);
    }

    const pending = status.items.filter((i) => !i.isApplied);
    if (pending.length === 0) {
      logger.info('MIGRATION_NO_OP', 'Database schema is up to date. No pending migrations.');
      return {
        appliedCount: 0,
        appliedMigrations: [],
        totalDurationMs: Date.now() - startTime,
      };
    }

    const files = loadMigrationFiles(dirPath);
    const filesByName = new Map(files.map((f) => [f.name, f]));
    const appliedMigrations: string[] = [];

    for (const item of pending) {
      const file = filesByName.get(item.name);
      if (!file) {
        throw new Error(`Migration file "${item.name}" not found on disk.`);
      }

      logger.info('MIGRATION_EXECUTE', `Applying database migration "${file.name}"...`);

      try {
        await client.query('BEGIN');
        await client.query(file.content);
        await client.query(
          'INSERT INTO _migrations (name, checksum) VALUES ($1, $2)',
          [file.name, file.checksum]
        );
        await client.query('COMMIT');
        appliedMigrations.push(file.name);
        logger.info('MIGRATION_SUCCESS', `Successfully applied migration "${file.name}".`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('MIGRATION_ERROR', `Migration failed: "${file.name}". Rolled back transaction.`, {
          error: (err as Error).message,
        });
        throw new MigrationExecutionError(file.name, err);
      }
    }

    return {
      appliedCount: appliedMigrations.length,
      appliedMigrations,
      totalDurationMs: Date.now() - startTime,
    };
  } finally {
    if (ownsClient) {
      client.release();
    }
  }
}
