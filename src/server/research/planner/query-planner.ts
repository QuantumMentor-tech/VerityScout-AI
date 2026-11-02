import 'server-only';

/**
 * VerityScout AI — Multi-Engine Query Planner & Variant Generator
 * Governed by: Step 31 (Research Query Parsing, Constraint-Aware Query Planning, and Search Intent Normalization)
 *
 * Traceability:
 * - AC-004: Multi-Engine Query Planning & Search Query Expansion
 * - Generates between 2 and 5 diversified search queries targeting distinct angles:
 *   1. Primary Literal Query (traceable directly to input)
 *   2. Specification-Focused Query
 *   3. Price & Deals Query
 *   4. Retailer / Aggregator Review Query
 *   5. Comparative / Alternative Query (optional)
 * - Safe sanitization preventing search-syntax injection.
 * - Deduplication with stable ordering and fallback safety.
 */

import type {
  SearchQueryVariant,
  NormalizedConstraint,
  SearchQueryAngle,
} from './contracts';

export interface GenerateQueryVariantsOptions {
  readonly maxQueries?: number;
}

/**
 * Cleans a query string to avoid broken search engine operators while preserving alphanumeric identifiers.
 */
function sanitizeSearchQueryText(text: string): string {
  return text
    .replace(/[<>{}[\]\\]/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

/**
 * Generates 2 to 5 bounded, diversified search queries based on the extracted intent and constraints.
 */
export function generateSearchQueryVariants(
  targetEntity: string,
  originalQuery: string,
  constraints: readonly NormalizedConstraint[],
  options?: GenerateQueryVariantsOptions
): readonly SearchQueryVariant[] {
  const maxQueries = Math.min(5, Math.max(2, options?.maxQueries ?? 4));
  const variants: SearchQueryVariant[] = [];
  const seenQueries = new Set<string>();

  function addVariant(
    queryStr: string,
    angle: SearchQueryAngle,
    isPrimary: boolean,
    rationale: string,
    targetedConstraintKeys: string[]
  ): void {
    const clean = sanitizeSearchQueryText(queryStr);
    const lower = clean.toLowerCase();
    if (!clean || seenQueries.has(lower)) return;
    if (variants.length >= maxQueries) return;

    seenQueries.add(lower);
    variants.push({
      id: `q-${angle.toLowerCase()}-${variants.length + 1}`,
      query: clean,
      angle,
      isPrimary,
      rationale,
      targetedConstraintKeys,
    });
  }

  // 1. PRIMARY Query: Cleaned entity + key positive qualifiers
  const priceCeiling = constraints.find(c => c.type === 'PRICE_CEILING');
  const conditionReq = constraints.find(c => c.type === 'CONDITION' && c.priority === 'REQUIRED');
  const brandReq = constraints.find(c => c.type === 'BRAND' && c.priority === 'REQUIRED');

  let primaryText = targetEntity;
  if (brandReq && !targetEntity.toLowerCase().includes(String(brandReq.normalizedValue).toLowerCase())) {
    primaryText = `${brandReq.normalizedValue} ${targetEntity}`;
  }

  addVariant(
    primaryText,
    'PRIMARY',
    true,
    'Primary literal entity query capturing core target product or topic',
    []
  );

  // 2. SPECIFICATION-FOCUSED Query: Entity + mandatory specs / technical keywords
  const specs = constraints.filter(c => c.type === 'SPECIFICATION' && c.priority === 'REQUIRED');
  const specTokens = specs.map(s => `${s.key} ${s.rawValue}`).join(' ');
  const specQuery = specTokens
    ? `${targetEntity} ${specTokens} specifications`
    : `${targetEntity} technical specifications specs`;

  addVariant(
    specQuery,
    'SPECIFICATION_FOCUSED',
    false,
    'Targets technical datasheets, user manuals, and exact specification listings',
    specs.map(s => s.key)
  );

  // 3. PRICE & DEALS Query: Entity + price ceiling / condition constraints
  const priceParts: string[] = [targetEntity];
  const targetedPriceKeys: string[] = [];

  if (priceCeiling) {
    const curSymbol = priceCeiling.unitOrCurrency === 'USD' ? '$' : (priceCeiling.unitOrCurrency ?? '');
    priceParts.push(`under ${curSymbol}${priceCeiling.rawValue}`);
    targetedPriceKeys.push('price');
  }

  if (conditionReq) {
    priceParts.push(String(conditionReq.normalizedValue).toLowerCase());
    targetedPriceKeys.push('condition');
  }

  priceParts.push('price buy');
  addVariant(
    priceParts.join(' '),
    'PRICE_AND_DEALS',
    false,
    'Targets retail offers, pricing listings, and verified stock availability',
    targetedPriceKeys
  );

  // 4. RETAILER / AGGREGATOR Query: Entity targeting reputable merchant reviews with domain exclusions
  const excludedDomains = constraints
    .filter(c => c.type === 'EXCLUDED_DOMAIN' && c.priority === 'EXCLUDED')
    .map(c => `-site:${c.normalizedValue}`);

  const retailerParts: string[] = [targetEntity, 'review overview'];
  if (excludedDomains.length > 0) {
    retailerParts.push(...excludedDomains.slice(0, 2)); // Limit exclusions in search string to prevent query overload
  }

  addVariant(
    retailerParts.join(' '),
    'RETAILER_AGGREGATOR',
    false,
    'Targets editorial reviews, benchmark syntheses, and aggregator ratings',
    constraints.filter(c => c.type === 'EXCLUDED_DOMAIN').map(() => 'domain')
  );

  // Ensure minimum 2 queries
  if (variants.length < 2) {
    addVariant(
      `${targetEntity} official overview`,
      'SPECIFICATION_FOCUSED',
      false,
      'Fallback secondary query targeting manufacturer overview documentation',
      []
    );
  }

  // Safety Fallback: If somehow 0 queries, return original query literal
  if (variants.length === 0) {
    variants.push({
      id: 'q-fallback-1',
      query: sanitizeSearchQueryText(originalQuery),
      angle: 'PRIMARY',
      isPrimary: true,
      rationale: 'Literal fallback query',
      targetedConstraintKeys: [],
    });
  }

  return variants;
}
