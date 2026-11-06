import 'server-only';
import {
  ChangeType,
  ChangeStatus,
  ComparisonStatus,
  CandidateResultRow,
  EvidenceRecordRow,
} from '@/server/persistence/types';

export const COMPARISON_POLICY_VERSION = 'v1.0';

export type ChangeReasonCode =
  | 'VALUE_EQUIVALENT_AFTER_NORMALIZATION'
  | 'COMPARABLE_VALUE_CHANGED'
  | 'PRICE_DROP_CONFIRMED'
  | 'PRICE_INCREASE_CONFIRMED'
  | 'STOCK_STATUS_CHANGED'
  | 'SPECIFICATION_UPDATED'
  | 'ATTRIBUTE_FIRST_OBSERVED'
  | 'ATTRIBUTE_NO_LONGER_OBSERVED'
  | 'SOURCE_CONTENT_CHANGED'
  | 'SOURCE_SCOPE_MISMATCH'
  | 'CANDIDATE_IDENTITY_UNRESOLVED'
  | 'MODEL_VARIANT_MISMATCH'
  | 'CURRENCY_NOT_COMPARABLE'
  | 'UNIT_NOT_COMPARABLE'
  | 'PRICE_SEMANTICS_CHANGED'
  | 'SOURCE_EVIDENCE_CONFLICT'
  | 'CURRENT_EVIDENCE_MISSING'
  | 'BASELINE_EVIDENCE_INCOMPLETE'
  | 'NORMALIZATION_VERSION_MISMATCH'
  | 'QUERY_SCOPE_CHANGED'
  | 'SOURCE_EXTRACTION_FAILED'
  | 'FRESHNESS_NOT_ESTABLISHED'
  | 'FIRST_RUN_BASELINE_ESTABLISHED';

export interface ComparisonScope {
  readonly taskId: string;
  readonly scheduleId?: string | null | undefined;
  readonly userId: string;
  readonly baselineRunId: string;
  readonly currentRunId: string;
  readonly comparisonPolicyVersion?: string | undefined;
}

export interface CandidateWithEvidence {
  readonly candidate: CandidateResultRow;
  readonly evidence: EvidenceRecordRow[];
}

export interface CandidateMatchPair {
  readonly baseline: CandidateWithEvidence | null;
  readonly current: CandidateWithEvidence | null;
  readonly matchType: 'STABLE_IDENTIFIER' | 'CANONICAL_URL' | 'CLEAN_TITLE' | 'NEWLY_OBSERVED' | 'NO_LONGER_OBSERVED';
  readonly matchKey: string;
}

export interface DetectedChange {
  readonly id?: string | undefined;
  readonly comparisonId?: string | undefined;
  readonly taskId: string;
  readonly scheduleId?: string | null | undefined;
  readonly userId: string;
  readonly previousRunId: string;
  readonly currentRunId: string;
  readonly candidateId?: string | null | undefined;
  readonly candidateTitle: string;
  readonly canonicalUrl: string;
  readonly fieldName: string;
  readonly changeType: ChangeType;
  readonly changeStatus: ChangeStatus;
  readonly reasonCode: ChangeReasonCode;
  readonly previousValue: string;
  readonly newValue: string;
  readonly percentageDelta?: number | null | undefined;
  readonly evidenceId?: string | null | undefined;
  readonly baselineEvidenceId?: string | null | undefined;
  readonly isSupported: boolean;
  readonly explanation: string;
  readonly idempotencyKey: string;
  readonly detectedAt?: string | undefined;
}

export interface ComparisonSummary {
  readonly totalCompared: number;
  readonly changedCount: number;
  readonly unchangedCount: number;
  readonly newlyObservedCount: number;
  readonly noLongerObservedCount: number;
  readonly conflictingCount: number;
  readonly notComparableCount: number;
}

export interface ComparisonResult {
  readonly id: string;
  readonly taskId: string;
  readonly scheduleId?: string | null | undefined;
  readonly userId: string;
  readonly baselineRunId: string;
  readonly currentRunId: string;
  readonly status: ComparisonStatus;
  readonly comparisonPolicyVersion: string;
  readonly reasonCode?: ChangeReasonCode | null | undefined;
  readonly changes: DetectedChange[];
  readonly summary: ComparisonSummary;
  readonly detectedAt: string;
}

