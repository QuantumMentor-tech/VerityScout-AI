import 'server-only';
import type { ConstraintOperator } from '@/server/research/planner/contracts';
import type { EvaluationReasonCode, EvaluationState } from '../contracts';

export interface NumericComparisonInput {
  readonly operator: ConstraintOperator;
  readonly target: number | readonly [number, number];
  readonly actual: number;
  readonly isApproximate?: boolean | undefined;
  readonly isRange?: boolean | undefined;
  readonly rangeMin?: number | undefined;
  readonly rangeMax?: number | undefined;
  readonly unit?: string | undefined;
}

export interface NumericComparisonResult {
  readonly state: EvaluationState;
  readonly reasonCode: EvaluationReasonCode;
  readonly explanation: string;
}

const EPSILON = 1e-6;

/**
 * Deterministic decimal-safe numeric comparison respecting operators, ranges,
 * and explicit approximation policies.
 */
export function compareNumeric(input: NumericComparisonInput): NumericComparisonResult {
  const { operator, target, actual, isApproximate, isRange, rangeMin, rangeMax, unit } = input;
  const unitSuffix = unit ? ` ${unit}` : '';

  // 1. Handle Evidence Ranges
  if (isRange && rangeMin !== undefined && rangeMax !== undefined) {
    if (operator === 'LTE') {
      const targetVal = typeof target === 'number' ? target : target[0];
      if (rangeMax <= targetVal + EPSILON) {
        return {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} is completely at or below the required maximum of ${targetVal}${unitSuffix}.`,
        };
      }
      if (rangeMin > targetVal + EPSILON) {
        return {
          state: 'VIOLATED',
          reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
          explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} exceeds the required maximum of ${targetVal}${unitSuffix}.`,
        };
      }
      // Range straddles the upper bound
      return {
        state: 'VIOLATED',
        reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
        explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} partially exceeds the required maximum of ${targetVal}${unitSuffix} (upper bound is higher).`,
      };
    }

    if (operator === 'GTE') {
      const targetVal = typeof target === 'number' ? target : target[0];
      if (rangeMin >= targetVal - EPSILON) {
        return {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} is completely at or above the required minimum of ${targetVal}${unitSuffix}.`,
        };
      }
      if (rangeMax < targetVal - EPSILON) {
        return {
          state: 'VIOLATED',
          reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
          explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} is below the required minimum of ${targetVal}${unitSuffix}.`,
        };
      }
      // Range straddles the lower bound
      return {
        state: 'VIOLATED',
        reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
        explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} partially falls below the required minimum of ${targetVal}${unitSuffix} (lower bound is lower).`,
      };
    }

    if (operator === 'BETWEEN' && Array.isArray(target) && target.length === 2) {
      const [low, high] = target as readonly [number, number];
      if (rangeMin >= low - EPSILON && rangeMax <= high + EPSILON) {
        return {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} is completely within the required range of ${low}-${high}${unitSuffix}.`,
        };
      }
      return {
        state: 'VIOLATED',
        reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
        explanation: `Evidence range ${rangeMin}-${rangeMax}${unitSuffix} extends outside the required range of ${low}-${high}${unitSuffix}.`,
      };
    }

    if (operator === 'EQ') {
      return {
        state: 'VIOLATED',
        reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
        explanation: `Evidence is a range (${rangeMin}-${rangeMax}${unitSuffix}) and does not satisfy the exact scalar requirement of ${target}${unitSuffix}.`,
      };
    }
  }

  // 2. Handle Approximate Evidence
  if (isApproximate) {
    if (operator === 'LTE' && typeof target === 'number') {
      const diff = actual - target;
      // If within 1% of the threshold boundary, uncertainty precludes definitive satisfaction
      if (Math.abs(diff) / (target || 1) <= 0.01) {
        return {
          state: 'UNKNOWN',
          reasonCode: 'APPROXIMATE_VALUE_UNCERTAIN',
          explanation: `Evidence is approximate (~${actual}${unitSuffix}) and lies directly on the threshold boundary of ${target}${unitSuffix}, preventing definitive evaluation.`,
        };
      }
      if (actual < target) {
        return {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Approximate evidence (~${actual}${unitSuffix}) is safely below the maximum limit of ${target}${unitSuffix}.`,
        };
      }
      return {
        state: 'VIOLATED',
        reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
        explanation: `Approximate evidence (~${actual}${unitSuffix}) exceeds the maximum limit of ${target}${unitSuffix}.`,
      };
    }

    if (operator === 'GTE' && typeof target === 'number') {
      const diff = target - actual;
      if (Math.abs(diff) / (target || 1) <= 0.01) {
        return {
          state: 'UNKNOWN',
          reasonCode: 'APPROXIMATE_VALUE_UNCERTAIN',
          explanation: `Evidence is approximate (~${actual}${unitSuffix}) and lies directly on the threshold boundary of ${target}${unitSuffix}, preventing definitive evaluation.`,
        };
      }
      if (actual > target) {
        return {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Approximate evidence (~${actual}${unitSuffix}) is safely above the minimum limit of ${target}${unitSuffix}.`,
        };
      }
      return {
        state: 'VIOLATED',
        reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
        explanation: `Approximate evidence (~${actual}${unitSuffix}) falls below the minimum limit of ${target}${unitSuffix}.`,
      };
    }
  }

  // 3. Exact Scalar Evaluations
  if (operator === 'EQ') {
    if (typeof target !== 'number') {
      return {
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: `Operator EQ expects a single numeric target value.`,
      };
    }
    const isEq = Math.abs(actual - target) < EPSILON;
    return isEq
      ? {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} equals the required value of ${target}${unitSuffix}.`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} does not equal the required value of ${target}${unitSuffix}.`,
        };
  }

  if (operator === 'LTE') {
    if (typeof target !== 'number') {
      return {
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: `Operator LTE expects a single numeric target value.`,
      };
    }
    const isLte = actual <= target + EPSILON;
    return isLte
      ? {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} is at or below the required maximum of ${target}${unitSuffix}.`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} exceeds the required maximum of ${target}${unitSuffix}.`,
        };
  }

  if (operator === 'GTE') {
    if (typeof target !== 'number') {
      return {
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: `Operator GTE expects a single numeric target value.`,
      };
    }
    const isGte = actual >= target - EPSILON;
    return isGte
      ? {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} is at or above the required minimum of ${target}${unitSuffix}.`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} is below the required minimum of ${target}${unitSuffix}.`,
        };
  }

  if (operator === 'BETWEEN') {
    if (!Array.isArray(target) || target.length !== 2) {
      return {
        state: 'INVALID_CONSTRAINT',
        reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
        explanation: `Operator BETWEEN expects a tuple [min, max] target value.`,
      };
    }
    const [low, high] = target as readonly [number, number];
    const isBetween = actual >= low - EPSILON && actual <= high + EPSILON;
    return isBetween
      ? {
          state: 'SATISFIED',
          reasonCode: 'VALUE_WITHIN_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} is within the required range of ${low} to ${high}${unitSuffix}.`,
        }
      : {
          state: 'VIOLATED',
          reasonCode: 'VALUE_OUTSIDE_ALLOWED_BOUND',
          explanation: `Value ${actual}${unitSuffix} is outside the required range of ${low} to ${high}${unitSuffix}.`,
        };
  }

  return {
    state: 'NOT_COMPARABLE',
    reasonCode: 'UNSUPPORTED_COMPARATOR',
    explanation: `Operator ${operator} is not supported for numeric evaluation.`,
  };
}
