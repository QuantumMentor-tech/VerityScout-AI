import 'server-only';
import {
  RecurrenceRule,
  NextRunResult,
} from './recurrence.types';
import {
  isValidIanaTimezone,
  getZonedCalendarDate,
  zonedDateTimeToUtc,
  getDaysInMonth,
} from './timezone.utils';

export class RecurrenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurrenceValidationError';
  }
}

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export class RecurrenceService {
  /**
   * Validates a recurrence rule definition against supported schema bounds.
   */
  public static validateRule(rule: RecurrenceRule): void {
    if (!rule || typeof rule !== 'object') {
      throw new RecurrenceValidationError('Recurrence rule must be a non-null object');
    }

    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(rule.frequency)) {
      throw new RecurrenceValidationError(`Unsupported recurrence frequency: "${String(rule.frequency)}"`);
    }

    // Validate time
    if (!rule.time || typeof rule.time !== 'string') {
      throw new RecurrenceValidationError('Recurrence rule must specify a valid "time" string (HH:mm)');
    }
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(rule.time)) {
      throw new RecurrenceValidationError(
        `Invalid local time "${rule.time}". Expected 24-hour format "HH:mm" (00:00 to 23:59)`
      );
    }

    // Validate interval
    if (rule.interval !== undefined) {
      if (!Number.isInteger(rule.interval) || rule.interval < 1) {
        throw new RecurrenceValidationError(`Interval must be a positive integer, got: ${rule.interval}`);
      }
      if (rule.frequency === 'DAILY' && rule.interval > 30) {
        throw new RecurrenceValidationError('Daily interval cannot exceed 30 days');
      }
      if (rule.frequency === 'WEEKLY' && rule.interval > 52) {
        throw new RecurrenceValidationError('Weekly interval cannot exceed 52 weeks');
      }
      if (rule.frequency === 'MONTHLY' && rule.interval > 12) {
        throw new RecurrenceValidationError('Monthly interval cannot exceed 12 months');
      }
    }

    // Validate WEEKLY weekdays
    if (rule.frequency === 'WEEKLY') {
      if (rule.weekdays !== undefined) {
        if (!Array.isArray(rule.weekdays) || rule.weekdays.length === 0) {
          throw new RecurrenceValidationError('Weekly recurrence must specify at least one weekday [1..7]');
        }
        if (rule.weekdays.length > 7) {
          throw new RecurrenceValidationError('Weekly weekdays array exceeds 7 days');
        }
        const set = new Set<number>();
        for (const day of rule.weekdays) {
          if (!Number.isInteger(day) || day < 1 || day > 7) {
            throw new RecurrenceValidationError(`Invalid ISO weekday: ${day}. Expected 1 (Mon) through 7 (Sun)`);
          }
          if (set.has(day)) {
            throw new RecurrenceValidationError(`Duplicate weekday in recurrence rule: ${day}`);
          }
          set.add(day);
        }
      }
    }

    // Validate MONTHLY dayOfMonth
    if (rule.frequency === 'MONTHLY') {
      if (rule.dayOfMonth === undefined || !Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31) {
        throw new RecurrenceValidationError(
          `Monthly recurrence must specify a valid dayOfMonth (1..31), got: ${String(rule.dayOfMonth)}`
        );
      }
      if (rule.monthBoundaryPolicy !== undefined && !['CLAMP_TO_LAST_DAY', 'SKIP_MONTH'].includes(rule.monthBoundaryPolicy)) {
        throw new RecurrenceValidationError(
          `Invalid month boundary policy: "${String(rule.monthBoundaryPolicy)}". Expected CLAMP_TO_LAST_DAY or SKIP_MONTH`
        );
      }
    }

    // Validate start and end boundaries
    if (rule.startDate) {
      const start = new Date(rule.startDate);
      if (isNaN(start.getTime())) {
        throw new RecurrenceValidationError(`Invalid startDate timestamp: "${rule.startDate}"`);
      }
    }
    if (rule.endDate) {
      const end = new Date(rule.endDate);
      if (isNaN(end.getTime())) {
        throw new RecurrenceValidationError(`Invalid endDate timestamp: "${rule.endDate}"`);
      }
      if (rule.startDate) {
        const start = new Date(rule.startDate);
        if (start.getTime() > end.getTime()) {
          throw new RecurrenceValidationError('startDate cannot be after endDate');
        }
      }
    }
  }

  /**
   * Deterministically calculates the next eligible execution instant.
   * Reference time injection enables 100% deterministic testing across calendar boundaries.
   */
  public static calculateNextRun(
    rule: RecurrenceRule,
    timeZone: string,
    referenceDate: Date = new Date()
  ): NextRunResult | null {
    this.validateRule(rule);

    if (!isValidIanaTimezone(timeZone)) {
      throw new RecurrenceValidationError(`Invalid IANA timezone: "${timeZone}"`);
    }

    const [targetHourStr, targetMinuteStr] = rule.time.split(':');
    const targetHour = parseInt(targetHourStr ?? '0', 10);
    const targetMinute = parseInt(targetMinuteStr ?? '0', 10);
    const interval = rule.interval ?? 1;

    // Check effective start reference
    let effectiveReference = referenceDate;
    if (rule.startDate) {
      const start = new Date(rule.startDate);
      if (start.getTime() > effectiveReference.getTime()) {
        effectiveReference = start;
      }
    }

    const zonedRef = getZonedCalendarDate(effectiveReference, timeZone);
    let candidateInstant: Date | null = null;
    let explanation = '';

    if (rule.frequency === 'DAILY') {
      // Check today first
      let currentYear = zonedRef.year;
      let currentMonth = zonedRef.month;
      let currentDay = zonedRef.day;

      const todayCandidate = zonedDateTimeToUtc(currentYear, currentMonth, currentDay, targetHour, targetMinute, timeZone);
      if (todayCandidate.getTime() > effectiveReference.getTime()) {
        candidateInstant = todayCandidate;
        explanation = `Next daily run today at ${rule.time} (${timeZone})`;
      } else {
        // Advance by interval days
        const nextDayDate = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay + interval));
        currentYear = nextDayDate.getUTCFullYear();
        currentMonth = nextDayDate.getUTCMonth() + 1;
        currentDay = nextDayDate.getUTCDate();

        candidateInstant = zonedDateTimeToUtc(currentYear, currentMonth, currentDay, targetHour, targetMinute, timeZone);
        explanation = `Next daily run in ${interval} day(s) at ${rule.time} (${timeZone})`;
      }
    } else if (rule.frequency === 'WEEKLY') {
      const selectedDays = rule.weekdays ? [...rule.weekdays].sort((a, b) => a - b) : [zonedRef.weekday];

      // Search forward up to 370 days
      for (let i = 0; i <= 370; i++) {
        const checkDate = new Date(Date.UTC(zonedRef.year, zonedRef.month - 1, zonedRef.day + i));
        const checkYear = checkDate.getUTCFullYear();
        const checkMonth = checkDate.getUTCMonth() + 1;
        const checkDay = checkDate.getUTCDate();

        const checkZoned = getZonedCalendarDate(new Date(Date.UTC(checkYear, checkMonth - 1, checkDay, 12, 0, 0)), timeZone);

        if (selectedDays.includes(checkZoned.weekday)) {
          const testInstant = zonedDateTimeToUtc(checkYear, checkMonth, checkDay, targetHour, targetMinute, timeZone);
          if (testInstant.getTime() > effectiveReference.getTime()) {
            candidateInstant = testInstant;
            break;
          }
        }
      }

      if (candidateInstant) {
        const candidateZoned = getZonedCalendarDate(candidateInstant, timeZone);
        const dayName = WEEKDAY_NAMES[candidateZoned.weekday] ?? 'day';
        explanation = `Next weekly run on ${dayName} at ${rule.time} (${timeZone})`;
      }
    } else if (rule.frequency === 'MONTHLY') {
      const targetDay = rule.dayOfMonth ?? 1;
      const policy = rule.monthBoundaryPolicy ?? 'CLAMP_TO_LAST_DAY';

      let currentYear = zonedRef.year;
      let currentMonth = zonedRef.month;

      for (let m = 0; m < 36; m++) {
        const monthDays = getDaysInMonth(currentYear, currentMonth);

        let resolvedDay: number | null = targetDay;
        if (targetDay > monthDays) {
          if (policy === 'CLAMP_TO_LAST_DAY') {
            resolvedDay = monthDays;
          } else {
            // SKIP_MONTH: do not schedule in this month
            resolvedDay = null;
          }
        }

        if (resolvedDay !== null) {
          const testInstant = zonedDateTimeToUtc(currentYear, currentMonth, resolvedDay, targetHour, targetMinute, timeZone);
          if (testInstant.getTime() > effectiveReference.getTime()) {
            candidateInstant = testInstant;
            explanation = `Next monthly run on day ${resolvedDay} (${currentYear}-${String(currentMonth).padStart(2, '0')}) at ${rule.time} (${timeZone})`;
            break;
          }
        }

        // Advance to next month
        currentMonth += interval;
        while (currentMonth > 12) {
          currentMonth -= 12;
          currentYear += 1;
        }
      }
    }

    if (!candidateInstant) {
      return null;
    }

    // Check optional end boundary
    if (rule.endDate) {
      const end = new Date(rule.endDate);
      if (candidateInstant.getTime() > end.getTime()) {
        return null;
      }
    }

    const localCalendar = getZonedCalendarDate(candidateInstant, timeZone);

    return {
      nextRunAt: candidateInstant,
      isoString: candidateInstant.toISOString(),
      localCalendar,
      explanation,
    };
  }

  /**
   * Generates a concise human-readable description for a recurrence rule.
   */
  public static describeRule(rule: RecurrenceRule, timeZone: string): string {
    const interval = rule.interval ?? 1;
    let frequencyText = '';

    if (rule.frequency === 'DAILY') {
      frequencyText = interval === 1 ? 'Daily' : `Every ${interval} days`;
    } else if (rule.frequency === 'WEEKLY') {
      if (rule.weekdays && rule.weekdays.length > 0) {
        const dayNames = rule.weekdays.map((d) => WEEKDAY_NAMES[d] ?? String(d)).join(', ');
        frequencyText = interval === 1 ? `Weekly on ${dayNames}` : `Every ${interval} weeks on ${dayNames}`;
      } else {
        frequencyText = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
      }
    } else if (rule.frequency === 'MONTHLY') {
      const day = rule.dayOfMonth ?? 1;
      frequencyText = interval === 1 ? `Monthly on day ${day}` : `Every ${interval} months on day ${day}`;
    }

    return `${frequencyText} at ${rule.time} (${timeZone})`;
  }

  /**
   * Translates a RecurrenceRule into a standard cron expression string.
   */
  public static toCronExpression(rule: RecurrenceRule): string {
    const [h, m] = rule.time.split(':');
    const minute = parseInt(m ?? '0', 10);
    const hour = parseInt(h ?? '0', 10);

    if (rule.frequency === 'DAILY') {
      const interval = rule.interval && rule.interval > 1 ? `*/${rule.interval}` : '*';
      return `${minute} ${hour} ${interval} * *`;
    } else if (rule.frequency === 'WEEKLY') {
      const days = rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays.join(',') : '*';
      return `${minute} ${hour} * * ${days}`;
    } else if (rule.frequency === 'MONTHLY') {
      const day = rule.dayOfMonth ?? 1;
      const interval = rule.interval && rule.interval > 1 ? `*/${rule.interval}` : '*';
      return `${minute} ${hour} ${day} ${interval} *`;
    }

    return `${minute} ${hour} * * *`;
  }
}
