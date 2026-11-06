import { describe, it, expect } from 'vitest';
import { evaluateComparisonAlerts } from '@/server/notifications/alert-policy';
import {
  ComparisonResult,
  DetectedChange,
  COMPARISON_POLICY_VERSION,
} from '@/server/changes/change-detection.types';
import {
  ChangeType,
  ChangeStatus,
  ComparisonStatus,
  NotificationType,
} from '@/server/persistence/types';

describe('Alert Policy & Epistemic Honesty (Step 50)', () => {
  const baseComparison: ComparisonResult = {
    id: 'comp-1111-1111-1111-1111',
    taskId: 'task-1',
    scheduleId: 'sched-1',
    userId: 'user-1',
    baselineRunId: 'run-base-1',
    currentRunId: 'run-curr-1',
    status: ComparisonStatus.CHANGES_DETECTED,
    comparisonPolicyVersion: COMPARISON_POLICY_VERSION,
    reasonCode: null,
    changes: [],
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

  const sampleChange = (overrides?: Partial<DetectedChange>): DetectedChange => ({
    id: 'ch-1',
    comparisonId: 'comp-1111-1111-1111-1111',
    taskId: 'task-1',
    scheduleId: 'sched-1',
    userId: 'user-1',
    previousRunId: 'run-base-1',
    currentRunId: 'run-curr-1',
    candidateTitle: 'Sony WH-1000XM5',
    canonicalUrl: 'https://sony.com/wh1000xm5',
    fieldName: 'price',
    changeType: ChangeType.PRICE_DROP,
    changeStatus: ChangeStatus.SUPPORTED,
    reasonCode: 'PRICE_DROP_CONFIRMED',
    previousValue: '399.99 USD',
    newValue: '349.99 USD',
    percentageDelta: -12.50,
    isSupported: true,
    explanation: 'Price dropped by $50.00.',
    idempotencyKey: 'sony_price_drop_12',
    ...overrides,
  });

  describe('Suppression of Non-Alertable Comparison Sessions', () => {
    it('produces zero alerts on initial baseline establishment (AC-04)', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        status: ComparisonStatus.FIRST_RUN_BASELINE,
        reasonCode: 'FIRST_RUN_BASELINE_ESTABLISHED',
        changes: [sampleChange()],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(0);
    });

    it('produces zero alerts on ineligible scope comparisons', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        status: ComparisonStatus.INELIGIBLE_SCOPE,
        reasonCode: 'QUERY_SCOPE_CHANGED',
        changes: [sampleChange()],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(0);
    });

    it('produces zero alerts when status is NO_CHANGES_DETECTED', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        status: ComparisonStatus.NO_CHANGES_DETECTED,
        changes: [],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Confirmed Change Alert Types', () => {
    it('evaluates eligible PRICE_DROP with grounded summary and evidence link', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [sampleChange()],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      expect(alert.isSuppressed).toBe(false);
      expect(alert.notificationType).toBe(NotificationType.PRICE_DROP);
      expect(alert.title).toBe('Price Drop: Sony WH-1000XM5');
      expect(alert.summary).toContain('Observed price dropped from 399.99 USD to 349.99 USD (-12.50%)');
      expect(alert.idempotencyKey).toBe('notif:user-1:comp-1111-1111-1111-1111:sony_price_drop_12');
    });

    it('evaluates eligible PRICE_INCREASE correctly', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.PRICE_INCREASE,
            reasonCode: 'PRICE_INCREASE_CONFIRMED',
            previousValue: '349.99 USD',
            newValue: '399.99 USD',
            percentageDelta: 14.29,
          }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      expect(alert.isSuppressed).toBe(false);
      expect(alert.notificationType).toBe(NotificationType.PRICE_INCREASE);
      expect(alert.title).toBe('Price Increase: Sony WH-1000XM5');
      expect(alert.summary).toContain('Observed price increased from 349.99 USD to 399.99 USD (+14.29%)');
    });

    it('evaluates eligible STOCK_STATUS_CHANGE correctly', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.STOCK_STATUS_CHANGE,
            reasonCode: 'STOCK_STATUS_CHANGED',
            fieldName: 'availability',
            previousValue: 'OUT_OF_STOCK',
            newValue: 'IN_STOCK',
            percentageDelta: null,
          }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      expect(alert.isSuppressed).toBe(false);
      expect(alert.notificationType).toBe(NotificationType.STOCK_STATUS_CHANGED);
      expect(alert.title).toBe('Stock Status Changed: Sony WH-1000XM5');
      expect(alert.summary).toBe('Observed availability status changed from OUT_OF_STOCK to IN_STOCK.');
    });

    it('evaluates eligible SPECIFICATION_UPDATE correctly', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.SPECIFICATION_UPDATE,
            reasonCode: 'SPECIFICATION_UPDATED',
            fieldName: 'warranty',
            previousValue: '1 year',
            newValue: '2 years',
            percentageDelta: null,
          }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      expect(alert.isSuppressed).toBe(false);
      expect(alert.notificationType).toBe(NotificationType.SPECIFICATION_UPDATED);
      expect(alert.title).toBe('Specification Updated: Sony WH-1000XM5');
      expect(alert.summary).toBe('Observed warranty updated from 1 year to 2 years.');
    });
  });

  describe('Uncertainty Protection & Honest Labeling (Section 6.2)', () => {
    it('labels NEWLY_OBSERVED as observation rather than confirmed creation', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.NEWLY_OBSERVED,
            fieldName: 'displaySize',
            previousValue: '',
            newValue: '65 inch',
            percentageDelta: null,
          }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      expect(alert.isSuppressed).toBe(false);
      expect(alert.title).toBe('New Observation: Sony WH-1000XM5');
      expect(alert.summary).toContain('not verified real-world creation');
    });

    it('labels NO_LONGER_OBSERVED honestly without claiming deletion', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.NO_LONGER_OBSERVED,
            fieldName: 'price',
            previousValue: '399.99 USD',
            newValue: '',
            percentageDelta: null,
          }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      expect(alert.isSuppressed).toBe(false);
      expect(alert.title).toBe('No Longer Observed: Sony WH-1000XM5');
      expect(alert.summary).toContain('Lack of observation does not confirm real-world deletion');
    });

    it('labels CONFLICTING evidence as disagreement rather than picking a false winner', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.CONFLICTING,
            fieldName: 'batteryLife',
            previousValue: '30 hours',
            newValue: '40 hours',
            percentageDelta: null,
          }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      expect(alert.isSuppressed).toBe(false);
      expect(alert.title).toBe('Conflicting Evidence: Sony WH-1000XM5');
      expect(alert.summary).toContain('Disagreement detected across extracted sources');
    });

    it('suppresses UNCHANGED, NOT_COMPARABLE, and UNKNOWN changes', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({ changeType: ChangeType.UNCHANGED }),
          sampleChange({ changeType: ChangeType.NOT_COMPARABLE }),
          sampleChange({ changeType: ChangeType.UNKNOWN }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison);
      expect(alerts).toHaveLength(3);
      expect(alerts.every((a) => a.isSuppressed)).toBe(true);
    });
  });

  describe('Schedule Materiality Threshold Filtering', () => {
    it('suppresses minor price drops below schedule threshold', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.PRICE_DROP,
            percentageDelta: -0.85, // 0.85% drop
          }),
        ],
      };

      // Set threshold to 2.00%
      const alerts = evaluateComparisonAlerts(comparison, { thresholdPct: 2.0 });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.isSuppressed).toBe(true);
      expect(alerts[0]!.suppressionReason).toContain('below schedule threshold 2%');
    });

    it('allows price drops exceeding schedule threshold', () => {
      const comparison: ComparisonResult = {
        ...baseComparison,
        changes: [
          sampleChange({
            changeType: ChangeType.PRICE_DROP,
            percentageDelta: -5.50, // 5.5% drop
          }),
        ],
      };

      const alerts = evaluateComparisonAlerts(comparison, { thresholdPct: 2.0 });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.isSuppressed).toBe(false);
    });
  });
});

