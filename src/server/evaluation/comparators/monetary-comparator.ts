import 'server-only';
import type { ConstraintOperator } from '@/server/research/planner/contracts';
import type { EvaluationReasonCode, EvaluationState } from '../contracts';
import { compareNumeric } from './numeric-comparator';
import type { MonetaryValue } from '@/server/normalization/contracts';

export interface MonetaryComparisonInput {
  readonly operator: ConstraintOperator;
  readonly targetAmount: number | readonly [number, number];
  readonly targetCurrency?: string | undefined;
  readonly evidenceMonetary?: MonetaryValue | undefined;
  readonly evidenceAmount?: number | undefined;
  readonly evidenceCurrency?: string | null | undefined;
  readonly evidenceBillingInterval?: ('MONTHLY' | 'YEARLY' | 'ONETIME') | undefined;
}

export interface MonetaryComparisonResult {
  readonly state: EvaluationState;
  readonly reasonCode: EvaluationReasonCode;
  readonly explanation: string;
}

/**
 * Deterministic monetary evaluation enforcing strict zero-conversion policies,
 * currency match checks, and billing interval alignment.
 */
export function compareMonetary(input: MonetaryComparisonInput): MonetaryComparisonResult {
  const {
    operator,
    targetAmount,
    targetCurrency,
    evidenceMonetary,
    evidenceAmount,
    evidenceCurrency,
    evidenceBillingInterval,
  } = input;

  const actualAmt = evidenceMonetary ? parseFloat(evidenceMonetary.amount) : evidenceAmount;
  const actualCurr = evidenceMonetary?.currency ?? evidenceCurrency ?? null;

  if (actualAmt === undefined || isNaN(actualAmt)) {
    return {
      state: 'UNKNOWN',
      reasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
      explanation: 'No valid monetary amount found in eligible candidate evidence.',
    };
  }

  // 1. Check Currency Resolvability
  if (!targetCurrency) {
    return {
      state: 'NOT_COMPARABLE',
      reasonCode: 'CURRENCY_UNRESOLVED',
      explanation: 'Constraint does not specify an ISO currency code, preventing safe monetary comparison.',
    };
  }

  if (!actualCurr) {
    return {
      state: 'NOT_COMPARABLE',
      reasonCode: 'CURRENCY_UNRESOLVED',
      explanation: `Evidence amount has an ambiguous or unspecified currency (e.g., bare '$'), preventing safe comparison against ${targetCurrency}.`,
    };
  }

  // 2. Strict Zero-Conversion Enforcement
  if (targetCurrency.toUpperCase() !== actualCurr.toUpperCase()) {
    return {
      state: 'NOT_COMPARABLE',
      reasonCode: 'CURRENCY_MISMATCH',
      explanation: `Cross-currency comparison between ${targetCurrency} and ${actualCurr} is strictly prohibited without authorized live parity.`,
    };
  }

  // 3. Billing Interval Alignment
  if (evidenceBillingInterval && evidenceBillingInterval !== 'ONETIME') {
    return {
      state: 'NOT_COMPARABLE',
      reasonCode: 'PRICE_SEMANTICS_INCOMPATIBLE',
      explanation: `Evidence is a ${evidenceBillingInterval} recurring subscription price, incompatible with a one-time product price constraint.`,
    };
  }

  // 4. Delegate to Decimal-Safe Numeric Comparator
  const numericResult = compareNumeric({
    operator,
    target: targetAmount,
    actual: actualAmt,
    isApproximate: evidenceMonetary?.isApproximate ?? false,
    isRange: evidenceMonetary?.isRange ?? false,
    rangeMin: evidenceMonetary?.rangeMin ? parseFloat(evidenceMonetary.rangeMin) : undefined,
    rangeMax: evidenceMonetary?.rangeMax ? parseFloat(evidenceMonetary.rangeMax) : undefined,
    unit: targetCurrency,
  });

  return numericResult;
}
