import { describe, it, expect } from 'vitest';
import { RecurrenceService, RecurrenceValidationError } from '@/server/schedules/recurrence.service';
import { RecurrenceRule } from '@/server/schedules/recurrence.types';

describe('Recurrence Rule Parsing & Validation', () => {
  describe('Rule Validation', () => {
    it('RULE-001: Validates a correct daily recurrence rule', () => {
      const rule: RecurrenceRule = {
        frequency: 'DAILY',
        time: '09:00',
        interval: 1,
      };

      expect(() => RecurrenceService.validateRule(rule)).not.toThrow();
    });

    it('RULE-002: Validates a correct weekly recurrence rule', () => {
      const rule: RecurrenceRule = {
        frequency: 'WEEKLY',
        time: '14:30',
        interval: 1,
        weekdays: [1, 3, 5], // Mon, Wed, Fri
      };

      expect(() => RecurrenceService.validateRule(rule)).not.toThrow();
    });

    it('RULE-003: Validates a correct monthly recurrence rule', () => {
      const rule: RecurrenceRule = {
        frequency: 'MONTHLY',
        time: '10:00',
        dayOfMonth: 15,
        monthBoundaryPolicy: 'CLAMP_TO_LAST_DAY',
      };

      expect(() => RecurrenceService.validateRule(rule)).not.toThrow();
    });

    it('RULE-004: Rejects unsupported frequency', () => {
      const rule = {
        frequency: 'HOURLY' as any,
        time: '10:00',
      };

      expect(() => RecurrenceService.validateRule(rule)).toThrow(RecurrenceValidationError);
    });

    it('RULE-005: Rejects invalid time formats', () => {
      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'DAILY',
          time: '9:00', // missing leading zero
        })
      ).toThrow(RecurrenceValidationError);

      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'DAILY',
          time: '25:00', // invalid hour
        })
      ).toThrow(RecurrenceValidationError);

      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'DAILY',
          time: '12:60', // invalid minute
        })
      ).toThrow(RecurrenceValidationError);
    });

    it('RULE-006: Rejects negative or non-integer intervals', () => {
      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'DAILY',
          time: '09:00',
          interval: -1,
        })
      ).toThrow(RecurrenceValidationError);

      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'DAILY',
          time: '09:00',
          interval: 1.5 as any,
        })
      ).toThrow(RecurrenceValidationError);
    });

    it('RULE-007: Rejects weekly rule with empty weekdays or out-of-range days', () => {
      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'WEEKLY',
          time: '09:00',
          weekdays: [],
        })
      ).toThrow(RecurrenceValidationError);

      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'WEEKLY',
          time: '09:00',
          weekdays: [0], // 0 is invalid (ISO is 1..7)
        })
      ).toThrow(RecurrenceValidationError);

      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'WEEKLY',
          time: '09:00',
          weekdays: [8], // 8 is invalid
        })
      ).toThrow(RecurrenceValidationError);

      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'WEEKLY',
          time: '09:00',
          weekdays: [1, 1], // duplicate
        })
      ).toThrow(RecurrenceValidationError);
    });

    it('RULE-008: Rejects monthly rule with invalid dayOfMonth', () => {
      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'MONTHLY',
          time: '09:00',
          dayOfMonth: 0,
        })
      ).toThrow(RecurrenceValidationError);

      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'MONTHLY',
          time: '09:00',
          dayOfMonth: 32,
        })
      ).toThrow(RecurrenceValidationError);
    });

    it('RULE-009: Rejects startDate after endDate', () => {
      expect(() =>
        RecurrenceService.validateRule({
          frequency: 'DAILY',
          time: '09:00',
          startDate: '2026-12-01T00:00:00Z',
          endDate: '2026-06-01T00:00:00Z',
        })
      ).toThrow(RecurrenceValidationError);
    });
  });

  describe('Rule Description & Cron Formatting', () => {
    it('RULE-010: Formats daily description and cron expression', () => {
      const rule: RecurrenceRule = {
        frequency: 'DAILY',
        time: '08:30',
        interval: 1,
      };

      const desc = RecurrenceService.describeRule(rule, 'America/New_York');
      expect(desc).toBe('Daily at 08:30 (America/New_York)');

      const cron = RecurrenceService.toCronExpression(rule);
      expect(cron).toBe('30 8 * * *');
    });

    it('RULE-011: Formats weekly description and cron expression', () => {
      const rule: RecurrenceRule = {
        frequency: 'WEEKLY',
        time: '14:00',
        interval: 1,
        weekdays: [1, 3, 5],
      };

      const desc = RecurrenceService.describeRule(rule, 'Europe/London');
      expect(desc).toBe('Weekly on Mon, Wed, Fri at 14:00 (Europe/London)');

      const cron = RecurrenceService.toCronExpression(rule);
      expect(cron).toBe('0 14 * * 1,3,5');
    });

    it('RULE-012: Formats monthly description and cron expression', () => {
      const rule: RecurrenceRule = {
        frequency: 'MONTHLY',
        time: '09:15',
        interval: 1,
        dayOfMonth: 15,
      };

      const desc = RecurrenceService.describeRule(rule, 'Asia/Karachi');
      expect(desc).toBe('Monthly on day 15 at 09:15 (Asia/Karachi)');

      const cron = RecurrenceService.toCronExpression(rule);
      expect(cron).toBe('15 9 15 * *');
    });
  });
});

