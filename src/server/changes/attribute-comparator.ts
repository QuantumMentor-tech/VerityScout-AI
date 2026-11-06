import 'server-only';
import { createHash } from 'crypto';
import { ChangeType, ChangeStatus } from '@/server/persistence/types';
import { parseMeasurement } from '@/server/normalization/units';
import {
  CandidateMatchPair,
  ComparisonScope,
  DetectedChange,
} from './change-detection.types';

export interface AttributeComparatorOptions {
  readonly includeUnchanged?: boolean;
}

export class AttributeComparator {
  /**
   * Deterministically generates a unique, bounded idempotency key for a detected change.
   */
  public generateIdempotencyKey(
    currentRunId: string,
    baselineRunId: string,
    candidateKey: string,
    fieldName: string,
    changeType: string
  ): string {
    const raw = `${currentRunId}:${baselineRunId}:${candidateKey}:${fieldName}:${changeType}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 64);
  }

  /**
   * Compares a list of candidate match pairs against baseline observations.
   */
  public compareAll(
    matchPairs: readonly CandidateMatchPair[],
    scope: ComparisonScope,
    options?: AttributeComparatorOptions
  ): DetectedChange[] {
    const results: DetectedChange[] = [];

    for (const pair of matchPairs) {
      const pairChanges = this.comparePair(pair, scope, options);
      results.push(...pairChanges);
    }

    return results;
  }

  /**
   * Evaluates a single matched candidate pair for attribute deltas.
   */
  public comparePair(
    pair: CandidateMatchPair,
    scope: ComparisonScope,
    options?: AttributeComparatorOptions
  ): DetectedChange[] {
    const includeUnchanged = options?.includeUnchanged ?? false;
    const changes: DetectedChange[] = [];

    // Case 1: Newly observed candidate
    if (pair.matchType === 'NEWLY_OBSERVED' || (!pair.baseline && pair.current)) {
      const current = pair.current!;
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId: current.candidate.id,
        candidateTitle: current.candidate.title,
        canonicalUrl: current.candidate.canonical_url,
        fieldName: 'candidate',
        changeType: ChangeType.NEW_OFFER_DISCOVERED,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'ATTRIBUTE_FIRST_OBSERVED',
        previousValue: 'NOT_OBSERVED',
        newValue: current.candidate.title,
        percentageDelta: null,
        evidenceId: current.evidence[0]?.id ?? null,
        baselineEvidenceId: null,
        isSupported: true,
        explanation: `New offer "${current.candidate.title}" discovered in current run.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          current.candidate.id,
          'candidate',
          ChangeType.NEW_OFFER_DISCOVERED
        ),
      });
      return changes;
    }

    // Case 2: Candidate no longer observed in current run
    // Note: Missing extraction is NOT proof of real-world removal (Section 11.5)
    if (pair.matchType === 'NO_LONGER_OBSERVED' || (pair.baseline && !pair.current)) {
      const baseline = pair.baseline!;
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId: baseline.candidate.id,
        candidateTitle: baseline.candidate.title,
        canonicalUrl: baseline.candidate.canonical_url,
        fieldName: 'candidate',
        changeType: ChangeType.NO_LONGER_OBSERVED,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'ATTRIBUTE_NO_LONGER_OBSERVED',
        previousValue: baseline.candidate.title,
        newValue: 'NO_LONGER_OBSERVED',
        percentageDelta: null,
        evidenceId: null,
        baselineEvidenceId: baseline.evidence[0]?.id ?? null,
        isSupported: true,
        explanation: `Candidate "${baseline.candidate.title}" was not observed in the current research run.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          baseline.candidate.id,
          'candidate',
          ChangeType.NO_LONGER_OBSERVED
        ),
      });
      return changes;
    }

    // Case 3: Both baseline and current present -> compare attributes
    const baseline = pair.baseline!;
    const current = pair.current!;
    const candidateId = current.candidate.id;
    const candidateTitle = current.candidate.title;
    const canonicalUrl = current.candidate.canonical_url;

    // 1. Price Comparison
    this.comparePrice(
      baseline,
      current,
      scope,
      candidateId,
      candidateTitle,
      canonicalUrl,
      includeUnchanged,
      changes
    );

    // 2. Availability Comparison
    this.compareAvailability(
      baseline,
      current,
      scope,
      candidateId,
      candidateTitle,
      canonicalUrl,
      includeUnchanged,
      changes
    );

    // 3. Specifications Comparison
    this.compareSpecifications(
      baseline,
      current,
      scope,
      candidateId,
      candidateTitle,
      canonicalUrl,
      includeUnchanged,
      changes
    );

    return changes;
  }

  private comparePrice(
    baseline: NonNullable<CandidateMatchPair['baseline']>,
    current: NonNullable<CandidateMatchPair['current']>,
    scope: ComparisonScope,
    candidateId: string,
    candidateTitle: string,
    canonicalUrl: string,
    includeUnchanged: boolean,
    changes: DetectedChange[]
  ): void {
    const bPrice = baseline.candidate.price_usd;
    const cPrice = current.candidate.price_usd;
    const bCurr = baseline.candidate.currency ?? 'USD';
    const cCurr = current.candidate.currency ?? 'USD';

    const bEvidenceId = baseline.evidence.find(
      (e) => e.claim_key?.toLowerCase().includes('price')
    )?.id ?? baseline.evidence[0]?.id ?? null;

    const cEvidenceId = current.evidence.find(
      (e) => e.claim_key?.toLowerCase().includes('price')
    )?.id ?? current.evidence[0]?.id ?? null;

    if (bPrice == null && cPrice == null) {
      return;
    }

    if (bPrice != null && cPrice == null) {
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId,
        candidateTitle,
        canonicalUrl,
        fieldName: 'price',
        changeType: ChangeType.NO_LONGER_OBSERVED,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'ATTRIBUTE_NO_LONGER_OBSERVED',
        previousValue: `${bPrice} ${bCurr}`,
        newValue: 'NO_LONGER_OBSERVED',
        percentageDelta: null,
        evidenceId: null,
        baselineEvidenceId: bEvidenceId,
        isSupported: true,
        explanation: `Price was not observed in current run.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          candidateId,
          'price',
          ChangeType.NO_LONGER_OBSERVED
        ),
      });
      return;
    }

    if (bPrice == null && cPrice != null) {
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId,
        candidateTitle,
        canonicalUrl,
        fieldName: 'price',
        changeType: ChangeType.ADDED,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'ATTRIBUTE_FIRST_OBSERVED',
        previousValue: 'NOT_OBSERVED',
        newValue: `${cPrice} ${cCurr}`,
        percentageDelta: null,
        evidenceId: cEvidenceId,
        baselineEvidenceId: null,
        isSupported: true,
        explanation: `Price observed for the first time: ${cPrice} ${cCurr}.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          candidateId,
          'price',
          ChangeType.ADDED
        ),
      });
      return;
    }

    // Both prices present -> check currency matching
    if (bCurr.toUpperCase() !== cCurr.toUpperCase()) {
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId,
        candidateTitle,
        canonicalUrl,
        fieldName: 'price',
        changeType: ChangeType.NOT_COMPARABLE,
        changeStatus: ChangeStatus.NOT_COMPARABLE,
        reasonCode: 'CURRENCY_NOT_COMPARABLE',
        previousValue: `${bPrice} ${bCurr}`,
        newValue: `${cPrice} ${cCurr}`,
        percentageDelta: null,
        evidenceId: cEvidenceId,
        baselineEvidenceId: bEvidenceId,
        isSupported: false,
        explanation: `Price currencies differ (${bCurr} vs ${cCurr}); direct numeric comparison is not comparable without authorized conversion.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          candidateId,
          'price',
          ChangeType.NOT_COMPARABLE
        ),
      });
      return;
    }

    const numOld = Number(bPrice);
    const numNew = Number(cPrice);

    if (isNaN(numOld) || isNaN(numNew)) {
      if (bPrice !== cPrice) {
        changes.push({
          taskId: scope.taskId,
          scheduleId: scope.scheduleId,
          userId: scope.userId,
          previousRunId: scope.baselineRunId,
          currentRunId: scope.currentRunId,
          candidateId,
          candidateTitle,
          canonicalUrl,
          fieldName: 'price',
          changeType: ChangeType.CHANGED,
          changeStatus: ChangeStatus.SUPPORTED,
          reasonCode: 'COMPARABLE_VALUE_CHANGED',
          previousValue: `${bPrice} ${bCurr}`,
          newValue: `${cPrice} ${cCurr}`,
          percentageDelta: null,
          evidenceId: cEvidenceId,
          baselineEvidenceId: bEvidenceId,
          isSupported: true,
          explanation: `Price changed from ${bPrice} to ${cPrice}.`,
          idempotencyKey: this.generateIdempotencyKey(
            scope.currentRunId,
            scope.baselineRunId,
            candidateId,
            'price',
            ChangeType.CHANGED
          ),
        });
      }
      return;
    }

    const diff = numNew - numOld;
    if (Math.abs(diff) < 0.0001) {
      if (includeUnchanged) {
        changes.push({
          taskId: scope.taskId,
          scheduleId: scope.scheduleId,
          userId: scope.userId,
          previousRunId: scope.baselineRunId,
          currentRunId: scope.currentRunId,
          candidateId,
          candidateTitle,
          canonicalUrl,
          fieldName: 'price',
          changeType: ChangeType.UNCHANGED,
          changeStatus: ChangeStatus.SUPPORTED,
          reasonCode: 'VALUE_EQUIVALENT_AFTER_NORMALIZATION',
          previousValue: `${bPrice} ${bCurr}`,
          newValue: `${cPrice} ${cCurr}`,
          percentageDelta: 0,
          evidenceId: cEvidenceId,
          baselineEvidenceId: bEvidenceId,
          isSupported: true,
          explanation: `Price unchanged at ${cPrice} ${cCurr}.`,
          idempotencyKey: this.generateIdempotencyKey(
            scope.currentRunId,
            scope.baselineRunId,
            candidateId,
            'price',
            ChangeType.UNCHANGED
          ),
        });
      }
      return;
    }

    const percentageDelta = numOld !== 0 ? Math.round(((numNew - numOld) / numOld) * 10000) / 100 : 0;

    if (numNew < numOld) {
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId,
        candidateTitle,
        canonicalUrl,
        fieldName: 'price',
        changeType: ChangeType.PRICE_DROP,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'PRICE_DROP_CONFIRMED',
        previousValue: `${bPrice} ${bCurr}`,
        newValue: `${cPrice} ${cCurr}`,
        percentageDelta,
        evidenceId: cEvidenceId,
        baselineEvidenceId: bEvidenceId,
        isSupported: true,
        explanation: `Price decreased by ${Math.abs(percentageDelta)}% from ${bPrice} ${bCurr} to ${cPrice} ${cCurr}.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          candidateId,
          'price',
          ChangeType.PRICE_DROP
        ),
      });
    } else {
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId,
        candidateTitle,
        canonicalUrl,
        fieldName: 'price',
        changeType: ChangeType.PRICE_INCREASE,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'PRICE_INCREASE_CONFIRMED',
        previousValue: `${bPrice} ${bCurr}`,
        newValue: `${cPrice} ${cCurr}`,
        percentageDelta,
        evidenceId: cEvidenceId,
        baselineEvidenceId: bEvidenceId,
        isSupported: true,
        explanation: `Price increased by ${percentageDelta}% from ${bPrice} ${bCurr} to ${cPrice} ${cCurr}.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          candidateId,
          'price',
          ChangeType.PRICE_INCREASE
        ),
      });
    }
  }

  private compareAvailability(
    baseline: NonNullable<CandidateMatchPair['baseline']>,
    current: NonNullable<CandidateMatchPair['current']>,
    scope: ComparisonScope,
    candidateId: string,
    candidateTitle: string,
    canonicalUrl: string,
    includeUnchanged: boolean,
    changes: DetectedChange[]
  ): void {
    const bAvail = baseline.candidate.availability;
    const cAvail = current.candidate.availability;

    const bEvidenceId = baseline.evidence.find(
      (e) => e.claim_key?.toLowerCase().includes('avail') || e.claim_key?.toLowerCase().includes('stock')
    )?.id ?? baseline.evidence[0]?.id ?? null;

    const cEvidenceId = current.evidence.find(
      (e) => e.claim_key?.toLowerCase().includes('avail') || e.claim_key?.toLowerCase().includes('stock')
    )?.id ?? current.evidence[0]?.id ?? null;

    if (bAvail !== cAvail) {
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId,
        candidateTitle,
        canonicalUrl,
        fieldName: 'availability',
        changeType: ChangeType.STOCK_STATUS_CHANGE,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'STOCK_STATUS_CHANGED',
        previousValue: bAvail,
        newValue: cAvail,
        percentageDelta: null,
        evidenceId: cEvidenceId,
        baselineEvidenceId: bEvidenceId,
        isSupported: true,
        explanation: `Availability changed from ${bAvail} to ${cAvail}.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          candidateId,
          'availability',
          ChangeType.STOCK_STATUS_CHANGE
        ),
      });
    } else if (includeUnchanged) {
      changes.push({
        taskId: scope.taskId,
        scheduleId: scope.scheduleId,
        userId: scope.userId,
        previousRunId: scope.baselineRunId,
        currentRunId: scope.currentRunId,
        candidateId,
        candidateTitle,
        canonicalUrl,
        fieldName: 'availability',
        changeType: ChangeType.UNCHANGED,
        changeStatus: ChangeStatus.SUPPORTED,
        reasonCode: 'VALUE_EQUIVALENT_AFTER_NORMALIZATION',
        previousValue: bAvail,
        newValue: cAvail,
        percentageDelta: null,
        evidenceId: cEvidenceId,
        baselineEvidenceId: bEvidenceId,
        isSupported: true,
        explanation: `Availability unchanged at ${cAvail}.`,
        idempotencyKey: this.generateIdempotencyKey(
          scope.currentRunId,
          scope.baselineRunId,
          candidateId,
          'availability',
          ChangeType.UNCHANGED
        ),
      });
    }
  }

  private compareSpecifications(
    baseline: NonNullable<CandidateMatchPair['baseline']>,
    current: NonNullable<CandidateMatchPair['current']>,
    scope: ComparisonScope,
    candidateId: string,
    candidateTitle: string,
    canonicalUrl: string,
    includeUnchanged: boolean,
    changes: DetectedChange[]
  ): void {
    const bSpecs = baseline.candidate.specifications ?? {};
    const cSpecs = current.candidate.specifications ?? {};

    const allKeys = new Set([...Object.keys(bSpecs), ...Object.keys(cSpecs)]);

    for (const key of allKeys) {
      const bHas = Object.prototype.hasOwnProperty.call(bSpecs, key);
      const cHas = Object.prototype.hasOwnProperty.call(cSpecs, key);

      const bVal = bHas ? String(bSpecs[key]) : undefined;
      const cVal = cHas ? String(cSpecs[key]) : undefined;

      const bEvidenceId = baseline.evidence.find(
        (e) => e.claim_key?.toLowerCase() === key.toLowerCase()
      )?.id ?? null;

      const cEvidenceId = current.evidence.find(
        (e) => e.claim_key?.toLowerCase() === key.toLowerCase()
      )?.id ?? null;

      if (bHas && !cHas) {
        changes.push({
          taskId: scope.taskId,
          scheduleId: scope.scheduleId,
          userId: scope.userId,
          previousRunId: scope.baselineRunId,
          currentRunId: scope.currentRunId,
          candidateId,
          candidateTitle,
          canonicalUrl,
          fieldName: `spec:${key}`,
          changeType: ChangeType.NO_LONGER_OBSERVED,
          changeStatus: ChangeStatus.SUPPORTED,
          reasonCode: 'ATTRIBUTE_NO_LONGER_OBSERVED',
          previousValue: bVal!,
          newValue: 'NO_LONGER_OBSERVED',
          percentageDelta: null,
          evidenceId: null,
          baselineEvidenceId: bEvidenceId,
          isSupported: true,
          explanation: `Specification "${key}" was not observed in current run.`,
          idempotencyKey: this.generateIdempotencyKey(
            scope.currentRunId,
            scope.baselineRunId,
            candidateId,
            `spec:${key}`,
            ChangeType.NO_LONGER_OBSERVED
          ),
        });
        continue;
      }

      if (!bHas && cHas) {
        changes.push({
          taskId: scope.taskId,
          scheduleId: scope.scheduleId,
          userId: scope.userId,
          previousRunId: scope.baselineRunId,
          currentRunId: scope.currentRunId,
          candidateId,
          candidateTitle,
          canonicalUrl,
          fieldName: `spec:${key}`,
          changeType: ChangeType.ADDED,
          changeStatus: ChangeStatus.SUPPORTED,
          reasonCode: 'ATTRIBUTE_FIRST_OBSERVED',
          previousValue: 'NOT_OBSERVED',
          newValue: cVal!,
          percentageDelta: null,
          evidenceId: cEvidenceId,
          baselineEvidenceId: null,
          isSupported: true,
          explanation: `Specification "${key}" observed for the first time with value "${cVal}".`,
          idempotencyKey: this.generateIdempotencyKey(
            scope.currentRunId,
            scope.baselineRunId,
            candidateId,
            `spec:${key}`,
            ChangeType.ADDED
          ),
        });
        continue;
      }

      // Both have the specification key -> normalize and compare
      const bMeas = parseMeasurement(bVal!);
      const cMeas = parseMeasurement(cVal!);

      if (bMeas && cMeas) {
        if (bMeas.dimension !== cMeas.dimension) {
          changes.push({
            taskId: scope.taskId,
            scheduleId: scope.scheduleId,
            userId: scope.userId,
            previousRunId: scope.baselineRunId,
            currentRunId: scope.currentRunId,
            candidateId,
            candidateTitle,
            canonicalUrl,
            fieldName: `spec:${key}`,
            changeType: ChangeType.NOT_COMPARABLE,
            changeStatus: ChangeStatus.NOT_COMPARABLE,
            reasonCode: 'UNIT_NOT_COMPARABLE',
            previousValue: bVal!,
            newValue: cVal!,
            percentageDelta: null,
            evidenceId: cEvidenceId,
            baselineEvidenceId: bEvidenceId,
            isSupported: false,
            explanation: `Dimensions for "${key}" do not match (${bMeas.dimension} vs ${cMeas.dimension}); values are not comparable.`,
            idempotencyKey: this.generateIdempotencyKey(
              scope.currentRunId,
              scope.baselineRunId,
              candidateId,
              `spec:${key}`,
              ChangeType.NOT_COMPARABLE
            ),
          });
          continue;
        }

        // Same dimension -> compare canonical magnitudes
        const diff = Math.abs(bMeas.magnitude - cMeas.magnitude);
        if (diff < 1e-6) {
          if (includeUnchanged) {
            changes.push({
              taskId: scope.taskId,
              scheduleId: scope.scheduleId,
              userId: scope.userId,
              previousRunId: scope.baselineRunId,
              currentRunId: scope.currentRunId,
              candidateId,
              candidateTitle,
              canonicalUrl,
              fieldName: `spec:${key}`,
              changeType: ChangeType.UNCHANGED,
              changeStatus: ChangeStatus.SUPPORTED,
              reasonCode: 'VALUE_EQUIVALENT_AFTER_NORMALIZATION',
              previousValue: bVal!,
              newValue: cVal!,
              percentageDelta: 0,
              evidenceId: cEvidenceId,
              baselineEvidenceId: bEvidenceId,
              isSupported: true,
              explanation: `Specification "${key}" is equivalent after normalization (${bMeas.magnitude} ${bMeas.canonicalUnit}).`,
              idempotencyKey: this.generateIdempotencyKey(
                scope.currentRunId,
                scope.baselineRunId,
                candidateId,
                `spec:${key}`,
                ChangeType.UNCHANGED
              ),
            });
          }
          continue;
        }

        // Magnitudes differ
        const pctDelta =
          bMeas.magnitude !== 0
            ? Math.round(((cMeas.magnitude - bMeas.magnitude) / bMeas.magnitude) * 10000) / 100
            : null;

        changes.push({
          taskId: scope.taskId,
          scheduleId: scope.scheduleId,
          userId: scope.userId,
          previousRunId: scope.baselineRunId,
          currentRunId: scope.currentRunId,
          candidateId,
          candidateTitle,
          canonicalUrl,
          fieldName: `spec:${key}`,
          changeType: ChangeType.SPECIFICATION_UPDATE,
          changeStatus: ChangeStatus.SUPPORTED,
          reasonCode: 'SPECIFICATION_UPDATED',
          previousValue: bVal!,
          newValue: cVal!,
          percentageDelta: pctDelta,
          evidenceId: cEvidenceId,
          baselineEvidenceId: bEvidenceId,
          isSupported: true,
          explanation: `Specification "${key}" changed from ${bVal} to ${cVal}.`,
          idempotencyKey: this.generateIdempotencyKey(
            scope.currentRunId,
            scope.baselineRunId,
            candidateId,
            `spec:${key}`,
            ChangeType.SPECIFICATION_UPDATE
          ),
        });
        continue;
      }

      // Non-measurement raw string comparison
      if (bVal!.trim().toLowerCase() === cVal!.trim().toLowerCase()) {
        if (includeUnchanged) {
          changes.push({
            taskId: scope.taskId,
            scheduleId: scope.scheduleId,
            userId: scope.userId,
            previousRunId: scope.baselineRunId,
            currentRunId: scope.currentRunId,
            candidateId,
            candidateTitle,
            canonicalUrl,
            fieldName: `spec:${key}`,
            changeType: ChangeType.UNCHANGED,
            changeStatus: ChangeStatus.SUPPORTED,
            reasonCode: 'VALUE_EQUIVALENT_AFTER_NORMALIZATION',
            previousValue: bVal!,
            newValue: cVal!,
            percentageDelta: null,
            evidenceId: cEvidenceId,
            baselineEvidenceId: bEvidenceId,
            isSupported: true,
            explanation: `Specification "${key}" unchanged at "${cVal}".`,
            idempotencyKey: this.generateIdempotencyKey(
              scope.currentRunId,
              scope.baselineRunId,
              candidateId,
              `spec:${key}`,
              ChangeType.UNCHANGED
            ),
          });
        }
      } else {
        changes.push({
          taskId: scope.taskId,
          scheduleId: scope.scheduleId,
          userId: scope.userId,
          previousRunId: scope.baselineRunId,
          currentRunId: scope.currentRunId,
          candidateId,
          candidateTitle,
          canonicalUrl,
          fieldName: `spec:${key}`,
          changeType: ChangeType.SPECIFICATION_UPDATE,
          changeStatus: ChangeStatus.SUPPORTED,
          reasonCode: 'SPECIFICATION_UPDATED',
          previousValue: bVal!,
          newValue: cVal!,
          percentageDelta: null,
          evidenceId: cEvidenceId,
          baselineEvidenceId: bEvidenceId,
          isSupported: true,
          explanation: `Specification "${key}" changed from "${bVal}" to "${cVal}".`,
          idempotencyKey: this.generateIdempotencyKey(
            scope.currentRunId,
            scope.baselineRunId,
            candidateId,
            `spec:${key}`,
            ChangeType.SPECIFICATION_UPDATE
          ),
        });
      }
    }
  }
}

