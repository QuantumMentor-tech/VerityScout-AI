import { describe, it, expect } from 'vitest';
import type { NormalizedConstraint } from '@/server/research/planner/contracts';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type {
  ComparableAttribute,
  NormalizedAttribute,
} from '@/server/normalization/contracts';
import { VerificationState } from '@/server/persistence/types';
import {
  compareNumeric,
  compareMonetary,
  compareUnits,
  compareCategorical,
  compareExclusion,
  evaluateConstraint,
  getDefaultEvaluationService,
  formatEvaluationForDb,
  type EvaluationContext,
} from '@/server/evaluation';

describe('Step 38: Deterministic Hard Constraints & Constraint Evaluation Engine', () => {
  const baseContext: EvaluationContext = {
    candidateId: 'cand_123',
    runId: 'run_abc',
    userId: 'user_xyz',
    candidateTitle: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones',
    canonicalUrl: 'https://store.sony.com/wh-1000xm5',
    sellerOrDomain: 'sony.com',
  };

  // ---------------------------------------------------------------------------
  // 1. Numeric Comparator Unit Tests
  // ---------------------------------------------------------------------------
  describe('Numeric Comparator', () => {
    it('EVAL-NUM-001: Evaluates LTE operator immediately below, on, and above boundary', () => {
      // Below boundary
      const below = compareNumeric({ operator: 'LTE', target: 500, actual: 499.99 });
      expect(below.state).toBe('SATISFIED');
      expect(below.reasonCode).toBe('VALUE_WITHIN_ALLOWED_BOUND');

      // Exactly on boundary
      const on = compareNumeric({ operator: 'LTE', target: 500, actual: 500 });
      expect(on.state).toBe('SATISFIED');
      expect(on.reasonCode).toBe('VALUE_WITHIN_ALLOWED_BOUND');

      // Above boundary
      const above = compareNumeric({ operator: 'LTE', target: 500, actual: 500.01 });
      expect(above.state).toBe('VIOLATED');
      expect(above.reasonCode).toBe('VALUE_OUTSIDE_ALLOWED_BOUND');
    });

    it('EVAL-NUM-002: Evaluates GTE operator immediately below, on, and above boundary', () => {
      const below = compareNumeric({ operator: 'GTE', target: 16, actual: 15.99 });
      expect(below.state).toBe('VIOLATED');

      const on = compareNumeric({ operator: 'GTE', target: 16, actual: 16.0 });
      expect(on.state).toBe('SATISFIED');

      const above = compareNumeric({ operator: 'GTE', target: 16, actual: 32 });
      expect(above.state).toBe('SATISFIED');
    });

    it('EVAL-NUM-003: Evaluates BETWEEN operator within, on edges, and outside range', () => {
      const inside = compareNumeric({ operator: 'BETWEEN', target: [10, 20], actual: 15 });
      expect(inside.state).toBe('SATISFIED');

      const lowerEdge = compareNumeric({ operator: 'BETWEEN', target: [10, 20], actual: 10 });
      expect(lowerEdge.state).toBe('SATISFIED');

      const upperEdge = compareNumeric({ operator: 'BETWEEN', target: [10, 20], actual: 20 });
      expect(upperEdge.state).toBe('SATISFIED');

      const outside = compareNumeric({ operator: 'BETWEEN', target: [10, 20], actual: 25 });
      expect(outside.state).toBe('VIOLATED');
    });

    it('EVAL-NUM-004: Handles evidence ranges without reducing to naive midpoint', () => {
      // Range 10-12 satisfies LTE 15
      const res1 = compareNumeric({
        operator: 'LTE',
        target: 15,
        actual: 11,
        isRange: true,
        rangeMin: 10,
        rangeMax: 12,
      });
      expect(res1.state).toBe('SATISFIED');

      // Range 10-15 exceeds LTE 12 (upper bound straddles boundary)
      const res2 = compareNumeric({
        operator: 'LTE',
        target: 12,
        actual: 12.5,
        isRange: true,
        rangeMin: 10,
        rangeMax: 15,
      });
      expect(res2.state).toBe('VIOLATED');
      expect(res2.reasonCode).toBe('VALUE_OUTSIDE_ALLOWED_BOUND');
      expect(res2.explanation).toContain('partially exceeds the required maximum');
    });

    it('EVAL-NUM-005: Preserves approximation uncertainty near boundaries', () => {
      // Approximate value right on boundary is uncertain
      const uncertain = compareNumeric({
        operator: 'LTE',
        target: 1.5,
        actual: 1.5,
        isApproximate: true,
      });
      expect(uncertain.state).toBe('UNKNOWN');
      expect(uncertain.reasonCode).toBe('APPROXIMATE_VALUE_UNCERTAIN');

      // Approximate value safely below boundary satisfies
      const safe = compareNumeric({
        operator: 'LTE',
        target: 1.5,
        actual: 1.2,
        isApproximate: true,
      });
      expect(safe.state).toBe('SATISFIED');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Monetary Comparator & Currency Isolation
  // ---------------------------------------------------------------------------
  describe('Monetary Comparator', () => {
    it('EVAL-MON-001: Evaluates compatible currencies within budget', () => {
      const res = compareMonetary({
        operator: 'LTE',
        targetAmount: 1000,
        targetCurrency: 'USD',
        evidenceAmount: 899.99,
        evidenceCurrency: 'USD',
      });
      expect(res.state).toBe('SATISFIED');
      expect(res.reasonCode).toBe('VALUE_WITHIN_ALLOWED_BOUND');
    });

    it('EVAL-MON-002: Rejects cross-currency comparisons with zero conversion', () => {
      const res = compareMonetary({
        operator: 'LTE',
        targetAmount: 1000,
        targetCurrency: 'USD',
        evidenceAmount: 899.99,
        evidenceCurrency: 'EUR',
      });
      expect(res.state).toBe('NOT_COMPARABLE');
      expect(res.reasonCode).toBe('CURRENCY_MISMATCH');
      expect(res.explanation).toContain('Cross-currency comparison between USD and EUR is strictly prohibited');
    });

    it('EVAL-MON-003: Rejects ambiguous currency symbols (null code)', () => {
      const res = compareMonetary({
        operator: 'LTE',
        targetAmount: 500,
        targetCurrency: 'USD',
        evidenceAmount: 450,
        evidenceCurrency: null, // bare '$' from source
      });
      expect(res.state).toBe('NOT_COMPARABLE');
      expect(res.reasonCode).toBe('CURRENCY_UNRESOLVED');
    });

    it('EVAL-MON-004: Rejects monthly subscription price against one-time budget', () => {
      const res = compareMonetary({
        operator: 'LTE',
        targetAmount: 100,
        targetCurrency: 'USD',
        evidenceAmount: 15,
        evidenceCurrency: 'USD',
        evidenceBillingInterval: 'MONTHLY',
      });
      expect(res.state).toBe('NOT_COMPARABLE');
      expect(res.reasonCode).toBe('PRICE_SEMANTICS_INCOMPATIBLE');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Physical Unit & Dimension Compatibility
  // ---------------------------------------------------------------------------
  describe('Physical Unit Comparator', () => {
    it('EVAL-UNIT-001: Converts compatible physical units to canonical dimension (1400g vs 1.5kg)', () => {
      const res = compareUnits({
        operator: 'LTE',
        targetMagnitude: 1.5,
        targetUnit: 'kg',
        evidenceMagnitude: 1400,
        evidenceUnit: 'g',
      });
      expect(res.state).toBe('SATISFIED');
      expect(res.reasonCode).toBe('VALUE_WITHIN_ALLOWED_BOUND');
    });

    it('EVAL-UNIT-002: Strictly rejects cross-dimensional conversions (MASS vs LENGTH)', () => {
      const res = compareUnits({
        operator: 'LTE',
        targetMagnitude: 5,
        targetUnit: 'kg',
        evidenceMagnitude: 120,
        evidenceUnit: 'cm',
      });
      expect(res.state).toBe('NOT_COMPARABLE');
      expect(res.reasonCode).toBe('INCOMPATIBLE_MEASUREMENT_DIMENSION');
      expect(res.explanation).toContain('Cross-dimensional comparison rejected');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Categorical, Condition & Exclusion Comparators
  // ---------------------------------------------------------------------------
  describe('Categorical & Exclusion Comparators', () => {
    it('EVAL-CAT-001: Evaluates product condition matching', () => {
      const newMatch = compareCategorical({
        operator: 'EQ',
        target: 'NEW',
        actualCondition: 'NEW',
      });
      expect(newMatch.state).toBe('SATISFIED');

      const refMismatch = compareCategorical({
        operator: 'EQ',
        target: 'NEW',
        actualCondition: 'REFURBISHED',
      });
      expect(refMismatch.state).toBe('VIOLATED');

      const unknownCond = compareCategorical({
        operator: 'EQ',
        target: 'NEW',
        actualCondition: 'UNKNOWN',
      });
      expect(unknownCond.state).toBe('UNKNOWN');
    });

    it('EVAL-CAT-002: Evaluates set membership (IN and NOT_IN)', () => {
      const inSet = compareCategorical({
        operator: 'IN',
        target: ['Black', 'Silver', 'White'],
        actual: 'Silver',
      });
      expect(inSet.state).toBe('SATISFIED');

      const notInSet = compareCategorical({
        operator: 'IN',
        target: ['Black', 'Silver'],
        actual: 'Blue',
      });
      expect(notInSet.state).toBe('VIOLATED');
    });

    it('EVAL-EXCL-001: Identifies excluded conditions (e.g. no refurbished)', () => {
      const refViolation = compareExclusion({
        constraintKey: 'condition',
        excludedTarget: 'refurbished',
        candidateTitle: 'Sony WH-1000XM5',
        canonicalUrl: 'https://sony.com',
        sellerOrDomain: 'sony.com',
        candidateCondition: 'REFURBISHED',
      });
      expect(refViolation.state).toBe('VIOLATED');
      expect(refViolation.reasonCode).toBe('EXPLICIT_EXCLUSION_VIOLATED');

      const newPass = compareExclusion({
        constraintKey: 'condition',
        excludedTarget: 'refurbished',
        candidateTitle: 'Sony WH-1000XM5',
        canonicalUrl: 'https://sony.com',
        sellerOrDomain: 'sony.com',
        candidateCondition: 'NEW',
      });
      expect(newPass.state).toBe('SATISFIED');
      expect(newPass.reasonCode).toBe('EXCLUSION_SATISFIED');
    });

    it('EVAL-EXCL-002: Identifies excluded keywords and domains', () => {
      const domainViolation = compareExclusion({
        constraintKey: 'excluded_domain',
        excludedTarget: 'ebay.com',
        candidateTitle: 'Sony WH-1000XM5',
        canonicalUrl: 'https://www.ebay.com/itm/123456',
        sellerOrDomain: 'ebay.com',
      });
      expect(domainViolation.state).toBe('VIOLATED');

      const kwViolation = compareExclusion({
        constraintKey: 'excluded_keyword',
        excludedTarget: 'renewed',
        candidateTitle: 'Sony WH-1000XM5 Renewed Edition',
        canonicalUrl: 'https://sony.com',
        sellerOrDomain: 'sony.com',
      });
      expect(kwViolation.state).toBe('VIOLATED');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Evidence Matching, Provenance & Conflict Preservation
  // ---------------------------------------------------------------------------
  describe('Evidence Matching & Conflict Preservation', () => {
    it('EVAL-EVID-001: Returns UNKNOWN for missing attribute evidence without assuming false or zero', () => {
      const missingConstraint: NormalizedConstraint = {
        id: 'c_waterproof',
        type: 'SPECIFICATION',
        priority: 'REQUIRED',
        key: 'waterproof_rating',
        operator: 'EQ',
        rawValue: 'IPX7',
        normalizedValue: 'IPX7',
        provenance: 'EXPLICIT_USER',
      };

      const evalRecord = evaluateConstraint(missingConstraint, baseContext, [], [], []);
      expect(evalRecord.state).toBe('UNKNOWN');
      expect(evalRecord.reasonCode).toBe('ATTRIBUTE_EVIDENCE_MISSING');
      expect(evalRecord.evidenceReferences.length).toBe(0);
    });

    it('EVAL-EVID-002: Preserves multi-claim contradictions as CONFLICTING_EVIDENCE without winner selection', () => {
      const priceConstraint: NormalizedConstraint = {
        id: 'c_price',
        type: 'PRICE_CEILING',
        priority: 'REQUIRED',
        key: 'price',
        operator: 'LTE',
        rawValue: '$1000',
        normalizedValue: 1000,
        unitOrCurrency: 'USD',
        provenance: 'EXPLICIT_USER',
      };

      const conflictingNormalized: NormalizedAttribute[] = [
        {
          id: 'norm_1',
          claimId: 'claim_1',
          sourceDocumentId: 'doc_1',
          runId: 'run_abc',
          userId: 'user_xyz',
          attributeKey: 'price',
          rawValue: '$799.00',
          attributeType: 'MONETARY',
          status: 'NORMALIZED',
          monetaryValue: {
            rawText: '$799.00',
            amount: '799.00',
            currency: 'USD',
            currencySymbol: '$',
            priceType: 'CURRENT',
            qualifiers: [],
            isApproximate: false,
            isRange: false,
          },
          qualifiers: [],
          evidenceQuote: 'Sale price: $799.00',
          charOffsets: { start: 10, end: 20 },
          normalizedAt: new Date().toISOString(),
          rulesetVersion: 'v1.0',
        },
        {
          id: 'norm_2',
          claimId: 'claim_2',
          sourceDocumentId: 'doc_2',
          runId: 'run_abc',
          userId: 'user_xyz',
          attributeKey: 'price',
          rawValue: '$1,299.00',
          attributeType: 'MONETARY',
          status: 'NORMALIZED',
          monetaryValue: {
            rawText: '$1,299.00',
            amount: '1299.00',
            currency: 'USD',
            currencySymbol: '$',
            priceType: 'CURRENT',
            qualifiers: [],
            isApproximate: false,
            isRange: false,
          },
          qualifiers: [],
          evidenceQuote: 'Regular price: $1,299.00',
          charOffsets: { start: 5, end: 25 },
          normalizedAt: new Date().toISOString(),
          rulesetVersion: 'v1.0',
        },
      ];

      const claims: ExtractedClaim[] = [
        {
          id: 'claim_1',
          runId: 'run_abc',
          sourceDocumentId: 'doc_1',
          userId: 'user_xyz',
          subject: 'Headphones',
          claimKey: 'price',
          extractedRawValue: '$799.00',
          claimType: 'PRICE',
          polarity: 'POSITIVE',
          qualifiers: [],
          evidence: {
            verbatimQuote: 'Sale price: $799.00',
            charOffsetStart: 10,
            charOffsetEnd: 20,
            groundingStatus: 'GROUNDED_EXACT',
            confidenceScore: 0.95,
          },
          extractionStatus: 'EXPLICIT',
          extractionMethod: 'REGEX_DETERMINISTIC',
          verificationState: VerificationState.SUPPORTED,
          extractedAt: new Date().toISOString(),
        },
        {
          id: 'claim_2',
          runId: 'run_abc',
          sourceDocumentId: 'doc_2',
          userId: 'user_xyz',
          subject: 'Headphones',
          claimKey: 'price',
          extractedRawValue: '$1,299.00',
          claimType: 'PRICE',
          polarity: 'POSITIVE',
          qualifiers: [],
          evidence: {
            verbatimQuote: 'Regular price: $1,299.00',
            charOffsetStart: 5,
            charOffsetEnd: 25,
            groundingStatus: 'GROUNDED_EXACT',
            confidenceScore: 0.95,
          },
          extractionStatus: 'EXPLICIT',
          extractionMethod: 'REGEX_DETERMINISTIC',
          verificationState: VerificationState.SUPPORTED,
          extractedAt: new Date().toISOString(),
        },
      ];

      const evalRecord = evaluateConstraint(
        priceConstraint,
        baseContext,
        claims,
        conflictingNormalized,
        [],
      );

      expect(evalRecord.state).toBe('CONFLICTING_EVIDENCE');
      expect(evalRecord.reasonCode).toBe('CONFLICTING_ELIGIBLE_CLAIMS');
      // Preserves both conflicting evidence references
      expect(evalRecord.evidenceReferences.length).toBe(2);
      expect(evalRecord.evidenceReferences.map((r) => r.claimId)).toContain('claim_1');
      expect(evalRecord.evidenceReferences.map((r) => r.claimId)).toContain('claim_2');
    });

    it('EVAL-EVID-003: Quarantines cross-user or wrong-run claims (tenant isolation AC-10)', () => {
      const brandConstraint: NormalizedConstraint = {
        id: 'c_brand',
        type: 'BRAND',
        priority: 'REQUIRED',
        key: 'brand',
        operator: 'EQ',
        rawValue: 'Sony',
        normalizedValue: 'Sony',
        provenance: 'EXPLICIT_USER',
      };

      // Attacker's claim belonging to another user
      const crossUserClaim: ExtractedClaim = {
        id: 'claim_attacker',
        runId: 'run_other',
        sourceDocumentId: 'doc_other',
        userId: 'attacker_user_id',
        subject: 'Laptop',
        claimKey: 'brand',
        extractedRawValue: 'Sony',
        claimType: 'PROPERTY',
        polarity: 'POSITIVE',
        qualifiers: [],
        evidence: {
          verbatimQuote: 'Sony',
          charOffsetStart: 0,
          charOffsetEnd: 4,
          groundingStatus: 'GROUNDED_EXACT',
          confidenceScore: 1.0,
        },
        extractionStatus: 'EXPLICIT',
        extractionMethod: 'REGEX_DETERMINISTIC',
        verificationState: VerificationState.SUPPORTED,
        extractedAt: new Date().toISOString(),
      };

      const result = evaluateConstraint(brandConstraint, baseContext, [crossUserClaim], [], []);
      // Should NOT accept cross-user claim
      expect(result.state).toBe('UNKNOWN');
      expect(result.reasonCode).toBe('ATTRIBUTE_EVIDENCE_MISSING');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. End-to-End Candidate Evaluation Service & Provisional Aggregation
  // ---------------------------------------------------------------------------
  describe('ConstraintEvaluationService & Provisional Aggregation', () => {
    const service = getDefaultEvaluationService();

    const mockConstraints: NormalizedConstraint[] = [
      {
        id: 'c1_price',
        type: 'PRICE_CEILING',
        priority: 'REQUIRED',
        key: 'price',
        operator: 'LTE',
        rawValue: '$500',
        normalizedValue: 500,
        unitOrCurrency: 'USD',
        provenance: 'EXPLICIT_USER',
      },
      {
        id: 'c2_battery',
        type: 'SPECIFICATION',
        priority: 'REQUIRED',
        key: 'battery_life',
        operator: 'GTE',
        rawValue: '20 hours',
        normalizedValue: 20,
        unitOrCurrency: 'hours',
        provenance: 'EXPLICIT_USER',
      },
      {
        id: 'c3_excl',
        type: 'CONDITION',
        priority: 'EXCLUDED',
        key: 'condition',
        operator: 'NOT_IN',
        rawValue: 'refurbished',
        normalizedValue: ['refurbished', 'used'],
        provenance: 'EXPLICIT_USER',
      },
      {
        id: 'c4_pref_color',
        type: 'SPECIFICATION',
        priority: 'PREFERRED',
        key: 'color',
        operator: 'EQ',
        rawValue: 'Silver',
        normalizedValue: 'Silver',
        provenance: 'EXPLICIT_USER',
      },
    ];

    const mockComparable: ComparableAttribute[] = [
      {
        key: 'price',
        type: 'MONETARY',
        numericValue: 398.0,
        decimalString: '398.00',
        currency: 'USD',
        unit: '$',
        isRange: false,
        qualifiers: [],
        isApproximate: false,
        confidence: 0.98,
      },
      {
        key: 'battery_life',
        type: 'DIMENSION',
        numericValue: 30,
        unit: 'hours',
        isRange: false,
        qualifiers: [],
        isApproximate: false,
        confidence: 0.95,
      },
      {
        key: 'product_identity',
        type: 'IDENTITY',
        textValue: 'Sony WH-1000XM5',
        condition: 'NEW',
        qualifiers: [],
        isRange: false,
        isApproximate: false,
        confidence: 0.99,
      },
      {
        key: 'color',
        type: 'CATEGORICAL',
        textValue: 'Black',
        isRange: false,
        qualifiers: [],
        isApproximate: false,
        confidence: 0.9,
      },
    ];

    it('EVAL-SVC-001: Aggregates candidate evaluations preserving priority distinctions', () => {
      const summary = service.evaluateCandidate(
        baseContext,
        mockConstraints,
        [],
        [],
        mockComparable,
      );

      expect(summary.candidateId).toBe(baseContext.candidateId);
      expect(summary.runId).toBe(baseContext.runId);
      expect(summary.totalConstraintsEvaluated).toBe(4);

      // Required: Price ($398 <= $500) -> SATISFIED, Battery (30h >= 20h) -> SATISFIED
      expect(summary.requiredSummary.total).toBe(2);
      expect(summary.requiredSummary.satisfied).toBe(2);
      expect(summary.requiredSummary.violated).toBe(0);

      // Excluded: condition is NEW, so exclusion of refurbished is SATISFIED
      expect(summary.excludedSummary.total).toBe(1);
      expect(summary.excludedSummary.satisfied).toBe(1);
      expect(summary.excludedSummary.violated).toBe(0);

      // Preferred: Color is Black vs required Silver -> VIOLATED (does not fail candidate hard constraints)
      expect(summary.preferredSummary.total).toBe(1);
      expect(summary.preferredSummary.satisfied).toBe(0);
      expect(summary.preferredSummary.violated).toBe(1);

      // Total counts
      expect(summary.satisfiedCount).toBe(3);
      expect(summary.violatedCount).toBe(1);

      // Step 39 Guardrail: Summary does not assign final match classification
      expect(summary).not.toHaveProperty('classification');
      expect(summary).not.toHaveProperty('match_classification');
      expect(summary).not.toHaveProperty('isMatch');

      // Database formatting adapter
      const dbFormat = formatEvaluationForDb(summary);
      expect(dbFormat.passedConstraints).toContain('price');
      expect(dbFormat.passedConstraints).toContain('battery_life');
      expect(dbFormat.passedConstraints).toContain('condition');
      expect(dbFormat.failedConstraints).toContain('color');
    });

    it('EVAL-SVC-002: Formulates primaryMismatchReason when a required constraint fails', () => {
      const expensiveComparable: ComparableAttribute[] = [
        {
          ...mockComparable[0]!,
          numericValue: 599.0,
          decimalString: '599.00',
        },
        ...mockComparable.slice(1),
      ];

      const summary = service.evaluateCandidate(
        baseContext,
        mockConstraints,
        [],
        [],
        expensiveComparable,
      );

      expect(summary.requiredSummary.violated).toBe(1);
      expect(summary.primaryMismatchReason).toBeDefined();
      expect(summary.primaryMismatchReason).toContain('exceeds the required maximum of 500 USD');
    });

    it('EVAL-SVC-003: Determinism Guarantee: repeated runs return identical substantive outputs', () => {
      const run1 = service.evaluateCandidate(baseContext, mockConstraints, [], [], mockComparable);
      const run2 = service.evaluateCandidate(baseContext, mockConstraints, [], [], mockComparable);

      expect(run1.satisfiedCount).toBe(run2.satisfiedCount);
      expect(run1.violatedCount).toBe(run2.violatedCount);
      expect(run1.unknownCount).toBe(run2.unknownCount);
      expect(run1.passedConstraintKeys).toEqual(run2.passedConstraintKeys);
      expect(run1.failedConstraintKeys).toEqual(run2.failedConstraintKeys);
      expect(run1.evaluations.map((e) => e.state)).toEqual(run2.evaluations.map((e) => e.state));
      expect(run1.evaluations.map((e) => e.reasonCode)).toEqual(
        run2.evaluations.map((e) => e.reasonCode),
      );
    });
  });
});
