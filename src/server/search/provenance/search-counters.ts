import 'server-only';
import type { SearchOperationCounters } from './contracts';

/**
 * VerityScout AI — Search Counter Tracker
 * Governed by: Step 35 (Search Result Counters and Provenance Tracking)
 *
 * Counter Invariants:
 * 1. executedQueries === successfulQueries + failedQueries
 * 2. rawResultsReceived === rejectedResults + validDiscoveries
 * 3. validDiscoveries === uniqueSourcesDiscovered + duplicateDiscoveries
 * 4. Counters derive strictly from actual events, zero fabrication or speculative progress.
 */
export class SearchCounterTracker {
  private plannedQueries = 0;
  private executedQueries = 0;
  private successfulQueries = 0;
  private failedQueries = 0;
  private rawResultsReceived = 0;
  private rejectedResults = 0;
  private validDiscoveries = 0;
  private duplicateDiscoveries = 0;
  private uniqueSourcesDiscovered = 0;
  private sourcesExtracted = 0;
  private extractionFailed = 0;

  constructor(initialPlannedQueries: number = 0) {
    this.plannedQueries = Math.max(0, initialPlannedQueries);
  }

  recordQueryDispatched(): void {
    this.executedQueries++;
  }

  recordQuerySuccess(rawResultCount: number): void {
    this.successfulQueries++;
    this.rawResultsReceived += Math.max(0, rawResultCount);
  }

  recordQueryFailure(): void {
    this.failedQueries++;
  }

  recordRejectedResult(): void {
    this.rejectedResults++;
  }

  recordDiscovery(isUnique: boolean): void {
    this.validDiscoveries++;
    if (isUnique) {
      this.uniqueSourcesDiscovered++;
    } else {
      this.duplicateDiscoveries++;
    }
  }

  recordExtraction(isSuccess: boolean): void {
    if (isSuccess) {
      this.sourcesExtracted++;
    } else {
      this.extractionFailed++;
    }
  }

  /**
   * Returns an immutable snapshot of all counters.
   */
  getSnapshot(): SearchOperationCounters {
    return {
      plannedQueries: this.plannedQueries,
      executedQueries: this.executedQueries,
      successfulQueries: this.successfulQueries,
      failedQueries: this.failedQueries,
      rawResultsReceived: this.rawResultsReceived,
      rejectedResults: this.rejectedResults,
      validDiscoveries: this.validDiscoveries,
      duplicateDiscoveries: this.duplicateDiscoveries,
      uniqueSourcesDiscovered: this.uniqueSourcesDiscovered,
      sourcesExtracted: this.sourcesExtracted,
      extractionFailed: this.extractionFailed,
    };
  }

  /**
   * Verifies mathematical invariants across counter values.
   */
  verifyInvariants(): { isValid: boolean; discrepancies: string[] } {
    const discrepancies: string[] = [];

    if (this.executedQueries !== this.successfulQueries + this.failedQueries) {
      discrepancies.push(
        `Executed queries (${this.executedQueries}) != successful (${this.successfulQueries}) + failed (${this.failedQueries})`
      );
    }

    if (this.rawResultsReceived !== this.rejectedResults + this.validDiscoveries) {
      discrepancies.push(
        `Raw results (${this.rawResultsReceived}) != rejected (${this.rejectedResults}) + valid discoveries (${this.validDiscoveries})`
      );
    }

    if (this.validDiscoveries !== this.uniqueSourcesDiscovered + this.duplicateDiscoveries) {
      discrepancies.push(
        `Valid discoveries (${this.validDiscoveries}) != unique sources (${this.uniqueSourcesDiscovered}) + duplicates (${this.duplicateDiscoveries})`
      );
    }

    return {
      isValid: discrepancies.length === 0,
      discrepancies,
    };
  }
}

