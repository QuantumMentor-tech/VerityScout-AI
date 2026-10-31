/**
 * ==============================================================================
 * VerityScout AI — Presentation Fixture Types
 * ==============================================================================
 * Governed by: Step 15 (Route and Page Shells Using Fixture Data Only)
 * Phase: 3 of 12 (Core Application Shell & Design Foundations)
 *
 * Types scoped strictly for presentation and testing shells.
 * ==============================================================================
 */

export interface OverviewMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly change?: string;
  readonly badge?: string;
}

export interface SampleActivityItem {
  readonly id: string;
  readonly title: string;
  readonly timestamp: string;
  readonly status: 'completed' | 'verified' | 'monitoring' | 'planned';
  readonly target: string;
  readonly runId?: string;
}

export interface SampleResearchCandidate {
  readonly id: string;
  readonly name: string;
  readonly price: string;
  readonly retailer: string;
  readonly url: string;
  readonly verifiedAttributes: ReadonlyArray<{
    readonly key: string;
    readonly value: string;
    readonly matchesConstraint: boolean;
  }>;
  readonly tier: 'Strong Match' | 'Near Match' | 'Partially Verified';
}

export interface SampleResearchRun {
  readonly id: string;
  readonly query: string;
  readonly status: 'completed' | 'in_progress' | 'failed';
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly sourcesScanned: number;
  readonly candidatesFound: number;
  readonly candidates: readonly SampleResearchCandidate[];
}

export interface SampleHistoryRecord {
  readonly id: string;
  readonly query: string;
  readonly timestamp: string;
  readonly candidatesFound: number;
  readonly matchRate: string;
  readonly durationSeconds: number;
  readonly runId: string;
}

export interface SampleScheduleRecord {
  readonly id: string;
  readonly taskName: string;
  readonly cadence: string;
  readonly targetDomain: string;
  readonly lastRunTimestamp: string;
  readonly nextRunTimestamp: string;
  readonly priceDropAlert: boolean;
}

export interface SampleProviderRecord {
  readonly id: string;
  readonly name: string;
  readonly category: 'LLM Reasoning' | 'Web Search' | 'Web Extraction';
  readonly supportedModels: readonly string[];
  readonly status: 'Planned (Phase 5)' | 'Configurable via BYOK';
  readonly description: string;
}
