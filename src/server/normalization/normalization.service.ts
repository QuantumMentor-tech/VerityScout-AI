import 'server-only';
import type { ExtractedClaim } from '@/server/claims/contracts';
import {
  type ComparableAttribute,
  type NormalizedAttribute,
  type NormalizationSummary,
} from './contracts';
import { normalizeClaim } from './attribute-normalizer';

export class ProductNormalizationService {
  /**
   * Normalizes a batch of extracted claims into structured, comparable attributes.
   *
   * Invariants:
   * 1. Raw source values and verbatim quotes are preserved without mutation.
   * 2. No automatic cross-currency conversions are attempted.
   * 3. Distinct variants, SKUs, and conditions are not collapsed prematurely.
   * 4. Full traceability back to ExtractedClaim.id is maintained.
   */
  normalizeClaims(
    runId: string,
    claims: readonly ExtractedClaim[],
  ): NormalizationSummary {
    const startTime = Date.now();

    const normalizedAttributes: NormalizedAttribute[] = [];
    const comparableAttributes: ComparableAttribute[] = [];

    let successfullyNormalized = 0;
    let partiallyNormalized = 0;
    let unresolvedCount = 0;
    let invalidCount = 0;

    for (const claim of claims) {
      const { normalizedAttribute, comparableAttribute } = normalizeClaim(claim);

      normalizedAttributes.push(normalizedAttribute);
      comparableAttributes.push(comparableAttribute);

      switch (normalizedAttribute.status) {
        case 'NORMALIZED':
          successfullyNormalized++;
          break;
        case 'PARTIALLY_NORMALIZED':
          partiallyNormalized++;
          break;
        case 'UNRESOLVED':
          unresolvedCount++;
          break;
        case 'INVALID':
          invalidCount++;
          break;
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      runId,
      totalClaimsProcessed: claims.length,
      successfullyNormalized,
      partiallyNormalized,
      unresolvedCount,
      invalidCount,
      attributes: normalizedAttributes,
      comparableAttributes,
      durationMs,
    };
  }

  /**
   * Helper to normalize a single claim.
   */
  normalizeSingleClaim(claim: ExtractedClaim): {
    normalizedAttribute: NormalizedAttribute;
    comparableAttribute: ComparableAttribute;
  } {
    return normalizeClaim(claim);
  }
}

/**
 * Singleton instance of ProductNormalizationService.
 */
let defaultServiceInstance: ProductNormalizationService | null = null;

export function getDefaultNormalizationService(): ProductNormalizationService {
  if (!defaultServiceInstance) {
    defaultServiceInstance = new ProductNormalizationService();
  }
  return defaultServiceInstance;
}

