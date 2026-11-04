import { describe, it, expect } from 'vitest';
import type { ExtractedClaim } from '@/server/claims/contracts';
import { VerificationState } from '@/server/persistence/types';
import {
  NormalizedAttributeSchema,
  parseMeasurement,
  convertMeasurement,
  parseMonetary,
  normalizeDecimalString,
  cleanProductTitle,
  detectCondition,
  parseProductIdentity,
  normalizeClaim,
  getDefaultNormalizationService,
} from '@/server/normalization';

describe('Step 37: Product Identity, Price & Specification Normalization', () => {
  // ---------------------------------------------------------------------------
  // 1. Physical Dimension & Unit Normalization
  // ---------------------------------------------------------------------------
  describe('Unit and Measurement Normalization', () => {
    it('NORM-UNIT-001: Normalizes mass to canonical grams (g)', () => {
      const kgResult = parseMeasurement('1.4 kg');
      expect(kgResult).not.toBeNull();
      expect(kgResult?.dimension).toBe('MASS');
      expect(kgResult?.canonicalUnit).toBe('g');
      expect(kgResult?.magnitude).toBe(1400);

      const lbResult = parseMeasurement('5 lbs');
      expect(lbResult).not.toBeNull();
      expect(lbResult?.dimension).toBe('MASS');
      expect(lbResult?.canonicalUnit).toBe('g');
      expect(lbResult?.magnitude).toBeCloseTo(2267.96, 1);
    });

    it('NORM-UNIT-002: Normalizes length to canonical millimeters (mm)', () => {
      const cmResult = parseMeasurement('120 cm');
      expect(cmResult).not.toBeNull();
      expect(cmResult?.dimension).toBe('LENGTH');
      expect(cmResult?.canonicalUnit).toBe('mm');
      expect(cmResult?.magnitude).toBe(1200);

      const inResult = parseMeasurement('10 inches');
      expect(inResult).not.toBeNull();
      expect(inResult?.dimension).toBe('LENGTH');
      expect(inResult?.canonicalUnit).toBe('mm');
      expect(inResult?.magnitude).toBe(254);
    });

    it('NORM-UNIT-003: Normalizes display size to canonical inches (in)', () => {
      const displayResult = parseMeasurement('15.6"', 'DISPLAY_SIZE');
      expect(displayResult).not.toBeNull();
      expect(displayResult?.dimension).toBe('DISPLAY_SIZE');
      expect(displayResult?.canonicalUnit).toBe('in');
      expect(displayResult?.magnitude).toBe(15.6);
    });

    it('NORM-UNIT-004: Normalizes storage capacity to canonical GB (decimal base-10)', () => {
      const tbResult = parseMeasurement('1 TB', 'STORAGE');
      expect(tbResult).not.toBeNull();
      expect(tbResult?.dimension).toBe('STORAGE');
      expect(tbResult?.canonicalUnit).toBe('GB');
      expect(tbResult?.magnitude).toBe(1000);

      const gbResult = parseMeasurement('512 GB', 'STORAGE');
      expect(gbResult?.magnitude).toBe(512);
    });

    it('NORM-UNIT-005: Normalizes memory/RAM to canonical MB (binary base-2)', () => {
      const ramResult = parseMeasurement('16 GB', 'MEMORY');
      expect(ramResult).not.toBeNull();
      expect(ramResult?.dimension).toBe('MEMORY');
      expect(ramResult?.canonicalUnit).toBe('MB');
      expect(ramResult?.magnitude).toBe(16384);
    });

    it('NORM-UNIT-006: Captures ranges with nominal midpoint and range bounds', () => {
      const rangeResult = parseMeasurement('10 - 12 hours');
      expect(rangeResult).not.toBeNull();
      expect(rangeResult?.isRange).toBe(true);
      expect(rangeResult?.rangeMin).toBe(10);
      expect(rangeResult?.rangeMax).toBe(12);
      expect(rangeResult?.magnitude).toBe(11);
      expect(rangeResult?.canonicalUnit).toBe('hours');
    });

    it('NORM-UNIT-007: Captures bounds and approximations', () => {
      const upToResult = parseMeasurement('up to 14 hours');
      expect(upToResult?.isUpperBound).toBe(true);
      expect(upToResult?.magnitude).toBe(14);

      const approxResult = parseMeasurement('~1.4 kg');
      expect(approxResult?.isApproximate).toBe(true);
      expect(approxResult?.magnitude).toBe(1400);

      const minResult = parseMeasurement('at least 5 kg');
      expect(minResult?.isLowerBound).toBe(true);
      expect(minResult?.magnitude).toBe(5000);
    });

    it('NORM-UNIT-008: Strictly prohibits cross-dimensional conversions', () => {
      expect(() => {
        convertMeasurement(10, 'kg', 'mm');
      }).toThrow(/Cross-dimensional conversion strictly prohibited/);

      expect(() => {
        convertMeasurement(100, 'W', 'hours');
      }).toThrow(/Cross-dimensional conversion strictly prohibited/);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Monetary Normalization & Strict Zero Currency Conversion
  // ---------------------------------------------------------------------------
  describe('Price and Monetary Normalization', () => {
    it('NORM-PRICE-001: Normalizes US currency formatting ($1,299.99)', () => {
      const result = parseMonetary('$1,299.99');
      expect(result).not.toBeNull();
      expect(result?.amount).toBe('1299.99');
      expect(result?.currencySymbol).toBe('$');
      expect(result?.priceType).toBe('CURRENT');
    });

    it('NORM-PRICE-002: Normalizes European currency formatting (1.299,99 €)', () => {
      const result = parseMonetary('1.299,99 €');
      expect(result).not.toBeNull();
      expect(result?.amount).toBe('1299.99');
      expect(result?.currency).toBe('EUR');
      expect(result?.currencySymbol).toBe('€');
    });

    it('NORM-PRICE-003: Leaves ambiguous dollar sign as null currency code', () => {
      const result = parseMonetary('$799.00');
      expect(result).not.toBeNull();
      expect(result?.amount).toBe('799.00');
      expect(result?.currencySymbol).toBe('$');
      // Must NOT guess USD when bare $ is used
      expect(result?.currency).toBeNull();
    });

    it('NORM-PRICE-004: Resolves explicit currency codes (USD, CAD, AUD, GBP)', () => {
      const usdResult = parseMonetary('USD $799.00');
      expect(usdResult?.currency).toBe('USD');

      const cadResult = parseMonetary('CA$ 999.00');
      expect(cadResult?.currency).toBe('CAD');

      const gbpResult = parseMonetary('£450');
      expect(gbpResult?.currency).toBe('GBP');
      expect(gbpResult?.currencySymbol).toBe('£');
      expect(gbpResult?.amount).toBe('450');
    });

    it('NORM-PRICE-005: Classifies price types (LIST, DISCOUNTED, STARTING_AT, RANGE, SUBSCRIPTION)', () => {
      const msrp = parseMonetary('MSRP $1,299.00');
      expect(msrp?.priceType).toBe('LIST');

      const sale = parseMonetary('Sale Price: $899 (Save $400)');
      expect(sale?.priceType).toBe('DISCOUNTED');

      const starting = parseMonetary('Starting at $499.00');
      expect(starting?.priceType).toBe('STARTING_AT');

      const range = parseMonetary('$499 - $699');
      expect(range?.priceType).toBe('RANGE');
      expect(range?.isRange).toBe(true);
      expect(range?.rangeMin).toBe('499');
      expect(range?.rangeMax).toBe('699');

      const sub = parseMonetary('$15/month');
      expect(sub?.priceType).toBe('SUBSCRIPTION');
      expect(sub?.billingInterval).toBe('MONTHLY');
    });

    it('NORM-PRICE-006: Helper normalizeDecimalString handles international formats', () => {
      expect(normalizeDecimalString('1,499.99')).toBe('1499.99');
      expect(normalizeDecimalString('1.499,99')).toBe('1499.99');
      expect(normalizeDecimalString('799')).toBe('799');
      expect(normalizeDecimalString('  1 299,50 ')).toBe('1299.50');
    });

    it('NORM-PRICE-007: Handles non-numeric price expressions as UNRESOLVED', () => {
      const result = parseMonetary('Contact for quote');
      expect(result).toBeNull();
    });

    it('NORM-PRICE-008: Correctly extracts Indian Rupee and Japanese Yen', () => {
      const inr = parseMonetary('₹49,999');
      expect(inr?.currency).toBe('INR');
      expect(inr?.currencySymbol).toBe('₹');
      expect(inr?.amount).toBe('49999');

      const jpy = parseMonetary('JPY 15000');
      expect(jpy?.currency).toBe('JPY');
      expect(jpy?.amount).toBe('15000');
    });
  });

  // ---------------------------------------------------------------------------
  // Additional Dimension Tests
  // ---------------------------------------------------------------------------
  describe('Extended Dimension and Hardware Specs', () => {
    it('NORM-UNIT-009: Normalizes Frequency to GHz', () => {
      const ghz = parseMeasurement('3.5 GHz', 'FREQUENCY');
      expect(ghz?.magnitude).toBe(3.5);
      expect(ghz?.canonicalUnit).toBe('GHz');

      const mhz = parseMeasurement('3200 MHz', 'FREQUENCY');
      expect(mhz?.magnitude).toBe(3.2);
      expect(mhz?.canonicalUnit).toBe('GHz');
    });

    it('NORM-UNIT-010: Normalizes Power to W', () => {
      const watts = parseMeasurement('65 W', 'POWER');
      expect(watts?.magnitude).toBe(65);
      expect(watts?.canonicalUnit).toBe('W');

      const kw = parseMeasurement('1.5 kW', 'POWER');
      expect(kw?.magnitude).toBe(1500);
      expect(kw?.canonicalUnit).toBe('W');
    });

    it('NORM-UNIT-011: Normalizes Display Resolution to total pixels', () => {
      const res = parseMeasurement('1920x1080', 'RESOLUTION');
      expect(res?.magnitude).toBe(2073600);
      expect(res?.canonicalUnit).toBe('pixels');
    });

    it('NORM-UNIT-012: Handles binary IEC storage (TiB, GiB)', () => {
      const tib = parseMeasurement('1 TiB', 'STORAGE');
      expect(tib).not.toBeNull();
      expect(tib?.dimension).toBe('STORAGE');
      expect(tib?.canonicalUnit).toBe('GB');
      expect(tib?.magnitude).toBeCloseTo(1099.51, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Product Identity Normalization
  // ---------------------------------------------------------------------------
  describe('Product Identity and Condition Normalization', () => {
    it('NORM-IDENT-001: Cleans promotional noise while preserving model tokens', () => {
      const noisyTitle = '[2024 Newest] Sony WH-1000XM5 Wireless Headphones (Fast Shipping) Best Seller!';
      const cleaned = cleanProductTitle(noisyTitle);
      expect(cleaned).toContain('Sony WH-1000XM5');
      expect(cleaned).not.toContain('[2024 Newest]');
      expect(cleaned).not.toContain('Best Seller!');
    });

    it('NORM-IDENT-002: Detects condition states (NEW, REFURBISHED, USED)', () => {
      expect(detectCondition('Apple Certified Refurbished').condition).toBe('REFURBISHED');
      expect(detectCondition('Brand New in Box Factory Sealed').condition).toBe('NEW');
      expect(detectCondition('Open box, like new condition').condition).toBe('USED');
      expect(detectCondition('Sony WH-1000XM5').condition).toBe('UNKNOWN');
    });

    it('NORM-IDENT-003: Extracts brand, model number, SKU, variant, and condition', () => {
      const text = 'Dell XPS 15 9530 Laptop, Model: XPS9530-7188SLV-PUS, SKU: 6540012, Renewed';
      const parsed = parseProductIdentity(text, 'product_title');

      expect(parsed.brand).toBe('Dell');
      expect(parsed.modelNumber).toBe('XPS9530-7188SLV-PUS');
      expect(parsed.sku).toBe('6540012');
      expect(parsed.condition).toBe('REFURBISHED');
    });

    it('NORM-IDENT-004: Preserves distinct variant markers without collapsing', () => {
      const standard = parseProductIdentity('Fujifilm X100', 'product_name');
      const pro = parseProductIdentity('Fujifilm X100 Pro', 'product_name');
      const gen2 = parseProductIdentity('Fujifilm X100 Gen 2', 'product_name');

      expect(pro.variant).toBe('Pro');
      expect(gen2.variant).toBe('Gen 2');
      expect(standard.variant).toBeNull();
      // Ensure titles differ
      expect(pro.cleanTitle).not.toBe(standard.cleanTitle);
      expect(gen2.cleanTitle).not.toBe(pro.cleanTitle);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. End-to-End Claim Normalization & Comparable Attributes
  // ---------------------------------------------------------------------------
  describe('Claim Dispatcher & Comparable Attribute Generation', () => {
    const baseMockClaim: ExtractedClaim = {
      id: 'claim_123',
      sourceDocumentId: 'doc_456',
      runId: 'run_789',
      userId: 'user_abc',
      subject: 'MacBook Pro 14',
      claimKey: 'price',
      claimType: 'PRICE',
      extractedRawValue: '$1,299.99',
      polarity: 'POSITIVE',
      qualifiers: [],
      evidence: {
        verbatimQuote: 'Available now for $1,299.99 with free shipping',
        charOffsetStart: 19,
        charOffsetEnd: 28,
        groundingStatus: 'GROUNDED_EXACT',
        confidenceScore: 0.95,
      },
      extractionStatus: 'EXPLICIT',
      extractionMethod: 'REGEX_DETERMINISTIC',
      verificationState: VerificationState.SUPPORTED,
      extractedAt: new Date().toISOString(),
    };

    it('NORM-DISP-001: Dispatches PRICE claim to NormalizedAttribute and ComparableAttribute', () => {
      const { normalizedAttribute, comparableAttribute } = normalizeClaim(baseMockClaim);

      // Validate schema compliance
      const validated = NormalizedAttributeSchema.parse(normalizedAttribute);
      expect(validated.status).toBe('NORMALIZED');
      expect(validated.attributeType).toBe('MONETARY');
      expect(validated.claimId).toBe('claim_123');
      expect(validated.sourceDocumentId).toBe('doc_456');
      expect(validated.monetaryValue?.amount).toBe('1299.99');

      // Comparable attribute contract for Step 38
      expect(comparableAttribute.numericValue).toBe(1299.99);
      expect(comparableAttribute.decimalString).toBe('1299.99');
      expect(comparableAttribute.unit).toBe('$');
      expect(comparableAttribute.confidence).toBe(0.95);
    });

    it('NORM-DISP-002: Dispatches SPECIFICATION claim with unit conversion', () => {
      const specClaim: ExtractedClaim = {
        ...baseMockClaim,
        id: 'claim_spec_1',
        claimKey: 'weight',
        claimType: 'SPECIFICATION',
        extractedRawValue: '1.4 kg',
        evidence: {
          ...baseMockClaim.evidence,
          verbatimQuote: 'Weight: 1.4 kg',
        },
      };

      const { normalizedAttribute, comparableAttribute } = normalizeClaim(specClaim);
      expect(normalizedAttribute.status).toBe('NORMALIZED');
      expect(normalizedAttribute.attributeType).toBe('DIMENSION');
      expect(normalizedAttribute.measurementValue?.magnitude).toBe(1400);
      expect(normalizedAttribute.measurementValue?.canonicalUnit).toBe('g');

      expect(comparableAttribute.numericValue).toBe(1400);
      expect(comparableAttribute.unit).toBe('g');
    });

    it('NORM-DISP-003: Dispatches IDENTITY claim preserving condition and provenance', () => {
      const identClaim: ExtractedClaim = {
        ...baseMockClaim,
        id: 'claim_ident_1',
        claimKey: 'product_identity',
        claimType: 'PROPERTY',
        extractedRawValue: 'Apple MacBook Pro 14 (M3, 16GB, 512GB) - Space Gray, Refurbished',
        evidence: {
          ...baseMockClaim.evidence,
          verbatimQuote: 'Apple MacBook Pro 14 Refurbished',
        },
      };

      const { normalizedAttribute, comparableAttribute } = normalizeClaim(identClaim);
      expect(normalizedAttribute.status).toBe('NORMALIZED');
      expect(normalizedAttribute.attributeType).toBe('IDENTITY');
      expect(normalizedAttribute.identityValue?.brand).toBe('Apple');
      expect(normalizedAttribute.identityValue?.condition).toBe('REFURBISHED');

      expect(comparableAttribute.condition).toBe('REFURBISHED');
      expect(comparableAttribute.confidence).toBe(0.95);
    });

    it('NORM-DISP-004: Dispatches AVAILABILITY claim to categorical status', () => {
      const availClaim: ExtractedClaim = {
        ...baseMockClaim,
        id: 'claim_avail_1',
        claimKey: 'availability',
        claimType: 'AVAILABILITY',
        extractedRawValue: 'In Stock - Ready to Ship',
        evidence: {
          ...baseMockClaim.evidence,
          verbatimQuote: 'In Stock',
        },
      };

      const { normalizedAttribute, comparableAttribute } = normalizeClaim(availClaim);
      expect(normalizedAttribute.status).toBe('NORMALIZED');
      expect(normalizedAttribute.categoricalValue?.standardValue).toBe('IN_STOCK');
      expect(comparableAttribute.availability).toBe('IN_STOCK');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ProductNormalizationService Batch Execution
  // ---------------------------------------------------------------------------
  describe('ProductNormalizationService Execution', () => {
    it('NORM-SVC-001: Normalizes a batch of claims and returns structured summary', () => {
      const service = getDefaultNormalizationService();

      const claims: ExtractedClaim[] = [
        {
          id: 'c1',
          sourceDocumentId: 'd1',
          runId: 'r1',
          userId: 'u1',
          subject: 'Phone',
          claimKey: 'price',
          claimType: 'PRICE',
          extractedRawValue: '$999.00',
          polarity: 'POSITIVE',
          qualifiers: [],
          evidence: {
            verbatimQuote: '$999.00',
            charOffsetStart: 0,
            charOffsetEnd: 7,
            groundingStatus: 'GROUNDED_EXACT',
            confidenceScore: 0.9,
          },
          extractionStatus: 'EXPLICIT',
          extractionMethod: 'REGEX_DETERMINISTIC',
          verificationState: VerificationState.SUPPORTED,
          extractedAt: new Date().toISOString(),
        },
        {
          id: 'c2',
          sourceDocumentId: 'd1',
          runId: 'r1',
          userId: 'u1',
          subject: 'Phone',
          claimKey: 'battery_life',
          claimType: 'SPECIFICATION',
          extractedRawValue: '18 hours',
          polarity: 'POSITIVE',
          qualifiers: [],
          evidence: {
            verbatimQuote: '18 hours',
            charOffsetStart: 10,
            charOffsetEnd: 18,
            groundingStatus: 'GROUNDED_EXACT',
            confidenceScore: 0.85,
          },
          extractionStatus: 'EXPLICIT',
          extractionMethod: 'REGEX_DETERMINISTIC',
          verificationState: VerificationState.SUPPORTED,
          extractedAt: new Date().toISOString(),
        },
      ];

      const summary = service.normalizeClaims('r1', claims);

      expect(summary.runId).toBe('r1');
      expect(summary.totalClaimsProcessed).toBe(2);
      expect(summary.successfullyNormalized).toBe(2);
      expect(summary.unresolvedCount).toBe(0);
      expect(summary.attributes.length).toBe(2);
      expect(summary.comparableAttributes.length).toBe(2);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
