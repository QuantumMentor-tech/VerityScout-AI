import 'server-only';

/**
 * VerityScout AI — Conservative Query Normalizer
 * Governed by: Step 31 (Research Query Parsing, Constraint-Aware Query Planning, and Search Intent Normalization)
 *
 * Principles:
 * 1. Conservative normalization: never alter intended meaning, product models, or technical identifiers.
 * 2. Standardize Unicode using NFKC.
 * 3. Collapse redundant whitespace outside of quoted phrases.
 * 4. Strictly preserve:
 *    - Model numbers & identifiers: "RTX 5090", "Ryzen 7 7800X3D", "WH-1000XM5", "M3 Max"
 *    - Technical abbreviations, specs & units: "16GB", "320mm", "750W", "144Hz", "Wi-Fi 7", "Gen 11"
 *    - Quoted phrases: '"black color only"', '"zero dead pixels"'
 *    - Negations and exclusion tokens: "not", "without", "exclude", "-refurbished"
 *    - Currency symbols and codes: "$", "€", "£", "USD", "EUR", "GBP"
 */

export interface NormalizedQueryResult {
  readonly normalized: string;
  readonly isModified: boolean;
  readonly preservedQuotes: readonly string[];
}

/**
 * Normalizes user research queries conservatively without stripping meaning.
 */
export function normalizeQueryText(rawQuery: string): NormalizedQueryResult {
  if (!rawQuery || !rawQuery.trim()) {
    throw new Error('Research query cannot be empty or whitespace-only');
  }

  // 1. Unicode Normalization (NFKC compatibility decomposition + canonical composition)
  const unicodeNormalized = rawQuery.normalize('NFKC');

  // 2. Extract and protect quoted phrases
  const quotes: string[] = [];
  const quotePlaceholderPrefix = '___VS_QUOTE_';
  let quoteIndex = 0;

  const textWithPlaceholders = unicodeNormalized.replace(/"([^"]*)"|'([^']*)'/g, (_match, doubleQuoteContent, singleQuoteContent) => {
    const content = doubleQuoteContent !== undefined ? doubleQuoteContent : singleQuoteContent;
    quotes.push(content);
    const placeholder = `${quotePlaceholderPrefix}${quoteIndex}___`;
    quoteIndex++;
    return `"${placeholder}"`;
  });

  // 3. Trim and collapse repeated whitespace (spaces, tabs, newlines) outside quotes
  let collapsed = textWithPlaceholders
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();

  // 4. Restore preserved quoted phrases
  for (let i = 0; i < quotes.length; i++) {
    const placeholder = `${quotePlaceholderPrefix}${i}___`;
    const originalQuote = quotes[i] ?? '';
    collapsed = collapsed.replace(placeholder, originalQuote);
  }

  const isModified = collapsed !== rawQuery;

  return {
    normalized: collapsed,
    isModified,
    preservedQuotes: quotes,
  };
}
