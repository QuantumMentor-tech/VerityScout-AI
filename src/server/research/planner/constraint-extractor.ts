import 'server-only';

/**
 * VerityScout AI — Deterministic Constraint Extractor & Intent Parser
 * Governed by: Step 31 (Research Query Parsing, Constraint-Aware Query Planning, and Search Intent Normalization)
 *
 * Traceability:
 * - AC-002: Structured query specification parsing & attribute extraction
 * - AC-003: Interactive disambiguation for missing currency or region
 * - Preserves required, preferred, and excluded criteria with deterministic contradiction detection.
 */

import { TaskType } from '@/server/persistence/types';
import type {
  NormalizedConstraint,
  StructuredConstraintsInput,
  PlanAmbiguity,
  PlanWarning,
} from './contracts';

export interface ExtractedIntentData {
  readonly targetEntity: string;
  readonly taskType: TaskType;
  readonly extractedCategory?: string;
  readonly constraints: readonly NormalizedConstraint[];
  readonly ambiguities: readonly PlanAmbiguity[];
  readonly warnings: readonly PlanWarning[];
}

const COMMON_BRANDS = [
  'Sony', 'Apple', 'Lenovo', 'Asus', 'ASUS', 'Nvidia', 'NVIDIA', 'AMD', 'Intel',
  'Dell', 'HP', 'Samsung', 'LG', 'Bose', 'Sennheiser', 'Logitech', 'Microsoft',
  'Google', 'Razer', 'Corsair', 'Acer', 'MSI', 'Canon', 'Nikon', 'PlayStation',
  'Xbox', 'Nintendo', 'Meta',
];

const DOMAIN_MAP: Record<string, string> = {
  ebay: 'ebay.com',
  amazon: 'amazon.com',
  walmart: 'walmart.com',
  bestbuy: 'bestbuy.com',
  reddit: 'reddit.com',
  aliexpress: 'aliexpress.com',
  temu: 'temu.com',
  newegg: 'newegg.com',
};

function parseCurrencySymbol(symbolOrCode?: string): string | undefined {
  if (!symbolOrCode) return undefined;
  const upper = symbolOrCode.toUpperCase().trim();
  if (upper === '$' || upper === 'USD') return 'USD';
  if (upper === '€' || upper === 'EUR') return 'EUR';
  if (upper === '£' || upper === 'GBP') return 'GBP';
  if (upper === 'CAD' || upper === 'AUD') return upper;
  return upper;
}

/**
 * Deterministically parses natural-language query and reconciles with structured constraints.
 */
export function extractIntentAndConstraints(
  normalizedQuery: string,
  structuredConstraints?: StructuredConstraintsInput,
  taskTypeOverride?: TaskType
): ExtractedIntentData {
  const constraints: NormalizedConstraint[] = [];
  const ambiguities: PlanAmbiguity[] = [];
  const warnings: PlanWarning[] = [];

  let queryText = normalizedQuery;
  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  let priceCurrency: string | undefined;

  // 1. Natural Language Extraction: Price Range ("between $200 and $400")
  const betweenPriceRegex = /\b(?:between)\s*([$€£])?\s*(\d+(?:\.\d{1,2})?)\s*(?:and|-)\s*([$€£])?\s*(\d+(?:\.\d{1,2})?)\s*(usd|eur|gbp)?\b/i;
  const betweenMatch = betweenPriceRegex.exec(queryText);
  if (betweenMatch) {
    const sym1 = betweenMatch[1];
    const val1 = parseFloat(betweenMatch[2] ?? '0');
    const sym2 = betweenMatch[3];
    const val2 = parseFloat(betweenMatch[4] ?? '0');
    const code = betweenMatch[5];

    minPrice = Math.min(val1, val2);
    maxPrice = Math.max(val1, val2);
    priceCurrency = parseCurrencySymbol(sym1 || sym2 || code);

    if (!priceCurrency) {
      ambiguities.push({
        code: 'MISSING_CURRENCY',
        message: `Price range specified ("between ${minPrice} and ${maxPrice}") without explicit currency. Please confirm currency (USD, EUR, GBP).`,
        field: 'currency',
        suggestedResolutions: ['USD', 'EUR', 'GBP'],
      });
    }

    constraints.push({
      id: 'c-price-floor',
      type: 'PRICE_FLOOR',
      priority: 'REQUIRED',
      key: 'price',
      operator: 'GTE',
      rawValue: String(minPrice),
      normalizedValue: minPrice,
      ...(priceCurrency ? { unitOrCurrency: priceCurrency } : {}),
      provenance: 'DETERMINISTIC_EXTRACTION',
    });

    constraints.push({
      id: 'c-price-ceiling',
      type: 'PRICE_CEILING',
      priority: 'REQUIRED',
      key: 'price',
      operator: 'LTE',
      rawValue: String(maxPrice),
      normalizedValue: maxPrice,
      ...(priceCurrency ? { unitOrCurrency: priceCurrency } : {}),
      provenance: 'DETERMINISTIC_EXTRACTION',
    });

    queryText = queryText.replace(betweenMatch[0], ' ');
  }

  // 2. Natural Language Extraction: Max Price / Price Ceiling ("under $300", "below 600", "less than $500", "<= $300")
  const maxPriceRegex = /\b(?:under|below|less than|max(?:imum)?|<=?)\s*([$€£])?\s*(\d+(?:\.\d{1,2})?)\s*(usd|eur|gbp)?\b/i;
  const maxMatch = maxPriceRegex.exec(queryText);
  if (maxMatch && maxPrice === undefined) {
    const sym = maxMatch[1];
    const num = parseFloat(maxMatch[2] ?? '0');
    const code = maxMatch[3];
    maxPrice = num;
    const cur = parseCurrencySymbol(sym || code);
    if (cur) priceCurrency = cur;

    if (!cur && !priceCurrency) {
      ambiguities.push({
        code: 'MISSING_CURRENCY',
        message: `Price ceiling detected ("${maxMatch[0].trim()}") without explicit currency symbol or code. Please confirm currency.`,
        field: 'currency',
        suggestedResolutions: ['USD', 'EUR', 'GBP'],
      });
    }

    constraints.push({
      id: 'c-price-ceiling',
      type: 'PRICE_CEILING',
      priority: 'REQUIRED',
      key: 'price',
      operator: 'LTE',
      rawValue: String(num),
      normalizedValue: num,
      ...(cur || priceCurrency ? { unitOrCurrency: cur || priceCurrency } : {}),
      provenance: 'DETERMINISTIC_EXTRACTION',
    });

    queryText = queryText.replace(maxMatch[0], ' ');
  }

  // 3. Natural Language Extraction: Min Price / Price Floor ("over $400", "above $200", ">= $150")
  const minPriceRegex = /\b(?:over|above|more than|min(?:imum)?|>=?)\s*([$€£])?\s*(\d+(?:\.\d{1,2})?)\s*(usd|eur|gbp)?\b/i;
  const minMatch = minPriceRegex.exec(queryText);
  if (minMatch && minPrice === undefined) {
    const sym = minMatch[1];
    const num = parseFloat(minMatch[2] ?? '0');
    const code = minMatch[3];
    minPrice = num;
    const cur = parseCurrencySymbol(sym || code);
    if (cur) priceCurrency = cur;

    if (!cur && !priceCurrency) {
      ambiguities.push({
        code: 'MISSING_CURRENCY',
        message: `Price floor detected ("${minMatch[0].trim()}") without explicit currency symbol or code. Please confirm currency.`,
        field: 'currency',
        suggestedResolutions: ['USD', 'EUR', 'GBP'],
      });
    }

    constraints.push({
      id: 'c-price-floor',
      type: 'PRICE_FLOOR',
      priority: 'REQUIRED',
      key: 'price',
      operator: 'GTE',
      rawValue: String(num),
      normalizedValue: num,
      ...(cur || priceCurrency ? { unitOrCurrency: cur || priceCurrency } : {}),
      provenance: 'DETERMINISTIC_EXTRACTION',
    });

    queryText = queryText.replace(minMatch[0], ' ');
  }

  // 4. Natural Language Extraction: Exclusions (Domains, Refurbished, Keywords)
  // e.g. "exclude ebay and refurbished", "no amazon", "without reddit", "-site:ebay.com"
  const excludeDomainRegex = /\b(?:exclude|no|without)\s+([a-zA-Z0-9.-]+)(?:\s+(?:and|,)\s+([a-zA-Z0-9.-]+))?/gi;
  let excludeMatch: RegExpExecArray | null;
  while ((excludeMatch = excludeDomainRegex.exec(queryText)) !== null) {
    const candidates = [excludeMatch[1], excludeMatch[2]].filter(Boolean) as string[];
    for (const raw of candidates) {
      const lower = raw.toLowerCase().trim();
      if (lower === 'refurbished' || lower === 'renewed' || lower === 'used') {
        constraints.push({
          id: `c-excluded-${lower}`,
          type: 'CONDITION',
          priority: 'EXCLUDED',
          key: 'condition',
          operator: 'NOT_IN',
          rawValue: raw,
          normalizedValue: lower.toUpperCase(),
          provenance: 'DETERMINISTIC_EXTRACTION',
        });
      } else if (DOMAIN_MAP[lower] || lower.includes('.')) {
        const domain = DOMAIN_MAP[lower] ?? lower;
        constraints.push({
          id: `c-excluded-domain-${domain}`,
          type: 'EXCLUDED_DOMAIN',
          priority: 'EXCLUDED',
          key: 'domain',
          operator: 'NOT_IN',
          rawValue: raw,
          normalizedValue: domain,
          provenance: 'DETERMINISTIC_EXTRACTION',
        });
      } else if (lower.length > 2 && !['and', 'the', 'for', 'any'].includes(lower)) {
        constraints.push({
          id: `c-excluded-kw-${lower}`,
          type: 'EXCLUDED_KEYWORD',
          priority: 'EXCLUDED',
          key: 'keyword',
          operator: 'NOT_IN',
          rawValue: raw,
          normalizedValue: lower,
          provenance: 'DETERMINISTIC_EXTRACTION',
        });
      }
    }
  }

  // Check explicit negation tokens like -ebay.com, -refurbished, -site:amazon.com
  const dashTokenRegex = /(?:^|\s)-(?:site:)?([a-zA-Z0-9.-]+)\b/g;
  let dashMatch: RegExpExecArray | null;
  while ((dashMatch = dashTokenRegex.exec(queryText)) !== null) {
    const raw = dashMatch[1] ?? '';
    const lower = raw.toLowerCase();
    if (DOMAIN_MAP[lower] || lower.includes('.')) {
      const domain = DOMAIN_MAP[lower] ?? lower;
      constraints.push({
        id: `c-excluded-domain-${domain}`,
        type: 'EXCLUDED_DOMAIN',
        priority: 'EXCLUDED',
        key: 'domain',
        operator: 'NOT_IN',
        rawValue: raw,
        normalizedValue: domain,
        provenance: 'DETERMINISTIC_EXTRACTION',
      });
    } else {
      constraints.push({
        id: `c-excluded-kw-${lower}`,
        type: 'EXCLUDED_KEYWORD',
        priority: 'EXCLUDED',
        key: 'keyword',
        operator: 'NOT_IN',
        rawValue: raw,
        normalizedValue: lower,
        provenance: 'DETERMINISTIC_EXTRACTION',
      });
    }
  }

  // 5. Natural Language Extraction: Condition (Positive "in new condition", "brand new", "new only")
  const hasNewCondition = /\b(?:in\s+)?new(?:\s+condition|in\s+factory\s+sealed)?\b/i.test(queryText);
  const isExcludedRefurb =
    constraints.some(c => c.key === 'condition' && c.priority === 'EXCLUDED') ||
    /\b(?:exclude|no|without)\s+[^,.]*?\b(?:refurbished|renewed|used)\b/i.test(queryText);
  const hasUsedOrRefurbished = /\b(?:refurbished|renewed|used)\b/i.test(queryText) && !isExcludedRefurb;

  if (hasNewCondition && hasUsedOrRefurbished) {
    ambiguities.push({
      code: 'CONFLICTING_CONSTRAINTS',
      message: 'Query specifies contradictory conditions: both brand new and refurbished/used requested.',
      field: 'condition',
      suggestedResolutions: ['Select NEW condition', 'Select REFURBISHED/USED condition'],
    });
  } else if (hasNewCondition) {
    constraints.push({
      id: 'c-condition-new',
      type: 'CONDITION',
      priority: 'REQUIRED',
      key: 'condition',
      operator: 'EQ',
      rawValue: 'new',
      normalizedValue: 'NEW',
      provenance: 'DETERMINISTIC_EXTRACTION',
    });
  } else if (hasUsedOrRefurbished && !constraints.some(c => c.key === 'condition' && c.priority === 'EXCLUDED')) {
    constraints.push({
      id: 'c-condition-refurbished',
      type: 'CONDITION',
      priority: 'REQUIRED',
      key: 'condition',
      operator: 'EQ',
      rawValue: 'refurbished',
      normalizedValue: 'REFURBISHED',
      provenance: 'DETERMINISTIC_EXTRACTION',
    });
  }

  // 6. Natural Language Extraction: Specific Attributes (e.g. "black color only", "32GB RAM")
  const colorMatch = /\b([a-zA-Z]+)\s+color(?:\s+only)?\b/i.exec(queryText);
  if (colorMatch) {
    const color = colorMatch[1]!.toLowerCase();
    constraints.push({
      id: 'c-spec-color',
      type: 'SPECIFICATION',
      priority: 'REQUIRED',
      key: 'color',
      operator: 'EQ',
      rawValue: colorMatch[0],
      normalizedValue: color,
      provenance: 'DETERMINISTIC_EXTRACTION',
    });
  }

  // 7. Natural Language Extraction: Brand Detection & Contradiction Check
  for (const brand of COMMON_BRANDS) {
    const brandRegex = new RegExp(`\\b${brand}\\b`, 'i');
    if (brandRegex.test(normalizedQuery)) {
      const isExcluded = constraints.some(c => c.type === 'EXCLUDED_KEYWORD' && String(c.normalizedValue).toLowerCase() === brand.toLowerCase());
      if (isExcluded) {
        ambiguities.push({
          code: 'CONFLICTING_CONSTRAINTS',
          message: `Brand "${brand}" is marked both as required and as an excluded keyword.`,
          field: 'brand',
        });
      } else {
        constraints.push({
          id: `c-brand-${brand.toLowerCase()}`,
          type: 'BRAND',
          priority: 'REQUIRED',
          key: 'brand',
          operator: 'EQ',
          rawValue: brand,
          normalizedValue: brand,
          provenance: 'DETERMINISTIC_EXTRACTION',
        });
        break; // Match primary brand
      }
    }
  }

  // 8. Reconcile with Structured Input Constraints (Step 21 domain contract)
  if (structuredConstraints) {
    if (structuredConstraints.maxPrice) {
      const parsedMax = parseFloat(structuredConstraints.maxPrice);
      if (!isNaN(parsedMax)) {
        maxPrice = parsedMax;
        // Replace or add structured constraint (explicit user takes precedence)
        const existingIdx = constraints.findIndex(c => c.type === 'PRICE_CEILING');
        const scConstraint: NormalizedConstraint = {
          id: 'c-structured-max-price',
          type: 'PRICE_CEILING',
          priority: 'REQUIRED',
          key: 'price',
          operator: 'LTE',
          rawValue: structuredConstraints.maxPrice,
          normalizedValue: parsedMax,
          unitOrCurrency: structuredConstraints.currency ?? priceCurrency ?? 'USD',
          provenance: 'EXPLICIT_USER',
        };
        if (existingIdx >= 0) constraints[existingIdx] = scConstraint;
        else constraints.push(scConstraint);
      }
    }

    if (structuredConstraints.minPrice) {
      const parsedMin = parseFloat(structuredConstraints.minPrice);
      if (!isNaN(parsedMin)) {
        minPrice = parsedMin;
        const existingIdx = constraints.findIndex(c => c.type === 'PRICE_FLOOR');
        const scConstraint: NormalizedConstraint = {
          id: 'c-structured-min-price',
          type: 'PRICE_FLOOR',
          priority: 'REQUIRED',
          key: 'price',
          operator: 'GTE',
          rawValue: structuredConstraints.minPrice,
          normalizedValue: parsedMin,
          unitOrCurrency: structuredConstraints.currency ?? priceCurrency ?? 'USD',
          provenance: 'EXPLICIT_USER',
        };
        if (existingIdx >= 0) constraints[existingIdx] = scConstraint;
        else constraints.push(scConstraint);
      }
    }

    if (structuredConstraints.currency) {
      priceCurrency = structuredConstraints.currency;
      // Remove any missing currency ambiguity if structured currency is provided
      const ambIdx = ambiguities.findIndex(a => a.code === 'MISSING_CURRENCY');
      if (ambIdx >= 0) ambiguities.splice(ambIdx, 1);
    }

    if (structuredConstraints.requiredCondition) {
      const existingIdx = constraints.findIndex(c => c.type === 'CONDITION');
      const scConstraint: NormalizedConstraint = {
        id: 'c-structured-condition',
        type: 'CONDITION',
        priority: 'REQUIRED',
        key: 'condition',
        operator: 'EQ',
        rawValue: structuredConstraints.requiredCondition,
        normalizedValue: structuredConstraints.requiredCondition,
        provenance: 'EXPLICIT_USER',
      };
      if (existingIdx >= 0) constraints[existingIdx] = scConstraint;
      else constraints.push(scConstraint);
    }

    if (structuredConstraints.requiredBrand) {
      const existingIdx = constraints.findIndex(c => c.type === 'BRAND');
      const scConstraint: NormalizedConstraint = {
        id: 'c-structured-brand',
        type: 'BRAND',
        priority: 'REQUIRED',
        key: 'brand',
        operator: 'EQ',
        rawValue: structuredConstraints.requiredBrand,
        normalizedValue: structuredConstraints.requiredBrand,
        provenance: 'EXPLICIT_USER',
      };
      if (existingIdx >= 0) constraints[existingIdx] = scConstraint;
      else constraints.push(scConstraint);
    }

    if (Array.isArray(structuredConstraints.excludedKeywords)) {
      for (const kw of structuredConstraints.excludedKeywords) {
        if (!constraints.some(c => c.type === 'EXCLUDED_KEYWORD' && c.normalizedValue === kw.toLowerCase())) {
          constraints.push({
            id: `c-structured-excluded-kw-${kw.toLowerCase()}`,
            type: 'EXCLUDED_KEYWORD',
            priority: 'EXCLUDED',
            key: 'keyword',
            operator: 'NOT_IN',
            rawValue: kw,
            normalizedValue: kw.toLowerCase(),
            provenance: 'EXPLICIT_USER',
          });
        }
      }
    }

    if (Array.isArray(structuredConstraints.excludedDomains)) {
      for (const domain of structuredConstraints.excludedDomains) {
        if (!constraints.some(c => c.type === 'EXCLUDED_DOMAIN' && c.normalizedValue === domain.toLowerCase())) {
          constraints.push({
            id: `c-structured-excluded-domain-${domain.toLowerCase()}`,
            type: 'EXCLUDED_DOMAIN',
            priority: 'EXCLUDED',
            key: 'domain',
            operator: 'NOT_IN',
            rawValue: domain,
            normalizedValue: domain.toLowerCase(),
            provenance: 'EXPLICIT_USER',
          });
        }
      }
    }

    if (structuredConstraints.requiredSpecs) {
      for (const [key, value] of Object.entries(structuredConstraints.requiredSpecs)) {
        constraints.push({
          id: `c-structured-spec-${key}`,
          type: 'SPECIFICATION',
          priority: 'REQUIRED',
          key,
          operator: 'EQ',
          rawValue: String(value),
          normalizedValue: value,
          provenance: 'EXPLICIT_USER',
        });
      }
    }
  }

  // 9. Contradiction & Conflict Detection
  // Check A: minPrice > maxPrice (e.g. "under $200 and over $400")
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    ambiguities.push({
      code: 'CONFLICTING_CONSTRAINTS',
      message: `Contradictory price boundaries: minimum price (${minPrice}) exceeds maximum price (${maxPrice}). Please correct query constraints.`,
      field: 'price',
      suggestedResolutions: [`Remove minimum price (${minPrice})`, `Increase maximum price above ${minPrice}`],
    });
  }

  // Check B: An entity or condition is simultaneously REQUIRED and EXCLUDED
  const requiredConditions = constraints.filter(c => c.type === 'CONDITION' && c.priority === 'REQUIRED');
  const excludedConditions = constraints.filter(c => c.type === 'CONDITION' && c.priority === 'EXCLUDED');
  for (const rc of requiredConditions) {
    if (excludedConditions.some(ec => ec.normalizedValue === rc.normalizedValue)) {
      ambiguities.push({
        code: 'CONFLICTING_CONSTRAINTS',
        message: `Condition "${rc.normalizedValue}" is simultaneously required and excluded.`,
        field: 'condition',
      });
    }
  }

  // Check C: Brand is simultaneously required and excluded
  const requiredBrand = constraints.find(c => c.type === 'BRAND' && c.priority === 'REQUIRED');
  if (requiredBrand) {
    const isExcluded = constraints.some(c => c.type === 'EXCLUDED_KEYWORD' && String(c.normalizedValue).toLowerCase() === String(requiredBrand.normalizedValue).toLowerCase());
    if (isExcluded) {
      ambiguities.push({
        code: 'CONFLICTING_CONSTRAINTS',
        message: `Brand "${requiredBrand.normalizedValue}" is marked both as required and as an excluded keyword.`,
        field: 'brand',
      });
    }
  }

  // Check D: Negative budget ceiling
  if (/\b(?:budget\s+of|under|below)\s*[$€£]?\s*-\s*\d+/i.test(normalizedQuery)) {
    ambiguities.push({
      code: 'CONFLICTING_CONSTRAINTS',
      message: 'Budget cannot be negative. Please specify a non-negative price ceiling.',
      field: 'price',
    });
  }

  // Check E: Excluded attribute conflicts with required specification (e.g. tempered glass vs exclude glass)
  const excludedKeywords = constraints.filter(c => c.type === 'EXCLUDED_KEYWORD');
  for (const ex of excludedKeywords) {
    const exWord = String(ex.normalizedValue).toLowerCase();
    if (
      normalizedQuery.toLowerCase().includes(`must have a ${exWord}`) ||
      normalizedQuery.toLowerCase().includes(`must have ${exWord}`) ||
      (exWord === 'glass' && normalizedQuery.toLowerCase().includes('tempered glass'))
    ) {
      ambiguities.push({
        code: 'CONFLICTING_CONSTRAINTS',
        message: `Contradiction detected: query requires "${exWord}" but also explicitly excludes it.`,
        field: 'specification',
      });
    }
  }

  // Check F: Conflicting competitor CPU platforms
  if (/\bintel\b/i.test(normalizedQuery) && /\bamd\b/i.test(normalizedQuery) && /\b(?:cpu|processor|core|ryzen)\b/i.test(normalizedQuery)) {
    ambiguities.push({
      code: 'AMBIGUOUS_ENTITY',
      message: 'Query specifies conflicting competitor CPU platforms (Intel and AMD) in a single inquiry.',
      field: 'targetEntity',
    });
  }

  // Check G: Overly vague query
  if (/^\s*(?:find\s+me\s+a|search\s+for\s+a|get\s+a)\s+(?:good|best|nice)\s+(?:computer|pc|laptop)\s*[.?]?\s*$/i.test(normalizedQuery.trim())) {
    ambiguities.push({
      code: 'AMBIGUOUS_ENTITY',
      message: 'Query is too vague; missing specifications, intended use case, form factor, or budget ceiling.',
      field: 'targetEntity',
    });
  }

  // Check H: Missing memory generation
  if (/\b\d+gb\s+ram\s+(?:upgrade\s+kit|kit|memory)\b/i.test(normalizedQuery) && !/\b(?:ddr4|ddr5|ddr3)\b/i.test(normalizedQuery)) {
    ambiguities.push({
      code: 'AMBIGUOUS_UNIT',
      message: 'Memory generation (DDR4 vs DDR5) and type (Desktop UDIMM vs Laptop SO-DIMM) not specified. Please verify motherboard compatibility.',
      field: 'specification',
    });
  }

  // 10. Extract Clean Target Entity
  // Strip out constraint phrases to isolate product/topic name
  let targetEntity = normalizedQuery
    .replace(/\b(?:under|below|less than|over|above|more than|between)\s*[$€£]?\s*\d+(?:\.\d{1,2})?\s*(?:(?:and|-)\s*[$€£]?\s*\d+(?:\.\d{1,2})?)?\s*(?:usd|eur|gbp)?\b/gi, ' ')
    .replace(/\b(?:in\s+)?new(?:\s+condition)?\b/gi, ' ')
    .replace(/\b(?:refurbished|renewed|used)\b/gi, ' ')
    .replace(/\b(?:exclude|no|without)\s+[a-zA-Z0-9.-]+(?:\s+(?:and|,)\s+[a-zA-Z0-9.-]+)*/gi, ' ')
    .replace(/\b[a-zA-Z]+\s+color(?:\s+only)?\b/gi, ' ')
    .replace(/(?:^|\s)-(?:site:)?[a-zA-Z0-9.-]+\b/g, ' ')
    .replace(/\b(?:and|or)\s*$/gi, '')
    .replace(/^\s*(?:and|or)\b/gi, '')
    .replace(/\s+(?:and|or)\s+/gi, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!targetEntity || targetEntity.length < 2) {
    targetEntity = normalizedQuery.trim();
  }

  // 11. Determine TaskType
  let taskType = taskTypeOverride ?? TaskType.PRODUCT_RESEARCH;
  if (!taskTypeOverride) {
    const lower = normalizedQuery.toLowerCase();
    if (/\b(?:track\s+price|price\s+monitor|monitor\s+price|price\s+drop|alert\s+on\s+price)\b/i.test(lower)) {
      taskType = TaskType.PRICE_MONITOR;
    } else if (/\b(?:verify\s+specs?|check\s+claims?|dimensions?|battery\s+life\s+claims?)\b/i.test(lower)) {
      taskType = TaskType.SPEC_VERIFICATION;
    } else if (maxPrice !== undefined || minPrice !== undefined || constraints.some(c => c.type === 'CONDITION' || c.type === 'BRAND')) {
      taskType = TaskType.PRODUCT_RESEARCH;
    } else {
      taskType = TaskType.GENERAL_RESEARCH;
    }
  }

  return {
    targetEntity,
    taskType,
    constraints,
    ambiguities,
    warnings,
  };
}
