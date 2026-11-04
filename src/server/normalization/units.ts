import 'server-only';
import type { MeasurementDimension, MeasurementValue } from './contracts';

/**
 * Unit conversion definition for physical dimensions.
 */
interface UnitDefinition {
  readonly canonicalUnit: string;
  readonly dimension: MeasurementDimension;
  readonly factorToCanonical: number; // multiply original unit magnitude by this to get canonical
  readonly aliases: readonly string[];
}

/**
 * Canonical units for each supported dimension:
 * - MASS: 'g' (grams)
 * - LENGTH: 'mm' (millimeters)
 * - DISPLAY_SIZE: 'in' (inches)
 * - STORAGE: 'GB' (gigabytes, decimal SI standard)
 * - MEMORY: 'MB' (megabytes, binary 1024 standard for RAM)
 * - DURATION: 'hours'
 * - FREQUENCY: 'GHz'
 * - POWER: 'W' (watts)
 * - COUNT: 'count'
 */
const CANONICAL_UNITS: Record<MeasurementDimension, string> = {
  MASS: 'g',
  LENGTH: 'mm',
  DISPLAY_SIZE: 'in',
  STORAGE: 'GB',
  MEMORY: 'MB',
  DURATION: 'hours',
  FREQUENCY: 'GHz',
  POWER: 'W',
  RESOLUTION: 'pixels',
  COUNT: 'count',
  CUSTOM: 'unit',
};

const UNIT_DEFINITIONS: readonly UnitDefinition[] = [
  // MASS (canonical: g)
  { canonicalUnit: 'g', dimension: 'MASS', factorToCanonical: 1, aliases: ['g', 'gram', 'grams'] },
  { canonicalUnit: 'g', dimension: 'MASS', factorToCanonical: 0.001, aliases: ['mg', 'milligram', 'milligrams'] },
  { canonicalUnit: 'g', dimension: 'MASS', factorToCanonical: 1000, aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  { canonicalUnit: 'g', dimension: 'MASS', factorToCanonical: 28.349523125, aliases: ['oz', 'ounce', 'ounces'] },
  { canonicalUnit: 'g', dimension: 'MASS', factorToCanonical: 453.59237, aliases: ['lb', 'lbs', 'pound', 'pounds'] },

  // LENGTH (canonical: mm)
  { canonicalUnit: 'mm', dimension: 'LENGTH', factorToCanonical: 1, aliases: ['mm', 'millimeter', 'millimeters'] },
  { canonicalUnit: 'mm', dimension: 'LENGTH', factorToCanonical: 10, aliases: ['cm', 'centimeter', 'centimeters'] },
  { canonicalUnit: 'mm', dimension: 'LENGTH', factorToCanonical: 1000, aliases: ['m', 'meter', 'meters'] },
  { canonicalUnit: 'mm', dimension: 'LENGTH', factorToCanonical: 25.4, aliases: ['in', 'inch', 'inches', '"'] },
  { canonicalUnit: 'mm', dimension: 'LENGTH', factorToCanonical: 304.8, aliases: ['ft', 'foot', 'feet', '\''] },

  // DISPLAY_SIZE (canonical: in)
  { canonicalUnit: 'in', dimension: 'DISPLAY_SIZE', factorToCanonical: 1, aliases: ['in', 'inch', 'inches', '"', '-inch'] },
  { canonicalUnit: 'in', dimension: 'DISPLAY_SIZE', factorToCanonical: 1 / 25.4, aliases: ['mm'] },
  { canonicalUnit: 'in', dimension: 'DISPLAY_SIZE', factorToCanonical: 1 / 2.54, aliases: ['cm'] },

  // STORAGE (canonical: GB, decimal base-10 standard for drive manufacturers)
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: 1e-9, aliases: ['b', 'byte', 'bytes'] },
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: 1e-6, aliases: ['kb', 'kilobyte', 'kilobytes'] },
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: 1e-3, aliases: ['mb', 'megabyte', 'megabytes'] },
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: 1, aliases: ['gb', 'gigabyte', 'gigabytes'] },
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: 1000, aliases: ['tb', 'terabyte', 'terabytes'] },
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: 1e6, aliases: ['pb', 'petabyte', 'petabytes'] },
  // IEC binary units
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: (1024 ** 2) / 1e9, aliases: ['mib'] },
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: (1024 ** 3) / 1e9, aliases: ['gib'] },
  { canonicalUnit: 'GB', dimension: 'STORAGE', factorToCanonical: (1024 ** 4) / 1e9, aliases: ['tib'] },

  // MEMORY (canonical: MB, standard binary base-2 for RAM modules)
  { canonicalUnit: 'MB', dimension: 'MEMORY', factorToCanonical: 1 / 1024, aliases: ['kb', 'kib'] },
  { canonicalUnit: 'MB', dimension: 'MEMORY', factorToCanonical: 1, aliases: ['mb', 'mib', 'megabyte', 'megabytes'] },
  { canonicalUnit: 'MB', dimension: 'MEMORY', factorToCanonical: 1024, aliases: ['gb', 'gib', 'gigabyte', 'gigabytes'] },
  { canonicalUnit: 'MB', dimension: 'MEMORY', factorToCanonical: 1024 * 1024, aliases: ['tb', 'tib', 'terabyte', 'terabytes'] },

  // DURATION (canonical: hours)
  { canonicalUnit: 'hours', dimension: 'DURATION', factorToCanonical: 1 / 3600, aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
  { canonicalUnit: 'hours', dimension: 'DURATION', factorToCanonical: 1 / 60, aliases: ['m', 'min', 'mins', 'minute', 'minutes'] },
  { canonicalUnit: 'hours', dimension: 'DURATION', factorToCanonical: 1, aliases: ['h', 'hr', 'hrs', 'hour', 'hours'] },
  { canonicalUnit: 'hours', dimension: 'DURATION', factorToCanonical: 24, aliases: ['d', 'day', 'days'] },

  // FREQUENCY (canonical: GHz)
  { canonicalUnit: 'GHz', dimension: 'FREQUENCY', factorToCanonical: 1e-9, aliases: ['hz', 'hertz'] },
  { canonicalUnit: 'GHz', dimension: 'FREQUENCY', factorToCanonical: 1e-6, aliases: ['khz', 'kilohertz'] },
  { canonicalUnit: 'GHz', dimension: 'FREQUENCY', factorToCanonical: 1e-3, aliases: ['mhz', 'megahertz'] },
  { canonicalUnit: 'GHz', dimension: 'FREQUENCY', factorToCanonical: 1, aliases: ['ghz', 'gigahertz'] },
  { canonicalUnit: 'GHz', dimension: 'FREQUENCY', factorToCanonical: 1000, aliases: ['thz', 'terahertz'] },

  // POWER (canonical: W)
  { canonicalUnit: 'W', dimension: 'POWER', factorToCanonical: 0.001, aliases: ['mw', 'milliwatt', 'milliwatts'] },
  { canonicalUnit: 'W', dimension: 'POWER', factorToCanonical: 1, aliases: ['w', 'watt', 'watts'] },
  { canonicalUnit: 'W', dimension: 'POWER', factorToCanonical: 1000, aliases: ['kw', 'kilowatt', 'kilowatts'] },
  { canonicalUnit: 'W', dimension: 'POWER', factorToCanonical: 745.699872, aliases: ['hp', 'horsepower'] },

  // COUNT (canonical: count)
  { canonicalUnit: 'count', dimension: 'COUNT', factorToCanonical: 1, aliases: ['core', 'cores', 'count', 'unit', 'units', 'port', 'ports'] },
];

/**
 * Normalizes unit alias text for lookup.
 */
function normalizeUnitString(unit: string): string {
  return unit.toLowerCase().trim().replace(/^[.\s]+|[.\s]+$/g, '');
}

/**
 * Finds a unit definition matching the alias, optionally constrained by expected dimension.
 */
export function lookupUnitDefinition(unitAlias: string, expectedDimension?: MeasurementDimension): UnitDefinition | undefined {
  const normalized = normalizeUnitString(unitAlias);
  
  if (expectedDimension) {
    const match = UNIT_DEFINITIONS.find(
      (u) => u.dimension === expectedDimension && u.aliases.includes(normalized),
    );
    if (match) return match;
  }

  return UNIT_DEFINITIONS.find((u) => u.aliases.includes(normalized));
}

/**
 * Converts a measurement value into the canonical unit for its dimension,
 * strictly rejecting cross-dimensional conversions.
 */
export function convertMeasurement(
  magnitude: number,
  fromUnit: string,
  toUnit: string,
  expectedDimension?: MeasurementDimension,
): { convertedMagnitude: number; dimension: MeasurementDimension; factor: number } {
  const fromDef = lookupUnitDefinition(fromUnit, expectedDimension);
  if (!fromDef) {
    throw new Error(`Unsupported source unit: "${fromUnit}"`);
  }

  const toDef = lookupUnitDefinition(toUnit, fromDef.dimension);
  if (!toDef) {
    throw new Error(`Unsupported target unit: "${toUnit}" for dimension ${fromDef.dimension}`);
  }

  if (fromDef.dimension !== toDef.dimension) {
    throw new Error(
      `Cross-dimensional conversion strictly prohibited: cannot convert ${fromDef.dimension} (${fromUnit}) to ${toDef.dimension} (${toUnit})`,
    );
  }

  // Convert from source unit to canonical, then canonical to target unit
  const magnitudeInCanonical = magnitude * fromDef.factorToCanonical;
  const convertedMagnitude = magnitudeInCanonical / toDef.factorToCanonical;
  const factor = fromDef.factorToCanonical / toDef.factorToCanonical;

  return {
    convertedMagnitude,
    dimension: fromDef.dimension,
    factor,
  };
}

/**
 * Parses raw text into a structured MeasurementValue.
 * Supports:
 * - Magnitudes: "1.4 kg", "120 cm", "500 GB"
 * - Ranges: "10-12 hours", "10 to 12 hours", "1.2 - 1.5 kg"
 * - Bounds: "up to 14 hours", "max 100 kg", "at least 5 GB"
 * - Approximations: "~1.4 kg", "approx 500 MB", "about 10 hours"
 */
export function parseMeasurement(
  rawText: string,
  hintDimension?: MeasurementDimension,
): MeasurementValue | null {
  if (!rawText || typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  const isApproximate = /(?:~|approx\.?|approximately|about|around)/i.test(lower);
  const isUpperBound = /^(?:up\s+to|max\.?|maximum|at\s+most|<=?)\s*/i.test(lower);
  const isLowerBound = /^(?:at\s+least|min\.?|minimum|from|>=?)\s*/i.test(lower);

  // Clean qualifier prefixes
  const cleaned = lower
    .replace(/^(?:~|approx\.?|approximately|about|around)\s*/i, '')
    .replace(/^(?:up\s+to|max\.?|maximum|at\s+most|<=?)\s*/i, '')
    .replace(/^(?:at\s+least|min\.?|minimum|from|>=?)\s*/i, '')
    .replace(/^~/, '')
    .trim();

  // Pattern 1: Range "10 - 12 hours", "10 to 12 hrs", "1.2-1.5kg"
  const rangeRegex = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z"'\-]+)$/i;
  const rangeMatch = cleaned.match(rangeRegex);

  if (rangeMatch) {
    const minVal = parseFloat(rangeMatch[1] ?? '0');
    const maxVal = parseFloat(rangeMatch[2] ?? '0');
    const unitRaw = rangeMatch[3] ?? '';

    const unitDef = lookupUnitDefinition(unitRaw, hintDimension);
    if (!unitDef) return null;

    const canonicalUnit = CANONICAL_UNITS[unitDef.dimension];
    const rangeMinCanonical = minVal * unitDef.factorToCanonical;
    const rangeMaxCanonical = maxVal * unitDef.factorToCanonical;
    const nominal = (rangeMinCanonical + rangeMaxCanonical) / 2;

    return {
      rawText: trimmed,
      magnitude: nominal,
      canonicalUnit,
      originalUnit: unitRaw,
      dimension: unitDef.dimension,
      isApproximate,
      isRange: true,
      rangeMin: rangeMinCanonical,
      rangeMax: rangeMaxCanonical,
      isUpperBound,
      isLowerBound,
      conversionFactorApplied: unitDef.factorToCanonical,
    };
  }

  // Pattern 2: Single magnitude with unit "1.4 kg", "14hours", "15.6\"", "512 GB"
  const singleRegex = /^(\d+(?:\.\d+)?)\s*([a-zA-Z"'\-]+)$/i;
  const singleMatch = cleaned.match(singleRegex);

  if (singleMatch) {
    const rawMag = parseFloat(singleMatch[1] ?? '0');
    const unitRaw = singleMatch[2] ?? '';

    const unitDef = lookupUnitDefinition(unitRaw, hintDimension);
    if (!unitDef) return null;

    const canonicalUnit = CANONICAL_UNITS[unitDef.dimension];
    const canonicalMagnitude = rawMag * unitDef.factorToCanonical;

    return {
      rawText: trimmed,
      magnitude: canonicalMagnitude,
      canonicalUnit,
      originalUnit: unitRaw,
      dimension: unitDef.dimension,
      isApproximate,
      isRange: false,
      isUpperBound,
      isLowerBound,
      conversionFactorApplied: unitDef.factorToCanonical,
    };
  }

  // Pattern 3: Display resolution e.g. "1920x1080", "2560 x 1440"
  const resRegex = /^(\d{3,5})\s*[x×]\s*(\d{3,5})$/i;
  const resMatch = cleaned.match(resRegex);
  if (resMatch && (!hintDimension || hintDimension === 'RESOLUTION')) {
    const w = parseInt(resMatch[1] ?? '0', 10);
    const h = parseInt(resMatch[2] ?? '0', 10);
    const totalPixels = w * h;

    return {
      rawText: trimmed,
      magnitude: totalPixels,
      canonicalUnit: 'pixels',
      originalUnit: `${w}x${h}`,
      dimension: 'RESOLUTION',
      isApproximate,
      isRange: false,
      isUpperBound,
      isLowerBound,
      conversionFactorApplied: 1,
    };
  }

  return null;
}
