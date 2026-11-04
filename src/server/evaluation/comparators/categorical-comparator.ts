import 'server-only';
import type { ConstraintOperator } from '@/server/research/planner/contracts';
import type { EvaluationReasonCode, EvaluationState } from '../contracts';
import type { ProductCondition } from '@/server/normalization/contracts';

export interface CategoricalComparisonInput {
  readonly operator: ConstraintOperator;
  readonly target: string | number | boolean | readonly string[];
  readonly actual?: string | number | boolean | readonly string[] | null | undefined;
  readonly attributeName?: string | undefined;
  readonly actualCondition?: ProductCondition | undefined;
}

export interface CategoricalComparisonResult {
  readonly state: EvaluationState;
  readonly reasonCode: EvaluationReasonCode;
  readonly explanation: string;
}

function normalizeString(val: string): string {
  return val.trim().toLowerCase();
}

/**
 * Evaluates categorical, boolean, and set-based constraints deterministically.
 */
export function compareCategorical(input: CategoricalComparisonInput): CategoricalComparisonResult {
  const { operator, target, actual, attributeName, actualCondition } = input;
  const attrLabel = attributeName ?? 'Attribute';

  // 1. Missing Evidence Check
  if (actual === undefined || actual === null) {
    if (actualCondition !== undefined && actualCondition !== 'UNKNOWN') {
      // Use condition if target is condition check
    } else {
      return {
        state: 'UNKNOWN',
        reasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
        explanation: `No evidence found for ${attrLabel} in eligible candidate claims.`,
      };
    }
  }

  // 2. Boolean Comparison
  if (typeof target === 'boolean') {
    if (typeof actual !== 'boolean') {
      return {
        state: 'NOT_COMPARABLE',
        reasonCode: 'NORMALIZATION_UNAVAILABLE',
        explanation: `${attrLabel} evidence is not a boolean value.`,
      };
    }
    const matches = operator === 'EQ' ? actual === target : actual !== target;
    return matches
      ? {
          state: 'SATISFIED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_PRESENT',
          explanation: `${attrLabel} is explicitly ${actual}.`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_ABSENT',
          explanation: `${attrLabel} is ${actual}, which does not match required ${target}.`,
        };
  }

  // 3. Condition Comparison
  if (actualCondition && typeof target === 'string') {
    const targetCond = target.toUpperCase();
    if (actualCondition === 'UNKNOWN') {
      return {
        state: 'UNKNOWN',
        reasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
        explanation: `Condition of product cannot be determined from available evidence.`,
      };
    }
    const matches = operator === 'EQ' ? actualCondition === targetCond : actualCondition !== targetCond;
    return matches
      ? {
          state: 'SATISFIED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_PRESENT',
          explanation: `Product condition is confirmed as ${actualCondition}.`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_ABSENT',
          explanation: `Product condition is ${actualCondition}, which does not match required ${targetCond}.`,
        };
  }

  // 4. Set Membership (IN / NOT_IN)
  if (operator === 'IN') {
    if (!Array.isArray(target)) {
      return {
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: 'Operator IN requires a list of allowed values.',
      };
    }
    const actualStr = String(actual);
    const targetSet = target.map((t) => normalizeString(String(t)));
    const isIn = targetSet.includes(normalizeString(actualStr));

    return isIn
      ? {
          state: 'SATISFIED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_PRESENT',
          explanation: `Value "${actualStr}" is in the allowed set [${target.join(', ')}].`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_ABSENT',
          explanation: `Value "${actualStr}" is not in the allowed set [${target.join(', ')}].`,
        };
  }

  if (operator === 'NOT_IN') {
    if (!Array.isArray(target)) {
      return {
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: 'Operator NOT_IN requires a list of excluded values.',
      };
    }
    const actualStr = String(actual);
    const targetSet = target.map((t) => normalizeString(String(t)));
    const isExcluded = targetSet.includes(normalizeString(actualStr));

    return !isExcluded
      ? {
          state: 'SATISFIED',
          reasonCode: 'EXCLUSION_SATISFIED',
          explanation: `Value "${actualStr}" is not in the excluded set [${target.join(', ')}].`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'EXPLICIT_EXCLUSION_VIOLATED',
          explanation: `Value "${actualStr}" is an explicitly excluded value [${target.join(', ')}].`,
        };
  }

  // 5. String Equality (EQ)
  if (operator === 'EQ' && typeof target === 'string') {
    const actualStr = String(actual);
    const isEq = normalizeString(actualStr) === normalizeString(target);
    return isEq
      ? {
          state: 'SATISFIED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_PRESENT',
          explanation: `${attrLabel} matches required value "${target}".`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'EXPLICIT_REQUIRED_FEATURE_ABSENT',
          explanation: `${attrLabel} is "${actualStr}", which does not match required "${target}".`,
        };
  }

  return {
    state: 'NOT_COMPARABLE',
    reasonCode: 'UNSUPPORTED_COMPARATOR',
    explanation: `Operator ${operator} is not supported for categorical evaluation.`,
  };
}
