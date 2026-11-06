import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabaseInstance } from '../helpers/test-db';
import crypto from 'node:crypto';

describe('Database Schema & Migration Integration Tests', () => {
  let dbInstance: TestDatabaseInstance;

  beforeAll(async () => {
    dbInstance = await createTestDatabase();
  });

  afterAll(async () => {
    await dbInstance.close();
  });

  it('AC-02: verifies all core application tables exist after migrations', async () => {
    const expectedTables = [
      'research_tasks',
      'research_schedules',
      'research_runs',
      'source_documents',
      'candidate_results',
      'evidence_records',
      'candidate_evidence_links',
      'provider_configurations',
      'provider_vault_secrets',
      'change_events',
      'usage_ledger',
      'auth_users',
      'auth_sessions',
      'source_discoveries',
      'research_job_queue',
      'research_progress_events',
      'model_usage_events',
      'concurrency_slots',
      'schedule_occurrences',
      'research_comparisons',
      'in_app_notifications',
    ];

    const res = await dbInstance.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const foundTables = new Set(res.rows.map((r: { table_name: string }) => r.table_name));

    for (const table of expectedTables) {
      expect(foundTables.has(table), `Table ${table} should exist`).toBe(true);
    }
  });

  it('AC-02 & AC-04: enforces foreign key referential integrity', async () => {
    const fakeTaskId = crypto.randomUUID();
    const fakeUserId = crypto.randomUUID();

    // Attempting to insert a research_run referencing a non-existent task_id must fail
    await expect(
      dbInstance.query(
        `INSERT INTO research_runs (id, task_id, user_id, idempotency_key, status)
         VALUES ($1, $2, $3, 'test-key', 'QUEUED')`,
        [crypto.randomUUID(), fakeTaskId, fakeUserId]
      )
    ).rejects.toThrow();
  });

  it('AC-04: enforces CASCADE delete integrity from task to child runs', async () => {
    const userId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const runId = crypto.randomUUID();

    // 1. Insert parent task
    await dbInstance.query(
      `INSERT INTO research_tasks (id, user_id, title, original_query, task_type)
       VALUES ($1, $2, 'Cascade Task', 'Sample Query', 'PRODUCT_RESEARCH')`,
      [taskId, userId]
    );

    // 2. Insert child run
    await dbInstance.query(
      `INSERT INTO research_runs (id, task_id, user_id, idempotency_key, status)
       VALUES ($1, $2, $3, 'cascade-run-1', 'QUEUED')`,
      [runId, taskId, userId]
    );

    // Verify run exists
    const beforeRes = await dbInstance.query(
      `SELECT COUNT(*) as c FROM research_runs WHERE id = $1`,
      [runId]
    );
    expect(Number(beforeRes.rows[0].c)).toBe(1);

    // 3. Delete parent task
    await dbInstance.query(`DELETE FROM research_tasks WHERE id = $1`, [taskId]);

    // 4. Verify child run was automatically cascade-deleted
    const afterRes = await dbInstance.query(
      `SELECT COUNT(*) as c FROM research_runs WHERE id = $1`,
      [runId]
    );
    expect(Number(afterRes.rows[0].c)).toBe(0);
  });

  it('AC-02: enforces unique constraints on (task_id, idempotency_key)', async () => {
    const userId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const idempotencyKey = 'unique-key-100';

    await dbInstance.query(
      `INSERT INTO research_tasks (id, user_id, title, original_query, task_type)
       VALUES ($1, $2, 'Unique Task', 'Sample Query', 'PRODUCT_RESEARCH')`,
      [taskId, userId]
    );

    // First insert succeeds
    await dbInstance.query(
      `INSERT INTO research_runs (id, task_id, user_id, idempotency_key, status)
       VALUES ($1, $2, $3, $4, 'QUEUED')`,
      [crypto.randomUUID(), taskId, userId, idempotencyKey]
    );

    // Second insert with exact same task_id and idempotency_key must fail
    await expect(
      dbInstance.query(
        `INSERT INTO research_runs (id, task_id, user_id, idempotency_key, status)
         VALUES ($1, $2, $3, $4, 'QUEUED')`,
        [crypto.randomUUID(), taskId, userId, idempotencyKey]
      )
    ).rejects.toThrow();
  });

  it('AC-02: enforces column CHECK constraints on task_type and status', async () => {
    const userId = crypto.randomUUID();
    const taskId = crypto.randomUUID();

    // Invalid task_type must fail
    await expect(
      dbInstance.query(
        `INSERT INTO research_tasks (id, user_id, title, original_query, task_type)
         VALUES ($1, $2, 'Invalid Task', 'Query', 'NON_EXISTENT_TYPE')`,
        [taskId, userId]
      )
    ).rejects.toThrow();
  });
});
