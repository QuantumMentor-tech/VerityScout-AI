import 'server-only';
import type { ConstraintOperator } from '@/server/research/planner/contracts';
import type { EvaluationReasonCode, EvaluationState } from '../contracts';
import { compareNumeric } from './numeric-comparator';
import { convertMeasurement, lookupUnitDefinition } from '@/server/normalization/units';
import type { MeasurementValue } from '@/server/normalization/contracts';

export interface UnitComparisonInput {
  readonly operator: ConstraintOperator;
  readonly targetMagnitude: number | readonly [number, number];
  readonly targetUnit: string;
  readonly evidenceMeasurement?: MeasurementValue | undefined;
  readonly evidenceMagnitude?: number | undefined;
  readonly evidenceUnit?: string | undefined;
}

export interface UnitComparisonResult {
  readonly state: EvaluationState;
  readonly reasonCode: EvaluationReasonCode;
  readonly explanation: string;
}

/**
 * Evaluates physical measurements with dimension verification and canonical conversion.
 * Strictly prevents cross-dimensional conversions (e.g., mass to length).
 */
export function compareUnits(input: UnitComparisonInput): UnitComparisonResult {
  const {
    operator,
    targetMagnitude,
    targetUnit,
    evidenceMeasurement,
    evidenceMagnitude,
    evidenceUnit,
  } = input;

  const rawActual = evidenceMeasurement?.magnitude ?? evidenceMagnitude;
  const actualUnit = evidenceMeasurement?.originalUnit ?? evidenceUnit;

  if (rawActual === undefined || !actualUnit) {
    return {
      state: 'UNKNOWN',
      reasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
      explanation: 'No valid physical measurement found in eligible candidate evidence.',
    };
  }

  // 1. Verify Target Unit
  const targetUnitDef = lookupUnitDefinition(targetUnit);
  if (!targetUnitDef) {
    return {
      state: 'INVALID_CONSTRAINT',
      reasonCode: 'INVALID_CONSTRAINT_DEFINITION',
      explanation: `Target unit "${targetUnit}" is not recognized as a supported physical unit.`,
    };
  }

  // 2. Cross-Dimensional Safety Check
  const evidenceUnitDef = lookupUnitDefinition(actualUnit);
  if (!evidenceUnitDef) {
    return {
      state: 'NOT_COMPARABLE',
      reasonCode: 'NORMALIZATION_UNAVAILABLE',
      explanation: `Evidence unit "${actualUnit}" is not recognized or cannot be mapped to a physical dimension.`,
    };
  }

  if (targetUnitDef.dimension !== evidenceUnitDef.dimension) {
    return {
      state: 'NOT_COMPARABLE',
      reasonCode: 'INCOMPATIBLE_MEASUREMENT_DIMENSION',
      explanation: `Cross-dimensional comparison rejected: constraint requires ${targetUnitDef.dimension} (${targetUnit}), but evidence specifies ${evidenceUnitDef.dimension} (${actualUnit}).`,
    };
  }

  // 3. Convert Target to Canonical Unit
  let convertedTarget: number | [number, number];
  try {
    if (typeof targetMagnitude === 'number') {
      const conv = convertMeasurement(targetMagnitude, targetUnit, targetUnitDef.canonicalUnit);
      convertedTarget = conv.convertedMagnitude;
    } else {
      const conv0 = convertMeasurement(targetMagnitude[0], targetUnit, targetUnitDef.canonicalUnit);
      const conv1 = convertMeasurement(targetMagnitude[1], targetUnit, targetUnitDef.canonicalUnit);
      convertedTarget = [conv0.convertedMagnitude, conv1.convertedMagnitude];
    }
  } catch (err) {
    return {
      state: 'NOT_COMPARABLE',
      reasonCode: 'INCOMPATIBLE_MEASUREMENT_DIMENSION',
      explanation: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. Evidence is already canonicalized in MeasurementValue.magnitude
  // If raw numeric magnitude was passed instead of MeasurementValue, convert it now
  let canonicalActual = rawActual;
  const canonicalRangeMin = evidenceMeasurement?.rangeMin;
  const canonicalRangeMax = evidenceMeasurement?.rangeMax;

  if (!evidenceMeasurement) {
    try {
      const convAct = convertMeasurement(rawActual, actualUnit, targetUnitDef.canonicalUnit);
      canonicalActual = convAct.convertedMagnitude;
    } catch (err) {
      return {
        state: 'NOT_COMPARABLE',
        reasonCode: 'INCOMPATIBLE_MEASUREMENT_DIMENSION',
        explanation: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return compareNumeric({
    operator,
    target: convertedTarget,
    actual: canonicalActual,
    isApproximate: evidenceMeasurement?.isApproximate ?? false,
    isRange: evidenceMeasurement?.isRange ?? false,
    rangeMin: canonicalRangeMin,
    rangeMax: canonicalRangeMax,
    unit: targetUnitDef.canonicalUnit,
  });
}
