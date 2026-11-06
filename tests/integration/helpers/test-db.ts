import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newDb, DataType, IMemoryDb } from 'pg-mem';
import { Pool, PoolClient } from 'pg';

export interface TestDatabaseInstance {
  db: IMemoryDb;
  pool: Pool;
  backup: () => { restore: () => void };
  close: () => Promise<void>;
  getClient: () => Promise<PoolClient>;
  query: (text: string, params?: unknown[]) => Promise<any>;
}

/**
 * Sanitizes PostgreSQL DDL migrations for pg-mem in-memory parsing.
 * Strips out PostgreSQL extensions, RLS policies, and DO $$ blocks that
 * are unhandled or unsupported by the JS in-memory SQL parser.
 */
function sanitizeSqlForPgMem(sql: string): string {
  let s = sql.replace(/CREATE EXTENSION[^\n;]+;/gi, '-- ext removed');
  s = s.replace(/ALTER TABLE[^\n;]+ENABLE ROW LEVEL SECURITY;/gi, '-- rls removed');
  s = s.replace(/DROP POLICY[^\n;]+;/gi, '-- drop policy removed');
  s = s.replace(/CREATE POLICY[\s\S]*?;/gi, '-- multiline policy removed');
  s = s.replace(/DO\s+\$\$[\s\S]*?\$\$;/gi, '-- do block removed');
  return s.trim();
}

/**
 * Creates an isolated in-memory PostgreSQL database instance with
 * all canonical migrations applied, complete with foreign keys, unique constraints,
 * check constraints, and mock PostgreSQL utility functions.
 */
export async function createTestDatabase(): Promise<TestDatabaseInstance> {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });

  // Register cryptographic and text manipulation functions used by schema
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.text,
    implementation: () => crypto.randomUUID(),
  });

  db.public.registerFunction({
    name: 'version',
    returns: DataType.text,
    implementation: () => 'PostgreSQL 16.0 on x86_64-pc-linux-gnu (In-Memory Test)',
  });

  db.public.registerFunction({
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (str: string | null) => (str ? str.length : 0),
  });

  db.public.registerFunction({
    name: 'octet_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (str: string | null) => (str ? Buffer.byteLength(str, 'utf8') : 0),
  });

  // Apply all 11 versioned migration files in sequential order
  const migrationsDir = path.resolve(process.cwd(), 'src/server/persistence/migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of migrationFiles) {
    const rawSql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const sanitized = sanitizeSqlForPgMem(rawSql);
    if (sanitized && !sanitized.split('\n').every((l) => l.trim().startsWith('--') || !l.trim())) {
      db.public.none(sanitized);
    }
  }

  // Create pg pool adapter bound to this in-memory database
  const pgAdapter = db.adapters.createPg();
  const pool = new pgAdapter.Pool() as unknown as Pool;

  // Intercept connection queries to support true ACID transactions (BEGIN, COMMIT, ROLLBACK, SAVEPOINT)
  let activeBackup: { restore: () => void } | null = null;
  const savepoints = new Map<string, { restore: () => void }>();
  const origConnect = pool.connect.bind(pool);

  pool.connect = (async () => {
    const client = await origConnect();
    const origQuery = client.query.bind(client);

    client.query = (async (text: any, params?: any) => {
      const q = (typeof text === 'string' ? text : text?.text || '').trim();
      const upper = q.toUpperCase();

      if (upper === 'BEGIN' || upper.startsWith('BEGIN ')) {
        activeBackup = db.backup();
        return origQuery(text, params);
      }
      if (upper === 'ROLLBACK' || upper.startsWith('ROLLBACK ')) {
        if (upper.includes('TO SAVEPOINT') || upper.includes('TO ')) {
          const match = q.match(/ROLLBACK\s+(?:TO\s+(?:SAVEPOINT\s+)?)?(\w+)/i);
          if (match && match[1] && savepoints.has(match[1])) {
            savepoints.get(match[1])!.restore();
            return origQuery(text, params);
          }
        }
        if (activeBackup) {
          activeBackup.restore();
          activeBackup = null;
        }
        return origQuery(text, params);
      }
      if (upper === 'COMMIT' || upper.startsWith('COMMIT ')) {
        activeBackup = null;
        savepoints.clear();
        return origQuery(text, params);
      }
      if (upper.startsWith('SAVEPOINT ')) {
        const match = q.match(/SAVEPOINT\s+(\w+)/i);
        if (match && match[1]) {
          savepoints.set(match[1], db.backup());
        }
        return origQuery(text, params);
      }
      if (upper.startsWith('RELEASE SAVEPOINT ')) {
        const match = q.match(/RELEASE\s+SAVEPOINT\s+(\w+)/i);
        if (match && match[1]) {
          savepoints.delete(match[1]);
        }
        return origQuery(text, params);
      }

      return origQuery(text, params);
    }) as any;

    return client;
  }) as any;

  return {
    db,
    pool,
    backup: () => db.backup(),
    close: async () => {
      await pool.end();
    },
    getClient: async () => {
      return (await pool.connect()) as unknown as PoolClient;
    },
    query: async (text: string, params?: unknown[]) => {
      return pool.query(text, params);
    },
  };
}
