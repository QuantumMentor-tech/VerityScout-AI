import 'server-only';

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type MonthBoundaryPolicy = 'CLAMP_TO_LAST_DAY' | 'SKIP_MONTH';

export interface RecurrenceRule {
  readonly frequency: RecurrenceFrequency;
  readonly interval?: number | undefined;
  readonly time: string; // 'HH:mm' in 24-hour format, e.g. '09:00'
  readonly weekdays?: readonly number[] | undefined; // 1 = Monday, 7 = Sunday (ISO 8601)
  readonly dayOfMonth?: number | undefined; // 1..31
  readonly monthBoundaryPolicy?: MonthBoundaryPolicy | undefined;
  readonly startDate?: string | undefined;
  readonly endDate?: string | undefined;
  readonly version?: string | undefined;
}

export interface ZonedCalendarDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23
  readonly minute: number; // 0-59
  readonly second: number; // 0-59
  readonly weekday: number; // 1 = Mon, 7 = Sun
}

export interface NextRunResult {
  readonly nextRunAt: Date;
  readonly isoString: string;
  readonly localCalendar: ZonedCalendarDate;
  readonly explanation: string;
}

export interface ScheduleRequestSnapshot {
  readonly query: string;
  readonly title?: string | undefined;
  readonly taskType?: string | undefined;
  readonly constraints?: Record<string, unknown> | undefined;
  readonly limits?: Record<string, unknown> | undefined;
  readonly modelPolicy?: Record<string, unknown> | undefined;
}

export const RECURRENCE_RULE_VERSION = '2026-11-recurrence-v1';

