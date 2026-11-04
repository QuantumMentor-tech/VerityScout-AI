import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NormalizedConstraint } from '@/server/research/planner/contracts';
import {
  EVALUATION_RULESET_VERSION,
  type ConstraintEvaluationRecord,
  type EvaluationContext,
} from './contracts';
import { matchEligibleEvidence } from './evidence-matcher';
import { compareNumeric } from './comparators/numeric-comparator';
import { compareMonetary } from './comparators/monetary-comparator';
import { compareUnits } from './comparators/unit-comparator';
import { compareCategorical } from './comparators/categorical-comparator';
import { compareExclusion } from './comparators/exclusion-comparator';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type {
  ComparableAttribute,
  NormalizedAttribute,
} from '@/server/normalization/contracts';

/**
 * Evaluates a single user constraint against eligible evidence for a candidate.
 */
export function evaluateConstraint(
  constraint: NormalizedConstraint,
  context: EvaluationContext,
  allClaims: readonly ExtractedClaim[],
  allNormalized: readonly NormalizedAttribute[],
  allComparable: readonly ComparableAttribute[],
): ConstraintEvaluationRecord {
  const recordId = `eval_${randomUUID()}`;
  const now = new Date().toISOString();

  // Base record template
  const baseRecord: Omit<
    ConstraintEvaluationRecord,
    'state' | 'reasonCode' | 'explanation' | 'evidenceReferences'
  > = {
    id: recordId,
    constraintId: constraint.id,
    constraintKey: constraint.key,
    constraintType: constraint.type,
    constraintPriority: constraint.priority,
    operator: constraint.operator,
    targetValue: constraint.normalizedValue,
    targetUnitOrCurrency: constraint.unitOrCurrency,
    isApproximate: false,
    isRange: false,
    evaluatedAt: now,
    rulesetVersion: EVALUATION_RULESET_VERSION,
  };

  // 1. Handle Exclusions (EXCLUDED priority or EXCLUDED_KEYWORD/DOMAIN type)
  if (
    constraint.priority === 'EXCLUDED' ||
    constraint.type === 'EXCLUDED_KEYWORD' ||
    constraint.type === 'EXCLUDED_DOMAIN'
  ) {
    const candidateCondition = allComparable.find((c) => c.condition)?.condition;
    const exclusionResult = compareExclusion({
      constraintKey: constraint.key,
      excludedTarget: constraint.normalizedValue as string | readonly string[],
      candidateTitle: context.candidateTitle,
      canonicalUrl: context.canonicalUrl,
      sellerOrDomain: context.sellerOrDomain,
      candidateCondition,
    });

    return {
      ...baseRecord,
      state: exclusionResult.state,
      reasonCode: exclusionResult.reasonCode,
      explanation: exclusionResult.explanation,
      evidenceReferences: [],
    };
  }

  // 2. Match Eligible Evidence & Detect Conflicts
  const evidenceBundle = matchEligibleEvidence(
    constraint.key,
    context,
    allClaims,
    allNormalized,
    allComparable,
  );

  // If material contradiction is detected across eligible claims, report CONFLICTING_EVIDENCE (AC-07)
  if (evidenceBundle.isConflicting) {
    return {
      ...baseRecord,
      state: 'CONFLICTING_EVIDENCE',
      reasonCode: 'CONFLICTING_ELIGIBLE_CLAIMS',
      explanation:
        evidenceBundle.conflictExplanation ??
        `Materially conflicting evidence detected for constraint "${constraint.key}".`,
      evidenceReferences: evidenceBundle.evidenceReferences,
    };
  }

  // 3. Handle Missing Evidence (AC-06)
  if (
    evidenceBundle.matchingClaims.length === 0 &&
    evidenceBundle.matchingNormalized.length === 0 &&
    !evidenceBundle.matchingComparable
  ) {
    return {
      ...baseRecord,
      state: 'UNKNOWN',
      reasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
      explanation: `No evidence found in candidate sources regarding "${constraint.key}".`,
      evidenceReferences: [],
    };
  }

  const primaryNormalized = evidenceBundle.matchingNormalized[0];
  const comparable = evidenceBundle.matchingComparable;

  // 4. PRICE / MONETARY Evaluation
  if (
    constraint.type === 'PRICE_CEILING' ||
    constraint.type === 'PRICE_FLOOR' ||
    constraint.key.toLowerCase().includes('price') ||
    constraint.key.toLowerCase().includes('budget')
  ) {
    const targetAmt =
      typeof constraint.normalizedValue === 'number'
        ? constraint.normalizedValue
        : parseFloat(String(constraint.normalizedValue));

    if (isNaN(targetAmt)) {
      return {
        ...baseRecord,
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: `Target price value "${constraint.normalizedValue}" is not a valid number.`,
        evidenceReferences: evidenceBundle.evidenceReferences,
      };
    }

    const monetaryResult = compareMonetary({
      operator: constraint.operator,
      targetAmount: targetAmt,
      targetCurrency: constraint.unitOrCurrency,
      evidenceMonetary: primaryNormalized?.monetaryValue,
      evidenceAmount: comparable?.numericValue,
      evidenceCurrency: comparable?.currency ?? primaryNormalized?.monetaryValue?.currency,
      evidenceBillingInterval: primaryNormalized?.monetaryValue?.billingInterval,
    });

    return {
      ...baseRecord,
      state: monetaryResult.state,
      reasonCode: monetaryResult.reasonCode,
      explanation: monetaryResult.explanation,
      evidenceReferences: evidenceBundle.evidenceReferences,
      actualComparableValue: comparable?.decimalString ?? comparable?.numericValue,
      actualUnitOrCurrency: comparable?.currency ?? comparable?.unit,
      isApproximate: comparable?.isApproximate ?? false,
      isRange: comparable?.isRange ?? false,
    };
  }

  // 5. PHYSICAL MEASUREMENT / UNIT Evaluation
  if (
    constraint.type === 'SPECIFICATION' &&
    constraint.unitOrCurrency &&
    (primaryNormalized?.measurementValue || comparable?.unit)
  ) {
    const targetMag =
      typeof constraint.normalizedValue === 'number'
        ? constraint.normalizedValue
        : parseFloat(String(constraint.normalizedValue));

    if (isNaN(targetMag)) {
      return {
        ...baseRecord,
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: `Target specification value "${constraint.normalizedValue}" is not a valid number.`,
        evidenceReferences: evidenceBundle.evidenceReferences,
      };
    }

    const unitResult = compareUnits({
      operator: constraint.operator,
      targetMagnitude: targetMag,
      targetUnit: constraint.unitOrCurrency,
      evidenceMeasurement: primaryNormalized?.measurementValue,
      evidenceMagnitude: comparable?.numericValue,
      evidenceUnit: comparable?.unit,
    });

    return {
      ...baseRecord,
      state: unitResult.state,
      reasonCode: unitResult.reasonCode,
      explanation: unitResult.explanation,
      evidenceReferences: evidenceBundle.evidenceReferences,
      actualComparableValue: comparable?.numericValue,
      actualUnitOrCurrency: comparable?.unit,
      isApproximate: comparable?.isApproximate ?? false,
      isRange: comparable?.isRange ?? false,
    };
  }

  // 6. NUMERIC Evaluation without specific unit
  if (typeof constraint.normalizedValue === 'number' && typeof comparable?.numericValue === 'number') {
    const numericResult = compareNumeric({
      operator: constraint.operator,
      target: constraint.normalizedValue,
      actual: comparable.numericValue,
      isApproximate: comparable.isApproximate,
      isRange: comparable.isRange,
      rangeMin: comparable.rangeMin,
      rangeMax: comparable.rangeMax,
      unit: comparable.unit,
    });

    return {
      ...baseRecord,
      state: numericResult.state,
      reasonCode: numericResult.reasonCode,
      explanation: numericResult.explanation,
      evidenceReferences: evidenceBundle.evidenceReferences,
      actualComparableValue: comparable.numericValue,
      actualUnitOrCurrency: comparable.unit,
      isApproximate: comparable.isApproximate,
      isRange: comparable.isRange,
    };
  }

  // 7. CATEGORICAL, BRAND, CONDITION & SET MEMBERSHIP
  const actualText =
    comparable?.textValue ??
    primaryNormalized?.identityValue?.brand ??
    primaryNormalized?.identityValue?.cleanTitle ??
    primaryNormalized?.categoricalValue?.standardValue ??
    primaryNormalized?.rawValue;

  const actualCondition =
    comparable?.condition ?? primaryNormalized?.identityValue?.condition;

  const catResult = compareCategorical({
    operator: constraint.operator,
    target: constraint.normalizedValue,
    actual: actualText,
    attributeName: constraint.key,
    actualCondition,
  });

  return {
    ...baseRecord,
    state: catResult.state,
    reasonCode: catResult.reasonCode,
    explanation: catResult.explanation,
    evidenceReferences: evidenceBundle.evidenceReferences,
    actualComparableValue: actualText ?? undefined,
  };
}

