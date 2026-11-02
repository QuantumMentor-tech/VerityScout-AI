import 'server-only';
import { PoolClient } from 'pg';
import { ResearchTaskRow, TaskType } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateResearchTaskInput {
  id?: string;
  user_id: string;
  title: string;
  original_query: string;
  task_type: TaskType;
  constraints?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  model_policy?: Record<string, unknown>;
}

export interface UpdateResearchTaskInput {
  title?: string;
  constraints?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  model_policy?: Record<string, unknown>;
  is_archived?: boolean;
}

export class ResearchTaskRepository {
  /**
   * Retrieves a single research task by ID, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchTaskRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM research_tasks WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM research_tasks WHERE id = $1';
    const params = userId ? [id, userId] : [id];

    const result = await executeQuery<ResearchTaskRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists research tasks owned by a user with deterministic pagination.
   */
  async listByOwner(
    userId: string,
    options?: PaginationOptions & { isArchived?: boolean },
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<ResearchTaskRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);
    const isArchived = options?.isArchived ?? false;

    const countSql =
      'SELECT COUNT(*)::int AS total FROM research_tasks WHERE user_id = $1 AND is_archived = $2';
    const countRes = await executeQuery<{ total: number }>(executor, countSql, [userId, isArchived]);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT * FROM research_tasks
      WHERE user_id = $1 AND is_archived = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const dataRes = await executeQuery<ResearchTaskRow>(executor, dataSql, [
      userId,
      isArchived,
      limit,
      offset,
    ]);

    return {
      data: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Inserts a new research task.
   */
  async create(
    input: CreateResearchTaskInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchTaskRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO research_tasks (
        id, user_id, title, original_query, task_type, constraints, limits, model_policy
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8
      )
      RETURNING *
    `;
    const params = [
      input.id ?? null,
      input.user_id,
      input.title,
      input.original_query,
      input.task_type,
      JSON.stringify(input.constraints ?? {}),
      JSON.stringify(
        input.limits ?? {
          maxSources: 10,
          maxSearchQueries: 5,
          maxRunCostUsd: '0.25',
          searchDepth: 'BALANCED',
        }
      ),
      JSON.stringify(
        input.model_policy ?? {
          preferredProvider: 'auto',
          allowedProviders: ['openai', 'openrouter', 'nim'],
        }
      ),
    ];

    const result = await executeQuery<ResearchTaskRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create research task: database returned no rows');
    }
    return row;
  }

  /**
   * Updates mutable configuration of a research task.
   */
  async update(
    id: string,
    updates: UpdateResearchTaskInput,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchTaskRow | null> {
    const executor = getExecutor(tx);
    const setClauses: string[] = [];
    const params: unknown[] = [id];
    let paramIndex = 2;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(updates.title);
    }
    if (updates.constraints !== undefined) {
      setClauses.push(`constraints = $${paramIndex++}`);
      params.push(JSON.stringify(updates.constraints));
    }
    if (updates.limits !== undefined) {
      setClauses.push(`limits = $${paramIndex++}`);
      params.push(JSON.stringify(updates.limits));
    }
    if (updates.model_policy !== undefined) {
      setClauses.push(`model_policy = $${paramIndex++}`);
      params.push(JSON.stringify(updates.model_policy));
    }
    if (updates.is_archived !== undefined) {
      setClauses.push(`is_archived = $${paramIndex++}`);
      params.push(updates.is_archived);
    }

    if (setClauses.length === 0) {
      return this.findById(id, userId, tx);
    }

    setClauses.push('updated_at = NOW()');

    let sql = `UPDATE research_tasks SET ${setClauses.join(', ')} WHERE id = $1`;
    if (userId) {
      sql += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }
    sql += ' RETURNING *';

    const result = await executeQuery<ResearchTaskRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Soft-archives a task by setting is_archived = true.
   */
  async archive(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<boolean> {
    const updated = await this.update(id, { is_archived: true }, userId, tx);
    return Boolean(updated);
  }

  /**
   * Hard-deletes a task (triggers cascading delete down to runs, sources, candidates, etc.).
   */
  async delete(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<boolean> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'DELETE FROM research_tasks WHERE id = $1 AND user_id = $2'
      : 'DELETE FROM research_tasks WHERE id = $1';
    const params = userId ? [id, userId] : [id];

    const result = await executeQuery(executor, sql, params);
    return (result.rowCount ?? 0) > 0;
  }
}
