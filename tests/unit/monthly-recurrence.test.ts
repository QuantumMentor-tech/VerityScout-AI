import { describe, it, expect } from 'vitest';
import { RecurrenceService } from '@/server/schedules/recurrence.service';
import { RecurrenceRule } from '@/server/schedules/recurrence.types';

describe('Monthly Recurrence & Calendar Boundaries', () => {
  it('MONTH-001: Correctly schedules day 15 across normal months', () => {
    const rule: RecurrenceRule = {
      frequency: 'MONTHLY',
      time: '10:00',
      dayOfMonth: 15,
      interval: 1,
    };

    // Reference: April 10, 2026 at 09:00 UTC
    const refDate = new Date('2026-04-10T09:00:00.000Z');
    const next = RecurrenceService.calculateNextRun(rule, 'UTC', refDate);

    expect(next).not.toBeNull();
    expect(next!.localCalendar.year).toBe(2026);
    expect(next!.localCalendar.month).toBe(4);
    expect(next!.localCalendar.day).toBe(15);
    expect(next!.localCalendar.hour).toBe(10);
  });

  it('MONTH-002: CLAMP_TO_LAST_DAY clamps day 31 to day 30 in April', () => {
    const rule: RecurrenceRule = {
      frequency: 'MONTHLY',
      time: '12:00',
      dayOfMonth: 31,
      monthBoundaryPolicy: 'CLAMP_TO_LAST_DAY',
      interval: 1,
    };

    // Reference: April 5, 2026
    const refDate = new Date('2026-04-05T10:00:00.000Z');
    const next = RecurrenceService.calculateNextRun(rule, 'UTC', refDate);

    expect(next).not.toBeNull();
    expect(next!.localCalendar.month).toBe(4);
    expect(next!.localCalendar.day).toBe(30); // April has 30 days
    expect(next!.localCalendar.hour).toBe(12);
  });

  it('MONTH-003: CLAMP_TO_LAST_DAY clamps day 31 to day 28 in non-leap February 2026', () => {
    const rule: RecurrenceRule = {
      frequency: 'MONTHLY',
      time: '12:00',
      dayOfMonth: 31,
      monthBoundaryPolicy: 'CLAMP_TO_LAST_DAY',
      interval: 1,
    };

    // Reference: Feb 1, 2026
    const refDate = new Date('2026-02-01T10:00:00.000Z');
    const next = RecurrenceService.calculateNextRun(rule, 'UTC', refDate);

    expect(next).not.toBeNull();
    expect(next!.localCalendar.year).toBe(2026);
    expect(next!.localCalendar.month).toBe(2);
    expect(next!.localCalendar.day).toBe(28); // 2026 is non-leap (28 days)
  });

  it('MONTH-004: CLAMP_TO_LAST_DAY clamps day 31 to day 29 in leap February 2028', () => {
    const rule: RecurrenceRule = {
      frequency: 'MONTHLY',
      time: '12:00',
      dayOfMonth: 31,
      monthBoundaryPolicy: 'CLAMP_TO_LAST_DAY',
      interval: 1,
    };

    // Reference: Feb 1, 2028 (leap year)
    const refDate = new Date('2028-02-01T10:00:00.000Z');
    const next = RecurrenceService.calculateNextRun(rule, 'UTC', refDate);

    expect(next).not.toBeNull();
    expect(next!.localCalendar.year).toBe(2028);
    expect(next!.localCalendar.month).toBe(2);
    expect(next!.localCalendar.day).toBe(29); // 2028 is leap year (29 days)
  });

  it('MONTH-005: SKIP_MONTH skips April (30 days) when target is day 31, scheduling May 31', () => {
    const rule: RecurrenceRule = {
      frequency: 'MONTHLY',
      time: '12:00',
      dayOfMonth: 31,
      monthBoundaryPolicy: 'SKIP_MONTH',
      interval: 1,
    };

    // Reference: April 1, 2026
    const refDate = new Date('2026-04-01T10:00:00.000Z');
    const next = RecurrenceService.calculateNextRun(rule, 'UTC', refDate);

    expect(next).not.toBeNull();
    // Skips April, schedules in May
    expect(next!.localCalendar.year).toBe(2026);
    expect(next!.localCalendar.month).toBe(5);
    expect(next!.localCalendar.day).toBe(31);
  });

  it('MONTH-006: Respects multi-month intervals (e.g. quarterly every 3 months)', () => {
    const rule: RecurrenceRule = {
      frequency: 'MONTHLY',
      time: '09:00',
      dayOfMonth: 1,
      interval: 3, // Quarterly
    };

    // Reference: Jan 15, 2026 (Jan 1 already passed)
    const refDate = new Date('2026-01-15T10:00:00.000Z');
    const next = RecurrenceService.calculateNextRun(rule, 'UTC', refDate);

    expect(next).not.toBeNull();
    // Jan + 3 months => April 1
    expect(next!.localCalendar.year).toBe(2026);
    expect(next!.localCalendar.month).toBe(4);
    expect(next!.localCalendar.day).toBe(1);
    expect(next!.localCalendar.hour).toBe(9);
  });
});

