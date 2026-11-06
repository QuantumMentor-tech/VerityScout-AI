import 'server-only';
import { PoolClient } from 'pg';
import { TransactionContext } from '../persistence/transaction';
import {
  NotificationRepository,
  ResearchScheduleRepository,
} from '../persistence/repositories';
import { InAppNotificationRow } from '../persistence/types';
import { PaginatedResult } from '../persistence/repositories/base.repository';
import { ComparisonResult } from '../changes/change-detection.types';
import { evaluateComparisonAlerts } from './alert-policy';
import {
  NotificationCreationResult,
  NotificationFilterOptions,
} from './notification.types';
import { AppError } from '@/lib/errors/app-error';
import { logger } from '@/lib/logging/logger';

export class NotificationService {
  constructor(
    private readonly notificationRepo: NotificationRepository = new NotificationRepository(),
    private readonly scheduleRepo: ResearchScheduleRepository = new ResearchScheduleRepository()
  ) {}

  /**
   * Processes a Step 48 ComparisonResult, evaluates change eligibility against
   * the alert policy, and idempotently creates in-app notification records.
   */
  async processComparisonChanges(
    comparison: ComparisonResult,
    tx?: TransactionContext | PoolClient
  ): Promise<NotificationCreationResult> {
    let thresholdPct = 0;

    if (comparison.scheduleId) {
      try {
        const schedule = await this.scheduleRepo.findById(
          comparison.scheduleId,
          comparison.userId,
          tx
        );
        if (schedule) {
          thresholdPct = Number(schedule.change_notification_threshold_pct) || 0;
        }
      } catch (err) {
        logger.warn('NOTIFICATION_SCHEDULE_LOOKUP_WARN', 'Failed to read schedule threshold; defaulting to 0', {
          scheduleId: comparison.scheduleId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const evaluatedAlerts = evaluateComparisonAlerts(comparison, { thresholdPct });
    const eligibleAlerts = evaluatedAlerts.filter((a) => !a.isSuppressed);
    const suppressedCount = evaluatedAlerts.length - eligibleAlerts.length;

    if (eligibleAlerts.length === 0) {
      logger.info('NOTIFICATION_PROCESSING_COMPLETE', 'No eligible alerts to create for comparison', {
        comparisonId: comparison.id,
        runId: comparison.currentRunId,
        totalEvaluated: evaluatedAlerts.length,
        suppressedCount,
      });

      return {
        processedCount: evaluatedAlerts.length,
        createdCount: 0,
        suppressedCount,
        notifications: [],
      };
    }

    const inputs = eligibleAlerts.map((alert) => ({
      user_id: comparison.userId,
      notification_type: alert.notificationType,
      source_event_type: alert.sourceEventType,
      source_event_id: alert.sourceEventId ?? null,
      task_id: alert.taskId,
      research_run_id: alert.researchRunId,
      schedule_id: alert.scheduleId ?? null,
      comparison_id: alert.comparisonId,
      title: alert.title,
      summary: alert.summary,
      metadata: alert.metadata,
      idempotency_key: alert.idempotencyKey,
    }));

    const createdNotifications = await this.notificationRepo.createBatch(inputs, tx);

    logger.info('NOTIFICATION_BATCH_CREATED', 'Successfully persisted in-app notifications for comparison', {
      comparisonId: comparison.id,
      runId: comparison.currentRunId,
      createdCount: createdNotifications.length,
      suppressedCount,
    });

    return {
      processedCount: evaluatedAlerts.length,
      createdCount: createdNotifications.length,
      suppressedCount,
      notifications: createdNotifications,
    };
  }

  /**
   * Retrieves a paginated list of notifications for the authenticated user.
   */
  async getNotifications(
    userId: string,
    options?: NotificationFilterOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<PaginatedResult<InAppNotificationRow>> {
    return this.notificationRepo.listByUser(userId, options, tx);
  }

  /**
   * Gets the total unread, non-dismissed notification count for the user.
   */
  async getUnreadCount(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    return this.notificationRepo.getUnreadCount(userId, tx);
  }

  /**
   * Marks a single notification as read, enforcing owner verification.
   */
  async markAsRead(
    id: string,
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow> {
    const updated = await this.notificationRepo.markAsRead(id, userId, tx);
    if (!updated) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Notification not found or access denied',
        statusCode: 404,
      });
    }
    return updated;
  }

  /**
   * Marks all unread, non-dismissed notifications as read for the user.
   */
  async markAllAsRead(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    return this.notificationRepo.markAllAsRead(userId, tx);
  }

  /**
   * Dismisses a single notification, enforcing owner verification.
   */
  async dismissNotification(
    id: string,
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<InAppNotificationRow> {
    const updated = await this.notificationRepo.dismiss(id, userId, tx);
    if (!updated) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Notification not found or access denied',
        statusCode: 404,
      });
    }
    return updated;
  }

  /**
   * Dismisses all non-dismissed notifications for the user.
   */
  async dismissAll(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    return this.notificationRepo.dismissAll(userId, tx);
  }
}

