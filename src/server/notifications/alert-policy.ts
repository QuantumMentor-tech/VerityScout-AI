import 'server-only';
import {
  ComparisonResult,
  DetectedChange,
} from '../changes/change-detection.types';
import {
  ChangeType,
  ComparisonStatus,
  NotificationType,
  SourceEventType,
} from '../persistence/types';
import { EvaluatedAlert } from './notification.types';

export interface AlertPolicyOptions {
  readonly thresholdPct?: number | undefined;
}

/**
 * Evaluates a Step 48 ComparisonResult and its DetectedChanges to determine
 * which changes are eligible for user-facing in-app notifications.
 *
 * Implements strict Epistemic Honesty & Uncertainty Protection (Step 50 / Section 6):
 * - Unchanged or non-comparable states are suppressed.
 * - Initial baseline establishment runs produce ZERO false alerts.
 * - Ineligible scopes produce ZERO false alerts.
 * - Materiality thresholds (e.g. 2% price delta) are respected.
 * - NEWLY_OBSERVED and NO_LONGER_OBSERVED are explicitly labeled as search observations,
 *   never misrepresented as confirmed real-world creations or deletions.
 * - CONFLICTING states preserve multi-source disagreement without declaring a false winner.
 */
export function evaluateComparisonAlerts(
  comparison: ComparisonResult,
  options?: AlertPolicyOptions
): readonly EvaluatedAlert[] {
  // 1. Check top-level comparison status eligibility
  if (
    comparison.status === ComparisonStatus.FIRST_RUN_BASELINE ||
    comparison.status === ComparisonStatus.INELIGIBLE_SCOPE ||
    comparison.status === ComparisonStatus.NO_CHANGES_DETECTED
  ) {
    return [];
  }

  const thresholdPct = options?.thresholdPct ?? 0;
  const alerts: EvaluatedAlert[] = [];

  for (const change of comparison.changes) {
    const evaluated = evaluateSingleChange(change, comparison, thresholdPct);
    if (evaluated) {
      alerts.push(evaluated);
    }
  }

  return alerts;
}

function evaluateSingleChange(
  change: DetectedChange,
  comparison: ComparisonResult,
  thresholdPct: number
): EvaluatedAlert | null {
  const logicalKey =
    change.idempotencyKey ||
    `${change.candidateTitle || 'item'}_${change.fieldName || 'field'}_${change.changeType}`;
  const idempotencyKey = `notif:${comparison.userId}:${comparison.id}:${logicalKey}`;

  const baseAlert = {
    sourceEventType: SourceEventType.CHANGE_EVENT,
    sourceEventId: change.id ?? null,
    taskId: comparison.taskId,
    researchRunId: comparison.currentRunId,
    scheduleId: comparison.scheduleId ?? null,
    comparisonId: comparison.id,
    metadata: {
      candidateTitle: change.candidateTitle,
      canonicalUrl: change.canonicalUrl,
      fieldName: change.fieldName,
      changeType: change.changeType,
      previousValue: change.previousValue,
      newValue: change.newValue,
      percentageDelta: change.percentageDelta,
      reasonCode: change.reasonCode,
      evidenceId: change.evidenceId ?? null,
      baselineEvidenceId: change.baselineEvidenceId ?? null,
      explanation: change.explanation,
    },
    idempotencyKey,
  };

  switch (change.changeType) {
    case ChangeType.UNCHANGED:
    case ChangeType.NOT_COMPARABLE:
    case ChangeType.UNKNOWN:
      // Suppress silent, unchanged, or untrusted items
      return {
        ...baseAlert,
        notificationType: NotificationType.RESEARCH_CHANGE_DETECTED,
        title: 'Unchanged Observation',
        summary: 'No material change detected.',
        isSuppressed: true,
        suppressionReason: `Change type ${change.changeType} is not alertable`,
      };

    case ChangeType.PRICE_DROP: {
      const delta = Math.abs(change.percentageDelta ?? 0);
      if (thresholdPct > 0 && delta > 0 && delta < thresholdPct) {
        return {
          ...baseAlert,
          notificationType: NotificationType.PRICE_DROP,
          title: `Minor Price Drop: ${change.candidateTitle}`,
          summary: `Observed price dropped from ${change.previousValue} to ${change.newValue} (${delta.toFixed(2)}%), below the notification threshold of ${thresholdPct}%.`,
          isSuppressed: true,
          suppressionReason: `Delta ${delta.toFixed(2)}% below schedule threshold ${thresholdPct}%`,
        };
      }
      const deltaStr = change.percentageDelta !== null && change.percentageDelta !== undefined
        ? ` (${change.percentageDelta > 0 ? '+' : ''}${change.percentageDelta.toFixed(2)}%)`
        : '';
      return {
        ...baseAlert,
        notificationType: NotificationType.PRICE_DROP,
        title: `Price Drop: ${change.candidateTitle}`,
        summary: `Observed price dropped from ${change.previousValue} to ${change.newValue}${deltaStr}.`,
        isSuppressed: false,
      };
    }

    case ChangeType.PRICE_INCREASE: {
      const delta = Math.abs(change.percentageDelta ?? 0);
      if (thresholdPct > 0 && delta > 0 && delta < thresholdPct) {
        return {
          ...baseAlert,
          notificationType: NotificationType.PRICE_INCREASE,
          title: `Minor Price Increase: ${change.candidateTitle}`,
          summary: `Observed price increased from ${change.previousValue} to ${change.newValue} (${delta.toFixed(2)}%), below the notification threshold of ${thresholdPct}%.`,
          isSuppressed: true,
          suppressionReason: `Delta ${delta.toFixed(2)}% below schedule threshold ${thresholdPct}%`,
        };
      }
      const deltaStr = change.percentageDelta !== null && change.percentageDelta !== undefined
        ? ` (+${change.percentageDelta.toFixed(2)}%)`
        : '';
      return {
        ...baseAlert,
        notificationType: NotificationType.PRICE_INCREASE,
        title: `Price Increase: ${change.candidateTitle}`,
        summary: `Observed price increased from ${change.previousValue} to ${change.newValue}${deltaStr}.`,
        isSuppressed: false,
      };
    }

    case ChangeType.STOCK_STATUS_CHANGE:
      return {
        ...baseAlert,
        notificationType: NotificationType.STOCK_STATUS_CHANGED,
        title: `Stock Status Changed: ${change.candidateTitle}`,
        summary: `Observed availability status changed from ${change.previousValue} to ${change.newValue}.`,
        isSuppressed: false,
      };

    case ChangeType.SPECIFICATION_UPDATE:
      return {
        ...baseAlert,
        notificationType: NotificationType.SPECIFICATION_UPDATED,
        title: `Specification Updated: ${change.candidateTitle}`,
        summary: `Observed ${change.fieldName} updated from ${change.previousValue} to ${change.newValue}.`,
        isSuppressed: false,
      };

    case ChangeType.NEW_OFFER_DISCOVERED:
    case ChangeType.ADDED:
      return {
        ...baseAlert,
        notificationType: NotificationType.NEW_OFFER_DISCOVERED,
        title: `New Offer Discovered: ${change.candidateTitle}`,
        summary: `A newly matched offer or retailer was identified in the latest research run.`,
        isSuppressed: false,
      };

    case ChangeType.NEWLY_OBSERVED:
      return {
        ...baseAlert,
        notificationType: NotificationType.NEW_CANDIDATE_OBSERVED,
        title: `New Observation: ${change.candidateTitle}`,
        summary: `Attribute '${change.fieldName}' was observed for the first time (${change.newValue}). Note: This is an observation from latest sources, not verified real-world creation.`,
        isSuppressed: false,
      };

    case ChangeType.NO_LONGER_OBSERVED:
    case ChangeType.REMOVED:
      return {
        ...baseAlert,
        notificationType: NotificationType.ATTRIBUTE_NO_LONGER_OBSERVED,
        title: `No Longer Observed: ${change.candidateTitle}`,
        summary: `Attribute '${change.fieldName}' (${change.previousValue}) was not observed in the latest search run. Note: Lack of observation does not confirm real-world deletion.`,
        isSuppressed: false,
      };

    case ChangeType.CONFLICTING:
      return {
        ...baseAlert,
        notificationType: NotificationType.CONFLICTING_EVIDENCE_OBSERVED,
        title: `Conflicting Evidence: ${change.candidateTitle}`,
        summary: `Disagreement detected across extracted sources for '${change.fieldName}' (${change.previousValue} vs ${change.newValue}). Review evidence drawer for details.`,
        isSuppressed: false,
      };

    default:
      return {
        ...baseAlert,
        notificationType: NotificationType.RESEARCH_CHANGE_DETECTED,
        title: `Change Observed: ${change.candidateTitle}`,
        summary: `Observed difference in ${change.fieldName} from ${change.previousValue} to ${change.newValue}.`,
        isSuppressed: false,
      };
  }
}

