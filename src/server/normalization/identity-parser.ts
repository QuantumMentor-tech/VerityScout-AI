import 'server-only';
import type { ProductCondition, ProductIdentityValue } from './contracts';

/**
 * Common promotional and SEO noise phrases to strip from product titles.
 */
const TITLE_NOISE_PATTERNS = [
  /\[[^\]]*(?:202[0-9]|newest|latest|upgraded|fast\s+shipping|hot|sale|best\s+seller)[^\]]*\]/gi,
  /\([^\)]*(?:202[0-9]|newest|latest|upgraded|fast\s+shipping|hot|sale|best\s+seller)[^\)]*\)/gi,
  /\b(?:best\s+seller|top\s+rated|hot\s+deal|save\s+now|clearance|limited\s+time)\b/gi,
  /\b(?:free\s+shipping|fast\s+delivery|100%\s+authentic)\b/gi,
  /\s{2,}/g,
];

/**
 * Known tech and consumer electronics brands for reliable extraction.
 */
const KNOWN_BRANDS = [
  'Apple',
  'Samsung',
  'Sony',
  'Dell',
  'Lenovo',
  'HP',
  'Asus',
  'Acer',
  'Microsoft',
  'Google',
  'LG',
  'Logitech',
  'Bose',
  'Sennheiser',
  'Anker',
  'Corsair',
  'Razer',
  'SteelSeries',
  'Audio-Technica',
  'Canon',
  'Nikon',
  'Fujifilm',
  'Panasonic',
  'JBL',
  'DJI',
  'Garmin',
  'Motorola',
  'OnePlus',
  'Xiaomi',
  'Intel',
  'AMD',
  'NVIDIA',
];

/**
 * Detects product condition from raw text.
 */
export function detectCondition(text: string): { condition: ProductCondition; qualifier?: string } {
  const lower = text.toLowerCase();

  if (/(?:refurbished|renewed|reconditioned|factory\s+recertified)/i.test(lower)) {
    return { condition: 'REFURBISHED', qualifier: 'refurbished' };
  }
  if (/(?:used|pre-owned|open\s*box|second\s*hand|like\s*new)/i.test(lower)) {
    return { condition: 'USED', qualifier: 'used' };
  }
  if (/(?:brand\s+new|sealed|new\s+in\s+box|factory\s+sealed|condition:\s*new)/i.test(lower)) {
    return { condition: 'NEW', qualifier: 'new' };
  }

  return { condition: 'UNKNOWN' };
}

/**
 * Cleans promotional noise while strictly preserving model tokens, generational indicators,
 * and variant numbers (e.g., 'Gen 2', 'Pro', 'Max', 'Ultra', 'Plus').
 */
export function cleanProductTitle(rawTitle: string): string {
  let cleaned = rawTitle;
  for (const pattern of TITLE_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  return cleaned.trim().replace(/\s{2,}/g, ' ');
}

/**
 * Extracts brand, model number, SKU, variant, and condition from text and subject context.
 */
export function parseProductIdentity(
  rawText: string,
  claimKey: string,
  subjectContext?: string,
): ProductIdentityValue {
  const trimmed = rawText.trim();
  const textToScan = subjectContext ? `${subjectContext} ${trimmed}` : trimmed;
  const qualifiers: string[] = [];

  // 1. Condition detection
  const { condition, qualifier: condQualifier } = detectCondition(textToScan);
  if (condQualifier) qualifiers.push(condQualifier);

  // 2. Brand detection
  let brand: string | null = null;
  for (const b of KNOWN_BRANDS) {
    const brandRegex = new RegExp(`\\b${b}\\b`, 'i');
    if (brandRegex.test(textToScan)) {
      brand = b;
      break;
    }
  }

  // 3. Model number & SKU extraction
  let modelNumber: string | null = null;
  let sku: string | null = null;

  const modelMatch = textToScan.match(/\b(?:model|model\s+number|model\s+no\.?|m\/n):\s*([a-zA-Z0-9_\-\/]+)\b/i);
  if (modelMatch && modelMatch[1]) {
    modelNumber = modelMatch[1].trim();
  }

  const skuMatch = textToScan.match(/\b(?:sku|part\s+number|p\/n|item\s+no\.?):\s*([a-zA-Z0-9_\-\/]+)\b/i);
  if (skuMatch && skuMatch[1]) {
    sku = skuMatch[1].trim();
  }

  // Common model alphanumeric patterns if no explicit prefix (e.g., "WH-1000XM5", "SM-S928B", "MK2L3LL/A")
  if (!modelNumber) {
    const genericModelMatch = textToScan.match(/\b([A-Z]{1,4}-[A-Z0-9]{3,8}(?:\/[A-Z0-9]+)?)\b/);
    if (genericModelMatch && genericModelMatch[1]) {
      modelNumber = genericModelMatch[1].trim();
    }
  }

  // 4. Product family & variant detection
  let productFamily: string | null = null;
  const familyMatch = textToScan.match(/\b(MacBook(?:\s+(?:Pro|Air))?|ThinkPad|Galaxy(?:\s+[SZA])?|Surface(?:\s+Pro)?|Pixel|Inspiron|Latitude|XPS)\b/i);
  if (familyMatch && familyMatch[1]) {
    productFamily = familyMatch[1].trim();
  }

  let variant: string | null = null;

  // Identify variant modifiers like "Pro Max", "Plus", "Ultra", "Gen 5", "Wi-Fi + Cellular"
  const variantMatch = textToScan.match(/\b(Pro\s+Max|Pro|Ultra|Plus|Mini|SE|Air|Lite|Gen\s+\d+|Generation\s+\d+)\b/i);
  if (variantMatch && variantMatch[1]) {
    variant = variantMatch[1].trim();
  }

  // Clean title
  const cleanTitle = cleanProductTitle(trimmed);

  // If claimKey specifically indicates an identity attribute
  if (claimKey.includes('brand') && !brand) {
    brand = cleanTitle;
  }
  if (claimKey.includes('model') && !modelNumber) {
    modelNumber = cleanTitle;
  }
  if (claimKey.includes('sku') && !sku) {
    sku = cleanTitle;
  }

  return {
    rawText: trimmed,
    cleanTitle,
    brand,
    modelNumber,
    sku,
    productFamily,
    variant,
    condition,
    qualifiers,
  };
}
