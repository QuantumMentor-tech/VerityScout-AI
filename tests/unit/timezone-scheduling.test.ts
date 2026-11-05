import { describe, it, expect } from 'vitest';
import {
  isValidIanaTimezone,
  getZonedCalendarDate,
  zonedDateTimeToUtc,
} from '@/server/schedules/timezone.utils';
import { RecurrenceService } from '@/server/schedules/recurrence.service';
import { RecurrenceRule } from '@/server/schedules/recurrence.types';

describe('Timezone & Daylight-Saving Correctness', () => {
  describe('IANA Timezone Validation', () => {
    it('TZ-001: Accepts valid IANA timezones', () => {
      expect(isValidIanaTimezone('UTC')).toBe(true);
      expect(isValidIanaTimezone('America/New_York')).toBe(true);
      expect(isValidIanaTimezone('Europe/London')).toBe(true);
      expect(isValidIanaTimezone('Asia/Karachi')).toBe(true);
      expect(isValidIanaTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidIanaTimezone('Australia/Sydney')).toBe(true);
    });

    it('TZ-002: Rejects invalid or bare-offset timezones', () => {
      expect(isValidIanaTimezone('Invalid/Zone')).toBe(false);
      expect(isValidIanaTimezone('UTC+5')).toBe(false);
      expect(isValidIanaTimezone('+05:00')).toBe(false);
      expect(isValidIanaTimezone('GMT-4')).toBe(false);
      expect(isValidIanaTimezone('')).toBe(false);
      expect(isValidIanaTimezone('   ')).toBe(false);
      expect(isValidIanaTimezone('America/New_York ')).toBe(false); // leading/trailing spaces
    });
  });

  describe('Local Wall-Time vs UTC Instant Conversion', () => {
    it('TZ-003: Computes exact UTC instant for EDT summer time (UTC-4)', () => {
      // 2026-06-15 09:00:00 in America/New_York is EDT (UTC-4), which is 13:00:00Z
      const instant = zonedDateTimeToUtc(2026, 6, 15, 9, 0, 'America/New_York');
      expect(instant.toISOString()).toBe('2026-06-15T13:00:00.000Z');

      const zoned = getZonedCalendarDate(instant, 'America/New_York');
      expect(zoned.year).toBe(2026);
      expect(zoned.month).toBe(6);
      expect(zoned.day).toBe(15);
      expect(zoned.hour).toBe(9);
      expect(zoned.minute).toBe(0);
    });

    it('TZ-004: Computes exact UTC instant for EST winter time (UTC-5)', () => {
      // 2026-01-15 09:00:00 in America/New_York is EST (UTC-5), which is 14:00:00Z
      const instant = zonedDateTimeToUtc(2026, 1, 15, 9, 0, 'America/New_York');
      expect(instant.toISOString()).toBe('2026-01-15T14:00:00.000Z');

      const zoned = getZonedCalendarDate(instant, 'America/New_York');
      expect(zoned.hour).toBe(9);
      expect(zoned.minute).toBe(0);
    });

    it('TZ-005: Preserves fixed 09:00 local time without 24-hour UTC drift across DST change', () => {
      const rule: RecurrenceRule = {
        frequency: 'DAILY',
        time: '09:00',
        interval: 1,
      };

      // Reference: 2026-03-07 10:00 EST (day before spring forward)
      const refDay1 = new Date('2026-03-07T15:00:00.000Z');
      const next1 = RecurrenceService.calculateNextRun(rule, 'America/New_York', refDay1);
      expect(next1).not.toBeNull();
      // On 2026-03-08, New York is EDT (UTC-4) => 09:00 EDT = 13:00 UTC
      expect(next1!.localCalendar.hour).toBe(9);
      expect(next1!.localCalendar.day).toBe(8);
      expect(next1!.isoString).toBe('2026-03-08T13:00:00.000Z');

      // Now calculate from 2026-03-08 10:00 EDT for next day
      const refDay2 = new Date('2026-03-08T14:00:00.000Z');
      const next2 = RecurrenceService.calculateNextRun(rule, 'America/New_York', refDay2);
      expect(next2).not.toBeNull();
      // On 2026-03-09, New York is 09:00 EDT => 13:00 UTC
      expect(next2!.localCalendar.hour).toBe(9);
      expect(next2!.localCalendar.day).toBe(9);
      expect(next2!.isoString).toBe('2026-03-09T13:00:00.000Z');
    });
  });

  describe('Daylight Saving Gap and Overlap Handling', () => {
    it('TZ-006: Spring-Forward Gap shifts forward deterministically', () => {
      // On 2026-03-08, 02:30 does not exist in America/New_York (clock skips 02:00 -> 03:00)
      const instant = zonedDateTimeToUtc(2026, 3, 8, 2, 30, 'America/New_York');
      expect(instant).toBeInstanceOf(Date);
      expect(isNaN(instant.getTime())).toBe(false);

      const zoned = getZonedCalendarDate(instant, 'America/New_York');
      // The shifted valid local time must be on March 8
      expect(zoned.year).toBe(2026);
      expect(zoned.month).toBe(3);
      expect(zoned.day).toBe(8);
    });

    it('TZ-007: Fall-Back Overlap deterministically selects the earlier UTC instant', () => {
      // On 2026-11-01, 01:30 occurs twice in America/New_York (EDT UTC-4 at 05:30Z, then EST UTC-5 at 06:30Z)
      const instant = zonedDateTimeToUtc(2026, 11, 1, 1, 30, 'America/New_York');
      // Policy: First occurrence (earlier UTC instant = 05:30Z)
      expect(instant.toISOString()).toBe('2026-11-01T05:30:00.000Z');

      const zoned = getZonedCalendarDate(instant, 'America/New_York');
      expect(zoned.hour).toBe(1);
      expect(zoned.minute).toBe(30);
    });
  });

  describe('Year Boundary Transitions', () => {
    it('TZ-008: Correctly transitions across New Year boundary', () => {
      const rule: RecurrenceRule = {
        frequency: 'DAILY',
        time: '08:00',
        interval: 1,
      };

      // Reference: Dec 31, 2026 at 20:00 in Tokyo
      const refDate = new Date('2026-12-31T11:00:00.000Z'); // 20:00 JST (UTC+9)
      const next = RecurrenceService.calculateNextRun(rule, 'Asia/Tokyo', refDate);

      expect(next).not.toBeNull();
      expect(next!.localCalendar.year).toBe(2027);
      expect(next!.localCalendar.month).toBe(1);
      expect(next!.localCalendar.day).toBe(1);
      expect(next!.localCalendar.hour).toBe(8);
      expect(next!.localCalendar.minute).toBe(0);
      expect(next!.isoString).toBe('2026-12-31T23:00:00.000Z'); // 08:00 JST on Jan 1 is 23:00Z on Dec 31
    });
  });
});

