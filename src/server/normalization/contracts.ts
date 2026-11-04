import 'server-only';
import { z } from 'zod';

/**
 * VerityScout AI — Product Identity, Price & Specification Normalization Contracts
 * Governed by: Step 37 (Product Identity Normalization, Prices, Currency, Specifications, and Comparable Attributes)
 *
 * Epistemological Tenets:
 * 1. Normalization facilitates comparison; it does NOT prove factual truth or product identity.
 * 2. Raw source values ("1.4 kg", "$1,299.00", "Starting at $299") are NEVER overwritten or discarded.
 * 3. Currency conversion is STRICTLY PROHIBITED unless authorized; differently denominated amounts remain separate.
 * 4. Distinct product variants, SKUs, and conditions (new vs refurbished) must never be collapsed.
 * 5. Every normalized attribute preserves full traceability back to its originating Step 36 ExtractedClaim.
 */

export const NORMALIZATION_RULESET_VERSION = 'v1.0';

export const NORMALIZED_ATTRIBUTE_TYPES = [
  'MONETARY',
  'DIMENSION',
  'IDENTITY',
  'CATEGORICAL',
  'GENERAL',
] as const;
export type NormalizedAttributeType = (typeof NORMALIZED_ATTRIBUTE_TYPES)[number];

export const NORMALIZATION_STATUSES = [
  'NORMALIZED',
  'PARTIALLY_NORMALIZED',
  'UNRESOLVED',
  'INVALID',
] as const;
export type NormalizationStatus = (typeof NORMALIZATION_STATUSES)[number];

export const PRICE_TYPES = [
  'CURRENT',
  'LIST',
  'DISCOUNTED',
  'STARTING_AT',
  'RANGE',
  'SUBSCRIPTION',
  'PER_UNIT',
] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const PRODUCT_CONDITIONS = ['NEW', 'REFURBISHED', 'USED', 'UNKNOWN'] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const AVAILABILITY_STATUSES = [
  'IN_STOCK',
  'OUT_OF_STOCK',
  'PREORDER',
  'BACKORDER',
  'UNKNOWN',
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const MEASUREMENT_DIMENSIONS = [
  'MASS',
  'LENGTH',
  'DISPLAY_SIZE',
  'STORAGE',
  'MEMORY',
  'DURATION',
  'FREQUENCY',
  'POWER',
  'RESOLUTION',
  'COUNT',
  'CUSTOM',
] as const;
export type MeasurementDimension = (typeof MEASUREMENT_DIMENSIONS)[number];

/**
 * Structured monetary representation with exact decimal string storage.
 */
export const MonetaryValueSchema = z.object({
  rawText: z.string(),
  amount: z.string().regex(/^\d+(?:\.\d{1,4})?$/, 'Must be an exact non-negative decimal string'),
  currency: z.string().length(3).nullable().default(null), // ISO 4217 code or null if ambiguous
  currencySymbol: z.string().nullable().default(null),
  priceType: z.enum(PRICE_TYPES).default('CURRENT'),
  qualifiers: z.array(z.string()).readonly().default([]),
  isApproximate: z.boolean().default(false),
  isRange: z.boolean().default(false),
  rangeMin: z.string().optional(),
  rangeMax: z.string().optional(),
  billingInterval: z.enum(['MONTHLY', 'YEARLY', 'ONETIME']).optional(),
});
export type MonetaryValue = z.infer<typeof MonetaryValueSchema>;

/**
 * Typed measurement representation with canonical unit conversion and range support.
 */
export const MeasurementValueSchema = z.object({
  rawText: z.string(),
  magnitude: z.number(),
  canonicalUnit: z.string().min(1),
  originalUnit: z.string().min(1),
  dimension: z.enum(MEASUREMENT_DIMENSIONS),
  isApproximate: z.boolean().default(false),
  isRange: z.boolean().default(false),
  rangeMin: z.number().optional(),
  rangeMax: z.number().optional(),
  isUpperBound: z.boolean().default(false),
  isLowerBound: z.boolean().default(false),
  conversionFactorApplied: z.number().optional(),
});
export type MeasurementValue = z.infer<typeof MeasurementValueSchema>;

/**
 * Product identity attributes separating brand, family, model number, and SKU.
 */
export const ProductIdentityValueSchema = z.object({
  rawText: z.string(),
  cleanTitle: z.string(),
  brand: z.string().nullable().default(null),
  modelNumber: z.string().nullable().default(null),
  sku: z.string().nullable().default(null),
  productFamily: z.string().nullable().default(null),
  variant: z.string().nullable().default(null),
  condition: z.enum(PRODUCT_CONDITIONS).default('UNKNOWN'),
  qualifiers: z.array(z.string()).readonly().default([]),
});
export type ProductIdentityValue = z.infer<typeof ProductIdentityValueSchema>;

/**
 * Standardized categorical attribute value.
 */
export const CategoricalValueSchema = z.object({
  rawText: z.string(),
  standardKey: z.string(),
  standardValue: z.string(),
  qualifiers: z.array(z.string()).readonly().default([]),
});
export type CategoricalValue = z.infer<typeof CategoricalValueSchema>;

/**
 * Fully normalized attribute linked to an originating Step 36 claim.
 */
export const NormalizedAttributeSchema = z.object({
  id: z.string().min(1),
  claimId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  runId: z.string().min(1),
  userId: z.string().min(1),
  attributeKey: z.string().min(1),
  rawValue: z.string(),
  attributeType: z.enum(NORMALIZED_ATTRIBUTE_TYPES),
  status: z.enum(NORMALIZATION_STATUSES),
  monetaryValue: MonetaryValueSchema.optional(),
  measurementValue: MeasurementValueSchema.optional(),
  identityValue: ProductIdentityValueSchema.optional(),
  categoricalValue: CategoricalValueSchema.optional(),
  generalValue: z.string().optional(),
  qualifiers: z.array(z.string()).readonly().default([]),
  evidenceQuote: z.string(),
  charOffsets: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  }),
  unresolvedReason: z.string().optional(),
  normalizedAt: z.string().datetime(),
  rulesetVersion: z.string().default(NORMALIZATION_RULESET_VERSION),
});
export type NormalizedAttribute = z.infer<typeof NormalizedAttributeSchema>;

/**
 * Deterministic comparison representation designed for consumption by Step 38.
 */
export interface ComparableAttribute {
  readonly key: string;
  readonly type: NormalizedAttributeType;
  readonly numericValue?: number | undefined;
  readonly decimalString?: string | undefined;
  readonly unit?: string | undefined;
  readonly currency?: string | undefined;
  readonly textValue?: string | undefined;
  readonly isRange: boolean;
  readonly rangeMin?: number | undefined;
  readonly rangeMax?: number | undefined;
  readonly condition?: ProductCondition | undefined;
  readonly availability?: AvailabilityStatus | undefined;
  readonly qualifiers: readonly string[];
  readonly isApproximate: boolean;
  readonly confidence: number;
}

/**
 * Summary of a batch normalization operation across claims.
 */
export interface NormalizationSummary {
  readonly runId: string;
  readonly totalClaimsProcessed: number;
  readonly successfullyNormalized: number;
  readonly partiallyNormalized: number;
  readonly unresolvedCount: number;
  readonly invalidCount: number;
  readonly attributes: readonly NormalizedAttribute[];
  readonly comparableAttributes: readonly ComparableAttribute[];
  readonly durationMs: number;
}

