export interface ChangeItem {
  id?: string;
  candidateTitle: string;
  canonicalUrl?: string;
  fieldName: string;
  changeType: string;
  changeStatus?: string;
  reasonCode?: string;
  previousValue: string;
  newValue: string;
  percentageDelta?: number | null;
  evidenceId?: string | null;
  baselineEvidenceId?: string | null;
  explanation?: string;
  detectedAt?: string;
}

export interface ChangeSummaryMetrics {
  totalCompared: number;
  changedCount: number;
  unchangedCount: number;
  newlyObservedCount: number;
  noLongerObservedCount: number;
  conflictingCount: number;
  notComparableCount: number;
}

