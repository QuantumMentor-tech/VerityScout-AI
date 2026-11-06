export interface InAppNotificationDto {
  readonly id: string;
  readonly notification_type: string;
  readonly source_event_type: string;
  readonly source_event_id: string | null;
  readonly task_id: string;
  readonly research_run_id: string;
  readonly schedule_id: string | null;
  readonly comparison_id: string;
  readonly title: string;
  readonly summary: string;
  readonly metadata: Record<string, unknown>;
  readonly read_at: string | null;
  readonly dismissed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface NotificationPaginationDto {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface NotificationListResponse {
  readonly success: boolean;
  readonly data: {
    readonly data: readonly InAppNotificationDto[];
    readonly pagination: NotificationPaginationDto;
  };
}

export interface UnreadCountResponse {
  readonly success: boolean;
  readonly data: {
    readonly unreadCount: number;
  };
}

