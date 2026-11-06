import 'server-only';
import { InAppNotificationRow, NotificationType, SourceEventType } from '../persistence/types';
import { PaginationOptions } from '../persistence/repositories/base.repository';

export interface EvaluatedAlert {
  readonly notificationType: NotificationType;
  readonly sourceEventType: SourceEventType;
  readonly sourceEventId?: string | null | undefined;
  readonly taskId: string;
  readonly researchRunId: string;
  readonly scheduleId?: string | null | undefined;
  readonly comparisonId: string;
  readonly title: string;
  readonly summary: string;
  readonly metadata: Record<string, unknown>;
  readonly idempotencyKey: string;
  readonly isSuppressed: boolean;
  readonly suppressionReason?: string | undefined;
}

export interface NotificationCreationResult {
  readonly processedCount: number;
  readonly createdCount: number;
  readonly suppressedCount: number;
  readonly notifications: readonly InAppNotificationRow[];
}

export interface NotificationFilterOptions extends PaginationOptions {
  readonly unreadOnly?: boolean | undefined;
  readonly includeDismissed?: boolean | undefined;
  readonly notificationType?: string | undefined;
}

export interface UnreadCountResult {
  readonly unreadCount: number;
}
