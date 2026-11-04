import 'server-only';
import type { MonetaryValue, PriceType } from './contracts';

/**
 * Currency metadata mappings.
 * Ambiguous symbols (like '$') MUST map to null currency code unless explicitly qualified.
 */
interface CurrencyInfo {
  readonly code: string | null;
  readonly symbol: string;
}

const KNOWN_CURRENCY_PATTERNS: readonly { pattern: RegExp; info: CurrencyInfo }[] = [
  // Explicit US Dollar
  { pattern: /(?:\bUSD\b|US\$)/i, info: { code: 'USD', symbol: '$' } },
  // Explicit Canadian Dollar
  { pattern: /(?:\bCAD\b|CA\$|C\$)/i, info: { code: 'CAD', symbol: '$' } },
  // Explicit Australian Dollar
  { pattern: /(?:\bAUD\b|AU\$|A\$)/i, info: { code: 'AUD', symbol: '$' } },
  // Euro (unambiguous)
  { pattern: /(?:€|\bEUR\b)/i, info: { code: 'EUR', symbol: '€' } },
  // British Pound Sterling (unambiguous)
  { pattern: /(?:£|\bGBP\b)/i, info: { code: 'GBP', symbol: '£' } },
  // Japanese Yen
  { pattern: /\bJPY\b/i, info: { code: 'JPY', symbol: '¥' } },
  // Indian Rupee
  { pattern: /(?:₹|\bINR\b)/i, info: { code: 'INR', symbol: '₹' } },
  // Generic / Ambiguous Dollar sign: Code is NULL to prevent guessing USD
  { pattern: /\$/, info: { code: null, symbol: '$' } },
  // Generic Yen / Yuan sign without ISO code: Code is NULL
  { pattern: /¥/, info: { code: null, symbol: '¥' } },
];

/**
 * Normalizes number formats (handling both US "1,299.99" and EU "1.299,99").
 */
export function normalizeDecimalString(rawNumberStr: string): string | null {
  const cleaned = rawNumberStr.trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  // EU format with dot thousands and comma decimal: 1.234,56
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,4}$/.test(cleaned)) {
    return cleaned.replace(/\./g, '').replace(',', '.');
  }

  // US format with comma thousands and dot decimal: 1,234.56 or standard dot 1234.56
  if (/^\d{1,3}(?:,\d{3})*\.\d{1,4}$/.test(cleaned)) {
    return cleaned.replace(/,/g, '');
  }

  // Integer with comma thousand separators: 1,299 or 49,999 or 1,000,000
  if (/^\d{1,3}(?:,\d{3})+$/.test(cleaned)) {
    return cleaned.replace(/,/g, '');
  }

  // Comma as decimal separator without thousands dot: 1299,99 or 12,5 (typically 1 or 2 decimals)
  if (/^\d+,\d{1,2}$/.test(cleaned)) {
    return cleaned.replace(',', '.');
  }

  // Comma as decimal with 3 or 4 places (if not matching thousands grouping)
  if (/^\d+,\d{1,4}$/.test(cleaned)) {
    return cleaned.replace(',', '.');
  }

  // Plain integers or numbers with standard dot: 1299, 1299.99
  if (/^\d+(?:\.\d{1,4})?$/.test(cleaned)) {
    return cleaned;
  }

  // Clean remaining commas as thousand separators: 1,299 -> 1299
  const stripped = cleaned.replace(/,/g, '');
  if (/^\d+(?:\.\d{1,4})?$/.test(stripped)) {
    return stripped;
  }

  return null;
}

/**
 * Detects price type and billing interval from contextual words.
 */
function detectPriceTypeAndInterval(text: string): {
  priceType: PriceType;
  billingInterval?: 'MONTHLY' | 'YEARLY' | 'ONETIME';
  qualifiers: string[];
} {
  const lower = text.toLowerCase();
  const qualifiers: string[] = [];

  let billingInterval: 'MONTHLY' | 'YEARLY' | 'ONETIME' | undefined;
  if (/(?:\/mo|\/month|per\s+month|monthly)\b/.test(lower)) {
    billingInterval = 'MONTHLY';
  } else if (/(?:\/yr|\/year|per\s+year|annually|yearly)\b/.test(lower)) {
    billingInterval = 'YEARLY';
  } else if (/\bone-time\b/.test(lower)) {
    billingInterval = 'ONETIME';
  }

  if (/(?:refurbished|renewed|open\s+box|used)\b/.test(lower)) {
    qualifiers.push('refurbished_or_used');
  }
  if (/(?:estimated|approx|approximate|around|about)\b/.test(lower)) {
    qualifiers.push('approximate');
  }
  if (/(?:plus\s+tax|excl\.\s+tax|ex\s+tax|without\s+tax|before\s+tax)\b/.test(lower)) {
    qualifiers.push('excludes_tax');
  }
  if (/(?:free\s+shipping|includes\s+shipping)\b/.test(lower)) {
    qualifiers.push('includes_shipping');
  }

  if (billingInterval) {
    return { priceType: 'SUBSCRIPTION', billingInterval, qualifiers };
  }

  if (/(?:msrp|list\s+price|original\s+price|was\b|regular\s+price)/.test(lower)) {
    return { priceType: 'LIST', qualifiers };
  }

  if (/(?:sale|discount(?:ed)?|special\s+offer|now\s+only|save\b)/.test(lower)) {
    return { priceType: 'DISCOUNTED', qualifiers };
  }

  if (/(?:starting\s+at|from\b|as\s+low\s+as|starts\s+at)/.test(lower)) {
    return { priceType: 'STARTING_AT', qualifiers };
  }

  if (/(?:per\s+unit|each|\/ea|\/unit)\b/.test(lower)) {
    return { priceType: 'PER_UNIT', qualifiers };
  }

  return { priceType: 'CURRENT', qualifiers };
}

/**
 * Identifies currency symbol and ISO 4217 code.
 * If currency is ambiguous (e.g. bare '$'), currency is returned as null.
 */
export function identifyCurrency(text: string): CurrencyInfo {
  for (const { pattern, info } of KNOWN_CURRENCY_PATTERNS) {
    if (pattern.test(text)) {
      return info;
    }
  }
  return { code: null, symbol: '' };
}

/**
 * Parses raw text into a structured MonetaryValue.
 * Strict zero-currency-conversion policy: does not convert between currencies.
 */
export function parseMonetary(
  rawText: string,
  extraQualifiers: readonly string[] = [],
): MonetaryValue | null {
  if (!rawText || typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const { priceType, billingInterval, qualifiers: detectedQualifiers } = detectPriceTypeAndInterval(trimmed);
  const currencyInfo = identifyCurrency(trimmed);
  const isApproximate = detectedQualifiers.includes('approximate') || trimmed.includes('~');

  // Combined qualifiers
  const allQualifiers = Array.from(new Set([...detectedQualifiers, ...extraQualifiers]));

  // Check for Price Range pattern e.g. "$499 - $699", "€300 to €450", "1,200 - 1,500 USD"
  const rangePattern = /(?:[\$€£₹]\s*)?(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(?:[\$€£₹]\s*)?(\d+(?:[.,]\d+)?)/i;
  const rangeMatch = trimmed.match(rangePattern);

  if (rangeMatch && !billingInterval) {
    const rawMin = rangeMatch[1] ?? '';
    const rawMax = rangeMatch[2] ?? '';
    const normMin = normalizeDecimalString(rawMin);
    const normMax = normalizeDecimalString(rawMax);

    if (normMin && normMax) {
      return {
        rawText: trimmed,
        amount: normMin,
        currency: currencyInfo.code,
        currencySymbol: currencyInfo.symbol || null,
        priceType: 'RANGE',
        qualifiers: allQualifiers,
        isApproximate,
        isRange: true,
        rangeMin: normMin,
        rangeMax: normMax,
        ...(billingInterval ? { billingInterval } : {}),
      };
    }
  }

  // Single price pattern: locate the main monetary number
  // Match currency prefix/suffix and number
  const singleNumberPattern = /(?:[\$€£₹]|USD|CAD|AUD|EUR|GBP|INR|JPY)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,4})?|\d+(?:[.,]\d{1,4})?)/i;
  const match = trimmed.match(singleNumberPattern);

  if (!match || !match[1]) return null;

  const normAmount = normalizeDecimalString(match[1]);
  if (!normAmount) return null;

  return {
    rawText: trimmed,
    amount: normAmount,
    currency: currencyInfo.code,
    currencySymbol: currencyInfo.symbol || null,
    priceType,
    qualifiers: allQualifiers,
    isApproximate,
    isRange: false,
    ...(billingInterval ? { billingInterval } : {}),
  };
}
