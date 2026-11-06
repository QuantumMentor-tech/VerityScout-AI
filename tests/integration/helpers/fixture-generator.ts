import crypto from 'node:crypto';
import { Pool } from 'pg';

export interface SyntheticUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface SyntheticTask {
  id: string;
  userId: string;
  title: string;
  originalQuery: string;
  taskType: 'PRODUCT_RESEARCH' | 'GENERAL_RESEARCH' | 'PRICE_MONITOR' | 'SPEC_VERIFICATION';
  constraints: Record<string, unknown>;
  limits: Record<string, unknown>;
}

export interface SyntheticRun {
  id: string;
  taskId: string;
  userId: string;
  idempotencyKey: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStage: string;
  selectedProvider: string;
}

export interface SyntheticSchedule {
  id: string;
  taskId: string;
  userId: string;
  cronExpression: string;
  timezone: string;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED_ERROR' | 'ARCHIVED';
  nextRunAt: Date;
}

/**
 * Inserts a test user into auth_users.
 */
export async function seedUser(
  pool: Pool,
  overrides?: Partial<SyntheticUser>
): Promise<SyntheticUser> {
  const user: SyntheticUser = {
    id: overrides?.id ?? crypto.randomUUID(),
    email: overrides?.email ?? `test-${crypto.randomUUID().slice(0, 8)}@verityscout.local`,
    passwordHash: overrides?.passwordHash ?? 'argon2id$mocked$hash',
    displayName: overrides?.displayName ?? 'Integration Test User',
  };

  await pool.query(
    `INSERT INTO auth_users (id, email, password_hash, display_name)
     VALUES ($1, $2, $3, $4)`,
    [user.id, user.email, user.passwordHash, user.displayName]
  );

  return user;
}

/**
 * Inserts a synthetic research task.
 */
export async function seedTask(
  pool: Pool,
  userId: string,
  overrides?: Partial<SyntheticTask>
): Promise<SyntheticTask> {
  const task: SyntheticTask = {
    id: overrides?.id ?? crypto.randomUUID(),
    userId,
    title: overrides?.title ?? 'Ergonomic Standing Desk Evaluation',
    originalQuery: overrides?.originalQuery ?? 'Best standing desk with dual motors and anti-collision 2026',
    taskType: overrides?.taskType ?? 'PRODUCT_RESEARCH',
    constraints: overrides?.constraints ?? { maxPrice: 800, minWarrantyYears: 5 },
    limits: overrides?.limits ?? { maxSources: 5, maxSearchQueries: 3 },
  };

  await pool.query(
    `INSERT INTO research_tasks (id, user_id, title, original_query, task_type, constraints, limits)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      task.id,
      task.userId,
      task.title,
      task.originalQuery,
      task.taskType,
      JSON.stringify(task.constraints),
      JSON.stringify(task.limits),
    ]
  );

  return task;
}

/**
 * Inserts a synthetic research run.
 */
export async function seedRun(
  pool: Pool,
  taskId: string,
  userId: string,
  overrides?: Partial<SyntheticRun>
): Promise<SyntheticRun> {
  const run: SyntheticRun = {
    id: overrides?.id ?? crypto.randomUUID(),
    taskId,
    userId,
    idempotencyKey: overrides?.idempotencyKey ?? `run-${crypto.randomUUID()}`,
    status: overrides?.status ?? 'QUEUED',
    currentStage: overrides?.currentStage ?? 'INITIATED',
    selectedProvider: overrides?.selectedProvider ?? 'openai',
  };

  await pool.query(
    `INSERT INTO research_runs (id, task_id, user_id, idempotency_key, status, current_stage, selected_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      run.id,
      run.taskId,
      run.userId,
      run.idempotencyKey,
      run.status,
      run.currentStage,
      run.selectedProvider,
    ]
  );

  return run;
}

/**
 * Inserts a synthetic research schedule.
 */
export async function seedSchedule(
  pool: Pool,
  taskId: string,
  userId: string,
  overrides?: Partial<SyntheticSchedule>
): Promise<SyntheticSchedule> {
  const schedule: SyntheticSchedule = {
    id: overrides?.id ?? crypto.randomUUID(),
    taskId,
    userId,
    cronExpression: overrides?.cronExpression ?? '0 9 * * 1', // Every Monday at 9am
    timezone: overrides?.timezone ?? 'America/New_York',
    status: overrides?.status ?? 'ACTIVE',
    nextRunAt: overrides?.nextRunAt ?? new Date(Date.now() + 3600 * 1000),
  };

  await pool.query(
    `INSERT INTO research_schedules (id, task_id, user_id, cron_expression, timezone, status, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      schedule.id,
      schedule.taskId,
      schedule.userId,
      schedule.cronExpression,
      schedule.timezone,
      schedule.status,
      schedule.nextRunAt.toISOString(),
    ]
  );

  return schedule;
}

