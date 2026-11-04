import 'server-only';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type {
  ComparableAttribute,
  NormalizedAttribute,
} from '@/server/normalization/contracts';
import type { EvaluationContext, EvidenceReference } from './contracts';

export interface EligibleEvidenceBundle {
  readonly matchingClaims: readonly ExtractedClaim[];
  readonly matchingNormalized: readonly NormalizedAttribute[];
  readonly matchingComparable?: ComparableAttribute | undefined;
  readonly isConflicting: boolean;
  readonly conflictExplanation?: string | undefined;
  readonly evidenceReferences: readonly EvidenceReference[];
}

/**
 * Normalizes claim and constraint keys for flexible, semantic matching.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if a claim key or normalized attribute key matches a constraint key.
 */
function isKeyMatch(attrKey: string, constraintKey: string): boolean {
  const k1 = normalizeKey(attrKey);
  const k2 = normalizeKey(constraintKey);

  if (k1 === k2) return true;
  if (k1.includes(k2) || k2.includes(k1)) return true;

  // Synonyms
  if ((k1.includes('ram') || k1.includes('memory')) && (k2.includes('ram') || k2.includes('memory'))) return true;
  if ((k1.includes('storage') || k1.includes('disk') || k1.includes('ssd')) && (k2.includes('storage') || k2.includes('disk') || k2.includes('ssd'))) return true;
  if ((k1.includes('weight') || k1.includes('mass')) && (k2.includes('weight') || k2.includes('mass'))) return true;
  if ((k1.includes('price') || k1.includes('cost')) && (k2.includes('price') || k2.includes('cost'))) return true;
  if ((k1.includes('screen') || k1.includes('display')) && (k2.includes('screen') || k2.includes('display'))) return true;
  if ((k1.includes('battery') || k1.includes('runtime')) && (k2.includes('battery') || k2.includes('runtime'))) return true;

  return false;
}

/**
 * Filters and aggregates eligible evidence for a specific constraint key,
 * enforcing candidate isolation and detecting multi-source contradictions.
 */
export function matchEligibleEvidence(
  constraintKey: string,
  context: EvaluationContext,
  allClaims: readonly ExtractedClaim[],
  allNormalized: readonly NormalizedAttribute[],
  allComparable: readonly ComparableAttribute[],
): EligibleEvidenceBundle {
  // 1. Scope Isolation (AC-10): Only accept claims belonging to this run and user
  const eligibleClaims = allClaims.filter(
    (c) => c.runId === context.runId && c.userId === context.userId && isKeyMatch(c.claimKey, constraintKey),
  );

  const eligibleNormalized = allNormalized.filter(
    (n) => n.runId === context.runId && n.userId === context.userId && isKeyMatch(n.attributeKey, constraintKey),
  );

  const eligibleComparable = allComparable.find((c) => isKeyMatch(c.key, constraintKey));

  // Build evidence references
  const evidenceReferences: EvidenceReference[] = eligibleClaims.map((c) => ({
    claimId: c.id,
    sourceDocumentId: c.sourceDocumentId,
    verbatimQuote: c.evidence.verbatimQuote,
    charOffsets: {
      start: c.evidence.charOffsetStart,
      end: c.evidence.charOffsetEnd,
    },
    confidenceScore: c.evidence.confidenceScore,
    claimKey: c.claimKey,
    claimType: c.claimType,
  }));

  // 2. Conflict Detection across eligible normalized attributes (AC-07)
  let isConflicting = false;
  let conflictExplanation: string | undefined;

  if (eligibleNormalized.length > 1) {
    // Check if numeric/monetary values differ materially without discount/qualifier justification
    const monetaryValues = eligibleNormalized
      .map((n) => n.monetaryValue)
      .filter((m): m is NonNullable<typeof m> => m !== undefined);

    if (monetaryValues.length > 1) {
      const distinctCurrentPrices = new Set(
        monetaryValues.filter((m) => m.priceType === 'CURRENT').map((m) => `${m.currency ?? ''}:${m.amount}`),
      );
      if (distinctCurrentPrices.size > 1) {
        isConflicting = true;
        conflictExplanation = `Multiple eligible claims report conflicting regular prices: [${Array.from(distinctCurrentPrices).join(', ')}].`;
      }
    }

    const measurementValues = eligibleNormalized
      .map((n) => n.measurementValue)
      .filter((m): m is NonNullable<typeof m> => m !== undefined);

    if (measurementValues.length > 1) {
      const distinctMags = new Set(measurementValues.map((m) => Math.round(m.magnitude)));
      if (distinctMags.size > 1) {
        isConflicting = true;
        conflictExplanation = `Multiple eligible claims report conflicting measurement values for ${constraintKey}: [${Array.from(distinctMags).join(', ')}].`;
      }
    }

    const identityConditions = eligibleNormalized
      .map((n) => n.identityValue?.condition)
      .filter((c): c is NonNullable<typeof c> => c !== undefined && c !== 'UNKNOWN');

    if (identityConditions.length > 1) {
      const distinctConditions = new Set(identityConditions);
      if (distinctConditions.size > 1) {
        isConflicting = true;
        conflictExplanation = `Multiple eligible claims report conflicting product conditions: [${Array.from(distinctConditions).join(', ')}].`;
      }
    }
  }

  return {
    matchingClaims: eligibleClaims,
    matchingNormalized: eligibleNormalized,
    matchingComparable: eligibleComparable,
    isConflicting,
    conflictExplanation,
    evidenceReferences,
  };
}

