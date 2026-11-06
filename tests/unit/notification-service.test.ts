import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '@/server/notifications/notification.service';
import {
  NotificationRepository,
  ResearchScheduleRepository,
} from '@/server/persistence/repositories';
import {
  ComparisonResult,
  COMPARISON_POLICY_VERSION,
} from '@/server/changes/change-detection.types';
import {
  ChangeType,
  ChangeStatus,
  ComparisonStatus,
  NotificationType,
  InAppNotificationRow,
  ResearchScheduleRow,
  ScheduleStatus,
} from '@/server/persistence/types';
import { AppError } from '@/lib/errors/app-error';

describe('NotificationService (Step 50)', () => {
  let mockNotificationRepo: Partial<NotificationRepository>;
  let mockScheduleRepo: Partial<ResearchScheduleRepository>;
  let notificationService: NotificationService;

  const mockNotificationRow: InAppNotificationRow = {
    id: 'notif-1111-1111-1111-1111',
    user_id: 'user-1',
    notification_type: NotificationType.PRICE_DROP,
    source_event_type: 'CHANGE_EVENT',
    source_event_id: 'ch-1',
    task_id: 'task-1',
    research_run_id: 'run-curr-1',
    schedule_id: 'sched-1',
    comparison_id: 'comp-1',
    title: 'Price Drop: MacBook Air M2',
    summary: 'Observed price dropped from 999.00 USD to 849.00 USD (-15.02%).',
    metadata: { fieldName: 'price' },
    idempotency_key: 'notif:user-1:comp-1:ch-1',
    read_at: null,
    dismissed_at: null,
    created_at: '2026-11-06T10:00:00.000Z',
    updated_at: '2026-11-06T10:00:00.000Z',
  };

  const mockComparison: ComparisonResult = {
    id: 'comp-1',
    taskId: 'task-1',
    scheduleId: 'sched-1',
    userId: 'user-1',
    baselineRunId: 'run-base-1',
    currentRunId: 'run-curr-1',
    status: ComparisonStatus.CHANGES_DETECTED,
    comparisonPolicyVersion: COMPARISON_POLICY_VERSION,
    reasonCode: null,
    changes: [
      {
        id: 'ch-1',
        comparisonId: 'comp-1',
        taskId: 'task-1',
        scheduleId: 'sched-1',
        userId: 'user-1',
        previousRunId: 'run-base-1',
        currentRunId: 'run-curr-1',
        candidateTitle: 'MacBook Air M2',
        canonicalUrl: 'https://apple.com/macbook-air',
        fieldName: 'price',
        changeType: ChangeType.PRICE_DROP,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'PRICE_DROP_CONFIRMED',
        previousValue: '999.00 USD',
        newValue: '849.00 USD',
        percentageDelta: -15.02,
        isSupported: true,
        explanation: 'Price dropped by $150.',
        idempotencyKey: 'mba_price_drop_15',
      },
    ],
    summary: {
      totalCompared: 1,
      changedCount: 1,
      unchangedCount: 0,
      newlyObservedCount: 0,
      noLongerObservedCount: 0,
      conflictingCount: 0,
      notComparableCount: 0,
    },
    detectedAt: '2026-11-06T10:00:00.000Z',
  };

  const mockSchedule: ResearchScheduleRow = {
    id: 'sched-1',
    task_id: 'task-1',
    user_id: 'user-1',
    name: 'Daily Laptop Price Check',
    revision: 1,
    status: ScheduleStatus.ACTIVE,
    cron_expression: '0 9 * * *',
    recurrence_rule: null,
    scheduled_time: '09:00',
    request_snapshot: null,
    timezone: 'UTC',
    last_run_at: '2026-11-06T10:00:00.000Z',
    last_dispatched_at: '2026-11-06T10:00:00.000Z',
    last_run_id: 'run-curr-1',
    next_run_at: '2026-11-07T09:00:00.000Z',
    consecutive_failures: 0,
    change_notification_threshold_pct: 2.0,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-06T10:00:00.000Z',
  };

  beforeEach(() => {
    mockNotificationRepo = {
      createBatch: vi.fn().mockResolvedValue([mockNotificationRow]),
      listByUser: vi.fn().mockResolvedValue({
        data: [mockNotificationRow],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
      getUnreadCount: vi.fn().mockResolvedValue(1),
      markAsRead: vi.fn().mockImplementation((id: string, userId: string) => {
        if (id === mockNotificationRow.id && userId === mockNotificationRow.user_id) {
          return Promise.resolve({
            ...mockNotificationRow,
            read_at: '2026-11-06T10:05:00.000Z',
          });
        }
        return Promise.resolve(null);
      }),
      markAllAsRead: vi.fn().mockResolvedValue(1),
      dismiss: vi.fn().mockImplementation((id: string, userId: string) => {
        if (id === mockNotificationRow.id && userId === mockNotificationRow.user_id) {
          return Promise.resolve({
            ...mockNotificationRow,
            dismissed_at: '2026-11-06T10:05:00.000Z',
          });
        }
        return Promise.resolve(null);
      }),
      dismissAll: vi.fn().mockResolvedValue(1),
    };

    mockScheduleRepo = {
      findById: vi.fn().mockResolvedValue(mockSchedule),
    };

    notificationService = new NotificationService(
      mockNotificationRepo as NotificationRepository,
      mockScheduleRepo as ResearchScheduleRepository
    );
  });

  describe('processComparisonChanges', () => {
    it('creates notifications for eligible changes respecting schedule threshold', async () => {
      const result = await notificationService.processComparisonChanges(mockComparison);

      expect(mockScheduleRepo.findById).toHaveBeenCalledWith('sched-1', 'user-1', undefined);
      expect(mockNotificationRepo.createBatch).toHaveBeenCalledTimes(1);
      expect(result.createdCount).toBe(1);
      expect(result.processedCount).toBe(1);
      expect(result.suppressedCount).toBe(0);
      expect(result.notifications[0]?.title).toBe('Price Drop: MacBook Air M2');
    });

    it('returns empty result when comparison contains zero eligible changes', async () => {
      const noChangeComp: ComparisonResult = {
        ...mockComparison,
        status: ComparisonStatus.NO_CHANGES_DETECTED,
        changes: [],
      };

      const result = await notificationService.processComparisonChanges(noChangeComp);
      expect(result.createdCount).toBe(0);
      expect(mockNotificationRepo.createBatch).not.toHaveBeenCalled();
    });
  });

  describe('Notification Retrieval & Unread Counts', () => {
    it('retrieves paginated notifications for the user', async () => {
      const result = await notificationService.getNotifications('user-1', {
        page: 1,
        limit: 20,
        unreadOnly: true,
      });

      expect(mockNotificationRepo.listByUser).toHaveBeenCalledWith(
        'user-1',
        { page: 1, limit: 20, unreadOnly: true },
        undefined
      );
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('derives unread count accurately', async () => {
      const count = await notificationService.getUnreadCount('user-1');
      expect(count).toBe(1);
      expect(mockNotificationRepo.getUnreadCount).toHaveBeenCalledWith('user-1', undefined);
    });
  });

  describe('Read & Dismissal Operations', () => {
    it('marks a specific notification as read', async () => {
      const updated = await notificationService.markAsRead(mockNotificationRow.id, 'user-1');
      expect(updated.read_at).toBeTruthy();
      expect(mockNotificationRepo.markAsRead).toHaveBeenCalledWith(mockNotificationRow.id, 'user-1', undefined);
    });

    it('throws 404 NOT_FOUND when marking unknown or cross-tenant notification as read', async () => {
      await expect(
        notificationService.markAsRead('unknown-id', 'user-1')
      ).rejects.toThrow(AppError);
    });

    it('marks all notifications as read', async () => {
      const count = await notificationService.markAllAsRead('user-1');
      expect(count).toBe(1);
      expect(mockNotificationRepo.markAllAsRead).toHaveBeenCalledWith('user-1', undefined);
    });

    it('dismisses a notification without deleting it or corrupting read state', async () => {
      const dismissed = await notificationService.dismissNotification(mockNotificationRow.id, 'user-1');
      expect(dismissed.dismissed_at).toBeTruthy();
      expect(mockNotificationRepo.dismiss).toHaveBeenCalledWith(mockNotificationRow.id, 'user-1', undefined);
    });

    it('throws 404 NOT_FOUND when dismissing unknown or cross-tenant notification', async () => {
      await expect(
        notificationService.dismissNotification('unknown-id', 'user-1')
      ).rejects.toThrow(AppError);
    });
  });
});

