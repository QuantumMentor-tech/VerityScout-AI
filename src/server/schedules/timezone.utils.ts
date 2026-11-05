import 'server-only';
import { ZonedCalendarDate } from './recurrence.types';

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * Validates whether a given string is a recognized IANA timezone identifier.
 * Rejects bare fixed offsets (e.g. "UTC+5") or malformed strings.
 */
export function isValidIanaTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  const trimmed = timeZone.trim();
  if (trimmed !== timeZone || trimmed.length === 0) return false;

  // Disallow bare offset strings like UTC+5, GMT-3, +05:00
  if (/^(UTC|GMT)?[+-]\d+/i.test(trimmed)) {
    return false;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the number of calendar days in a given year and month (1-12).
 * Correctly accounts for leap years in the Gregorian calendar.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Decomposes a UTC instant into its local civil calendar components
 * in the specified IANA timezone.
 */
export function getZonedCalendarDate(date: Date, timeZone: string): ZonedCalendarDate {
  if (!isValidIanaTimezone(timeZone)) {
    throw new Error(`Invalid IANA timezone: "${timeZone}"`);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = parseInt(partMap.year ?? '0', 10);
  const month = parseInt(partMap.month ?? '1', 10);
  const day = parseInt(partMap.day ?? '1', 10);
  let hour = parseInt(partMap.hour ?? '0', 10);
  if (hour === 24) hour = 0; // Normalize midnight if returned as 24
  const minute = parseInt(partMap.minute ?? '0', 10);
  const second = parseInt(partMap.second ?? '0', 10);
  const weekday = WEEKDAY_MAP[partMap.weekday ?? 'Mon'] ?? 1;

  return { year, month, day, hour, minute, second, weekday };
}

/**
 * Converts a target civil wall-clock date and time in an IANA timezone
 * into its corresponding absolute UTC instant.
 *
 * Implements deterministic policies:
 * - Spring Forward (Gap): If local time falls into a gap, shifts forward to the first valid instant.
 * - Fall Back (Overlap): If local time is ambiguous, selects the earlier UTC instant (first occurrence).
 */
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  if (!isValidIanaTimezone(timeZone)) {
    throw new Error(`Invalid IANA timezone: "${timeZone}"`);
  }

  // Desired local timestamp in pseudo-UTC milliseconds
  const desiredUtcTime = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Initial estimate assuming zero offset
  const initialEstimate = new Date(desiredUtcTime);
  const zonedInitial = getZonedCalendarDate(initialEstimate, timeZone);
  const zonedInitialTime = Date.UTC(
    zonedInitial.year,
    zonedInitial.month - 1,
    zonedInitial.day,
    zonedInitial.hour,
    zonedInitial.minute,
    0,
    0
  );

  const initialOffset = desiredUtcTime - zonedInitialTime;
  let candidate = new Date(desiredUtcTime + initialOffset);

  // Refine candidate
  const zonedCandidate = getZonedCalendarDate(candidate, timeZone);
  const zonedCandidateTime = Date.UTC(
    zonedCandidate.year,
    zonedCandidate.month - 1,
    zonedCandidate.day,
    zonedCandidate.hour,
    zonedCandidate.minute,
    0,
    0
  );

  const secondaryOffset = desiredUtcTime - zonedCandidateTime;
  if (secondaryOffset !== 0) {
    candidate = new Date(candidate.getTime() + secondaryOffset);
  }

  // Handle Fall Back Overlap: Check if an instant 1 hour earlier yields the same wall-clock time
  const earlierInstant = new Date(candidate.getTime() - 3600000);
  const zonedEarlier = getZonedCalendarDate(earlierInstant, timeZone);
  const zonedEarlierTime = Date.UTC(
    zonedEarlier.year,
    zonedEarlier.month - 1,
    zonedEarlier.day,
    zonedEarlier.hour,
    zonedEarlier.minute,
    0,
    0
  );

  if (zonedEarlierTime === desiredUtcTime) {
    return earlierInstant;
  }

  return candidate;
}

