import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ExtractedClaim } from '@/server/claims/contracts';
import {
  NORMALIZATION_RULESET_VERSION,
  type AvailabilityStatus,
  type ComparableAttribute,
  type MeasurementDimension,
  type NormalizedAttribute,
} from './contracts';
import { parseMeasurement } from './units';
import { parseMonetary } from './price-parser';
import { parseProductIdentity } from './identity-parser';

/**
 * Maps claim keys to probable physical measurement dimensions.
 */
function inferDimensionFromClaimKey(claimKey: string): MeasurementDimension | undefined {
  const k = claimKey.toLowerCase();
  if (k.includes('weight') || k.includes('mass')) return 'MASS';
  if (k.includes('length') || k.includes('width') || k.includes('height') || k.includes('depth') || k.includes('thickness')) return 'LENGTH';
  if (k.includes('display') || k.includes('screen') || k.includes('screen_size')) return 'DISPLAY_SIZE';
  if (k.includes('storage') || k.includes('disk') || k.includes('ssd') || k.includes('hdd') || k.includes('rom')) return 'STORAGE';
  if (k.includes('memory') || k.includes('ram')) return 'MEMORY';
  if (k.includes('battery') || k.includes('runtime') || k.includes('duration') || k.includes('battery_life')) return 'DURATION';
  if (k.includes('frequency') || k.includes('clock') || k.includes('cpu_speed')) return 'FREQUENCY';
  if (k.includes('power') || k.includes('wattage') || k.includes('tdp')) return 'POWER';
  if (k.includes('resolution')) return 'RESOLUTION';
  return undefined;
}

/**
 * Normalizes availability phrasing into standardized enum.
 */
function normalizeAvailability(rawText: string): AvailabilityStatus {
  const lower = rawText.toLowerCase();
  if (/(?:in\s+stock|available|ready\s+to\s+ship)/i.test(lower)) return 'IN_STOCK';
  if (/(?:out\s+of\s+stock|sold\s+out|unavailable)/i.test(lower)) return 'OUT_OF_STOCK';
  if (/(?:pre-?order|reserve)/i.test(lower)) return 'PREORDER';
  if (/(?:back-?order|delayed)/i.test(lower)) return 'BACKORDER';
  return 'UNKNOWN';
}

/**
 * Normalizes an ExtractedClaim into a NormalizedAttribute and ComparableAttribute.
 */
export function normalizeClaim(claim: ExtractedClaim): {
  normalizedAttribute: NormalizedAttribute;
  comparableAttribute: ComparableAttribute;
} {
  const now = new Date().toISOString();
  const rawValue = claim.extractedRawValue;

  // Base output skeleton
  const baseNormalized: Omit<NormalizedAttribute, 'attributeType' | 'status'> = {
    id: `norm_${randomUUID()}`,
    claimId: claim.id,
    sourceDocumentId: claim.sourceDocumentId,
    runId: claim.runId,
    userId: claim.userId,
    attributeKey: claim.claimKey,
    rawValue,
    qualifiers: claim.qualifiers,
    evidenceQuote: claim.evidence.verbatimQuote,
    charOffsets: {
      start: claim.evidence.charOffsetStart,
      end: claim.evidence.charOffsetEnd,
    },
    normalizedAt: now,
    rulesetVersion: NORMALIZATION_RULESET_VERSION,
  };

  const confidence = claim.evidence.confidenceScore;

  // 1. PRICE normalization
  if (claim.claimType === 'PRICE') {
    const monetary = parseMonetary(rawValue, claim.qualifiers);
    if (monetary) {
      const numVal = parseFloat(monetary.amount);
      const normalizedAttribute: NormalizedAttribute = {
        ...baseNormalized,
        attributeType: 'MONETARY',
        status: 'NORMALIZED',
        monetaryValue: monetary,
        qualifiers: monetary.qualifiers,
      };

      const comparableAttribute: ComparableAttribute = {
        key: claim.claimKey,
        type: 'MONETARY',
        numericValue: isNaN(numVal) ? undefined : numVal,
        decimalString: monetary.amount,
        currency: monetary.currency ?? undefined,
        unit: monetary.currencySymbol ?? undefined,
        isRange: monetary.isRange,
        rangeMin: monetary.rangeMin ? parseFloat(monetary.rangeMin) : undefined,
        rangeMax: monetary.rangeMax ? parseFloat(monetary.rangeMax) : undefined,
        qualifiers: monetary.qualifiers,
        isApproximate: monetary.isApproximate,
        confidence,
      };

      return { normalizedAttribute, comparableAttribute };
    }

    // Failed monetary parsing
    const normalizedAttribute: NormalizedAttribute = {
      ...baseNormalized,
      attributeType: 'MONETARY',
      status: 'UNRESOLVED',
      unresolvedReason: `Unable to parse monetary expression from: "${rawValue}"`,
    };

    const comparableAttribute: ComparableAttribute = {
      key: claim.claimKey,
      type: 'MONETARY',
      textValue: rawValue,
      isRange: false,
      qualifiers: claim.qualifiers,
      isApproximate: false,
      confidence,
    };

    return { normalizedAttribute, comparableAttribute };
  }

  // 2. SPECIFICATION normalization
  if (claim.claimType === 'SPECIFICATION') {
    const dimHint = inferDimensionFromClaimKey(claim.claimKey);
    const measurement = parseMeasurement(rawValue, dimHint);

    if (measurement) {
      const normalizedAttribute: NormalizedAttribute = {
        ...baseNormalized,
        attributeType: 'DIMENSION',
        status: 'NORMALIZED',
        measurementValue: measurement,
      };

      const comparableAttribute: ComparableAttribute = {
        key: claim.claimKey,
        type: 'DIMENSION',
        numericValue: measurement.magnitude,
        unit: measurement.canonicalUnit,
        isRange: measurement.isRange,
        rangeMin: measurement.rangeMin,
        rangeMax: measurement.rangeMax,
        qualifiers: claim.qualifiers,
        isApproximate: measurement.isApproximate,
        confidence,
      };

      return { normalizedAttribute, comparableAttribute };
    }

    // Categorical / non-numeric specification (e.g., color, operating system, finish)
    const normalizedAttribute: NormalizedAttribute = {
      ...baseNormalized,
      attributeType: 'CATEGORICAL',
      status: 'PARTIALLY_NORMALIZED',
      categoricalValue: {
        rawText: rawValue,
        standardKey: claim.claimKey,
        standardValue: rawValue.trim(),
        qualifiers: claim.qualifiers,
      },
    };

    const comparableAttribute: ComparableAttribute = {
      key: claim.claimKey,
      type: 'CATEGORICAL',
      textValue: rawValue.trim(),
      isRange: false,
      qualifiers: claim.qualifiers,
      isApproximate: false,
      confidence,
    };

    return { normalizedAttribute, comparableAttribute };
  }

  // 3. PRODUCT IDENTITY / PROPERTY normalization
  if (claim.claimType === 'PROPERTY' || claim.claimKey.includes('brand') || claim.claimKey.includes('model') || claim.claimKey.includes('sku') || claim.claimKey.includes('title')) {
    const identity = parseProductIdentity(rawValue, claim.claimKey, claim.subject ?? undefined);

    const normalizedAttribute: NormalizedAttribute = {
      ...baseNormalized,
      attributeType: 'IDENTITY',
      status: 'NORMALIZED',
      identityValue: identity,
      qualifiers: identity.qualifiers,
    };

    const comparableAttribute: ComparableAttribute = {
      key: claim.claimKey,
      type: 'IDENTITY',
      textValue: identity.cleanTitle,
      condition: identity.condition,
      qualifiers: identity.qualifiers,
      isRange: false,
      isApproximate: false,
      confidence,
    };

    return { normalizedAttribute, comparableAttribute };
  }

  // 4. AVAILABILITY normalization
  if (claim.claimType === 'AVAILABILITY') {
    const availStatus = normalizeAvailability(rawValue);

    const normalizedAttribute: NormalizedAttribute = {
      ...baseNormalized,
      attributeType: 'CATEGORICAL',
      status: 'NORMALIZED',
      categoricalValue: {
        rawText: rawValue,
        standardKey: 'availability',
        standardValue: availStatus,
        qualifiers: claim.qualifiers,
      },
    };

    const comparableAttribute: ComparableAttribute = {
      key: claim.claimKey,
      type: 'CATEGORICAL',
      availability: availStatus,
      textValue: availStatus,
      isRange: false,
      qualifiers: claim.qualifiers,
      isApproximate: false,
      confidence,
    };

    return { normalizedAttribute, comparableAttribute };
  }

  // 5. GENERAL / FEATURE / POLICY fallback
  const normalizedAttribute: NormalizedAttribute = {
    ...baseNormalized,
    attributeType: 'GENERAL',
    status: 'NORMALIZED',
    generalValue: rawValue.trim(),
  };

  const comparableAttribute: ComparableAttribute = {
    key: claim.claimKey,
    type: 'GENERAL',
    textValue: rawValue.trim(),
    isRange: false,
    qualifiers: claim.qualifiers,
    isApproximate: false,
    confidence,
  };

  return { normalizedAttribute, comparableAttribute };
}

