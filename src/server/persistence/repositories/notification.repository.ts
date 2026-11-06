import 'server-only';
import { PoolClient } from 'pg';
import { InAppNotificationRow, NotificationType, SourceEventType } from '../types';
import { TransactionContext } from '../transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface CreateNotificationInput {
  readonly id?: string | undefined;
  readonly user_id: string;
  readonly notification_type: NotificationType | string;
  readonly source_event_type?: SourceEventType | string | undefined;
  readonly source_event_id?: string | null | undefined;
  readonly task_id: string;
  readonly research_run_id: string;
  readonly schedule_id?: string | null | undefined;
  readonly comparison_id: string;
  readonly title: string;
  readonly summary: string;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly idempotency_key: string;
}

export interface ListNotificationsOptions extends PaginationOptions {
  readonly unreadOnly?: boolean | undefined;
  readonly includeDismissed?: boolean | undefined;
  readonly notificationType?: string | undefined;
}

export class NotificationRepository {
  /**
   * Idempotently creates a new notification record.
   * If the idempotency_key already exists, returns the existing record without duplicating.
   */
  async create(
    input: CreateNotificationInput,
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO in_app_notifications (
        ${input.id ? 'id,' : ''}
        user_id,
        notification_type,
        source_event_type,
        source_event_id,
        task_id,
        research_run_id,
        schedule_id,
        comparison_id,
        title,
        summary,
        metadata,
        idempotency_key
      ) VALUES (
        ${input.id ? '$1,' : ''}
        $${input.id ? 2 : 1},
        $${input.id ? 3 : 2},
        $${input.id ? 4 : 3},
        $${input.id ? 5 : 4},
        $${input.id ? 6 : 5},
        $${input.id ? 7 : 6},
        $${input.id ? 8 : 7},
        $${input.id ? 9 : 8},
        $${input.id ? 10 : 9},
        $${input.id ? 11 : 10},
        $${input.id ? 12 : 11},
        $${input.id ? 13 : 12}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *;
    `;

    const params: unknown[] = [
      input.user_id,
      input.notification_type,
      input.source_event_type ?? SourceEventType.CHANGE_EVENT,
      input.source_event_id ?? null,
      input.task_id,
      input.research_run_id,
      input.schedule_id ?? null,
      input.comparison_id,
      input.title,
      input.summary,
      JSON.stringify(input.metadata ?? {}),
      input.idempotency_key,
    ];

    if (input.id) {
      params.unshift(input.id);
    }

    const res = await executeQuery<InAppNotificationRow>(executor, sql, params);
    if (res.rows[0]) {
      return res.rows[0];
    }

    // If skipped due to conflict, return existing record
    return this.findByIdempotencyKey(input.idempotency_key, tx);
  }

  /**
   * Idempotently creates a batch of notification records.
   */
  async createBatch(
    inputs: readonly CreateNotificationInput[],
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow[]> {
    if (inputs.length === 0) return [];

    const results: InAppNotificationRow[] = [];

    for (const input of inputs) {
      const row = await this.create(input, tx);
      if (row) {
        results.push(row);
      }
    }

    return results;
  }

  /**
   * Finds a notification by primary key, optionally scoped to owner.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM in_app_notifications WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM in_app_notifications WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const res = await executeQuery<InAppNotificationRow>(executor, sql, params);
    return res.rows[0] ?? null;
  }

  /**
   * Finds a notification by idempotency key.
   */
  async findByIdempotencyKey(
    key: string,
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow | null> {
    const executor = getExecutor(tx);
    const sql = 'SELECT * FROM in_app_notifications WHERE idempotency_key = $1';
    const res = await executeQuery<InAppNotificationRow>(executor, sql, [key]);
    return res.rows[0] ?? null;
  }

  /**
   * Retrieves paginated notifications for a specific user with filtering.
   */
  async listByUser(
    userId: string,
    options?: ListNotificationsOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<InAppNotificationRow>> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination(options);

    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (options?.unreadOnly) {
      conditions.push('read_at IS NULL');
    }

    if (!options?.includeDismissed) {
      conditions.push('dismissed_at IS NULL');
    }

    if (options?.notificationType) {
      conditions.push(`notification_type = $${paramIndex}`);
      params.push(options.notificationType);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*)::int AS total FROM in_app_notifications WHERE ${whereClause}`;
    const countRes = await executeQuery<{ total: number }>(executor, countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT * FROM in_app_notifications
      WHERE ${whereClause}
      ORDER BY created_at DESC, id ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataParams = [...params, limit, offset];

    const dataRes = await executeQuery<InAppNotificationRow>(executor, dataSql, dataParams);

    return {
      data: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Gets the total unread, non-dismissed notification count for a user.
   */
  async getUnreadCount(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM in_app_notifications
      WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL;
    `;
    const res = await executeQuery<{ count: number }>(executor, sql, [userId]);
    return res.rows[0]?.count ?? 0;
  }

  /**
   * Marks a specific notification as read.
   * Safe and idempotent.
   */
  async markAsRead(
    id: string,
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE in_app_notifications
      SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *;
    `;
    const res = await executeQuery<InAppNotificationRow>(executor, sql, [id, userId]);
    return res.rows[0] ?? null;
  }

  /**
   * Marks all unread, non-dismissed notifications as read for a user.
   */
  async markAllAsRead(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE in_app_notifications
      SET read_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL
      RETURNING id;
    `;
    const res = await executeQuery<{ id: string }>(executor, sql, [userId]);
    return res.rowCount ?? res.rows.length;
  }

  /**
   * Dismisses a specific notification for a user.
   */
  async dismiss(
    id: string,
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE in_app_notifications
      SET dismissed_at = COALESCE(dismissed_at, NOW()), updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *;
    `;
    const res = await executeQuery<InAppNotificationRow>(executor, sql, [id, userId]);
    return res.rows[0] ?? null;
  }

  /**
   * Dismisses all non-dismissed notifications for a user.
   */
  async dismissAll(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE in_app_notifications
      SET dismissed_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND dismissed_at IS NULL
      RETURNING id;
    `;
    const res = await executeQuery<{ id: string }>(executor, sql, [userId]);
    return res.rowCount ?? res.rows.length;
  }
}
