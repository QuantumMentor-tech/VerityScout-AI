import { describe, it, expect, vi } from 'vitest';
import {
  ResearchPlannerService,
  getResearchPlannerService,
  normalizeQueryText,
  extractIntentAndConstraints,
  generateSearchQueryVariants,
  ResearchPlanSchema,
  ResearchPlanInputSchema,
} from '@/server/research/planner';
import { TaskType } from '@/server/persistence/types';
import type { AiProviderAdapter } from '@/server/providers/contracts/adapter';
import type { NormalizedInferenceResponse } from '@/server/providers/contracts/inference';

describe('Step 31: Research Query Parsing & Planning', () => {
  const plannerService = new ResearchPlannerService();

  describe('1. Normalization & Meaning Preservation Unit Tests', () => {
    it('normalizes redundant whitespace and Unicode without altering technical model names', () => {
      const raw = '   NVIDIA   GeForce   RTX   5090    \n\t  24GB   ';
      const result = normalizeQueryText(raw);

      expect(result.normalized).toBe('NVIDIA GeForce RTX 5090 24GB');
      expect(result.isModified).toBe(true);
    });

    it('preserves exact quoted phrases while collapsing surrounding whitespace', () => {
      const raw = '  AMD Ryzen 7 7800X3D   "zero dead pixels"   under  $450  ';
      const result = normalizeQueryText(raw);

      expect(result.normalized).toBe('AMD Ryzen 7 7800X3D "zero dead pixels" under $450');
      expect(result.preservedQuotes).toEqual(['zero dead pixels']);
    });

    it('preserves version numbers, generations, and spec units', () => {
      const raw = 'Lenovo ThinkPad X1 Carbon Gen 11 32GB RAM 1TB SSD Wi-Fi 7';
      const result = normalizeQueryText(raw);

      expect(result.normalized).toBe('Lenovo ThinkPad X1 Carbon Gen 11 32GB RAM 1TB SSD Wi-Fi 7');
      expect(result.isModified).toBe(false);
    });

    it('rejects empty or whitespace-only queries with a clear error', () => {
      expect(() => normalizeQueryText('')).toThrow(/cannot be empty/);
      expect(() => normalizeQueryText('    \t\n  ')).toThrow(/cannot be empty/);
    });

    it('rejects queries exceeding 1000 characters via ResearchPlanInputSchema', () => {
      const oversized = 'a'.repeat(1001);
      expect(() => ResearchPlanInputSchema.parse({ rawQuery: oversized })).toThrow(/exceeds 1000 character maximum/);
    });
  });

  describe('2. Constraint Extraction & AC-002 Fidelity Tests', () => {
    it('accurately parses AC-002 canonical benchmark query and extracts all 6 schema criteria', () => {
      const testQuery = 'Sony WH-1000XM5 headphones under $300 in new condition, black color only, exclude ebay and refurbished';
      const extracted = extractIntentAndConstraints(testQuery);

      // 1. Target Entity
      expect(extracted.targetEntity).toContain('Sony WH-1000XM5');

      // 2. Price Ceiling
      const priceCeiling = extracted.constraints.find(c => c.type === 'PRICE_CEILING');
      expect(priceCeiling).toBeDefined();
      expect(priceCeiling?.normalizedValue).toBe(300);
      expect(priceCeiling?.unitOrCurrency).toBe('USD');

      // 3. Condition: NEW
      const newCondition = extracted.constraints.find(c => c.type === 'CONDITION' && c.priority === 'REQUIRED');
      expect(newCondition).toBeDefined();
      expect(newCondition?.normalizedValue).toBe('NEW');

      // 4. Mandatory Specs: color black
      const colorSpec = extracted.constraints.find(c => c.type === 'SPECIFICATION' && c.key === 'color');
      expect(colorSpec).toBeDefined();
      expect(colorSpec?.normalizedValue).toBe('black');

      // 5. Excluded Attributes: refurbished
      const excludedRefurb = extracted.constraints.find(c => c.type === 'CONDITION' && c.priority === 'EXCLUDED');
      expect(excludedRefurb).toBeDefined();
      expect(excludedRefurb?.normalizedValue).toBe('REFURBISHED');

      // 6. Excluded Domains: ebay.com
      const excludedDomain = extracted.constraints.find(c => c.type === 'EXCLUDED_DOMAIN');
      expect(excludedDomain).toBeDefined();
      expect(excludedDomain?.normalizedValue).toBe('ebay.com');

      // Brand
      const brand = extracted.constraints.find(c => c.type === 'BRAND');
      expect(brand?.normalizedValue).toBe('Sony');
    });

    it('reconciles structured constraints input over text heuristics', () => {
      const query = 'Laptop under $1000';
      const structured = {
        maxPrice: '850.00',
        currency: 'EUR',
        requiredBrand: 'Dell',
        requiredCondition: 'NEW' as const,
        excludedDomains: ['amazon.com'],
        requiredSpecs: { ramGb: 32 },
      };

      const extracted = extractIntentAndConstraints(query, structured);

      const price = extracted.constraints.find(c => c.type === 'PRICE_CEILING');
      expect(price?.normalizedValue).toBe(850);
      expect(price?.unitOrCurrency).toBe('EUR');
      expect(price?.provenance).toBe('EXPLICIT_USER');

      const brand = extracted.constraints.find(c => c.type === 'BRAND');
      expect(brand?.normalizedValue).toBe('Dell');

      const spec = extracted.constraints.find(c => c.type === 'SPECIFICATION' && c.key === 'ramGb');
      expect(spec?.normalizedValue).toBe(32);
    });

    it('extracts price ranges correctly ("between $200 and $400")', () => {
      const query = 'ANC headphones between $200 and $400';
      const extracted = extractIntentAndConstraints(query);

      const floor = extracted.constraints.find(c => c.type === 'PRICE_FLOOR');
      const ceiling = extracted.constraints.find(c => c.type === 'PRICE_CEILING');

      expect(floor?.normalizedValue).toBe(200);
      expect(ceiling?.normalizedValue).toBe(400);
      expect(floor?.unitOrCurrency).toBe('USD');
      expect(ceiling?.unitOrCurrency).toBe('USD');
    });
  });

  describe('3. AC-003 Disambiguation & Contradiction Detection Tests', () => {
    it('flags MISSING_CURRENCY and sets status NEEDS_CLARIFICATION when price has no currency symbol or code', async () => {
      // AC-003 exact test action: "Find an RTX 4070 under 600"
      const plan = await plannerService.planResearch({
        rawQuery: 'Find an RTX 4070 under 600',
      });

      expect(plan.status).toBe('NEEDS_CLARIFICATION');
      expect(plan.ambiguities.some(a => a.code === 'MISSING_CURRENCY')).toBe(true);

      const currencyAmbiguity = plan.ambiguities.find(a => a.code === 'MISSING_CURRENCY');
      expect(currencyAmbiguity?.field).toBe('currency');
      expect(currencyAmbiguity?.suggestedResolutions).toContain('USD');
    });

    it('resolves currency ambiguity when explicit currency code is supplied in text', async () => {
      const plan = await plannerService.planResearch({
        rawQuery: 'Find an RTX 4070 under 600 USD',
      });

      expect(plan.status).toBe('READY');
      expect(plan.ambiguities.some(a => a.code === 'MISSING_CURRENCY')).toBe(false);

      const price = plan.intent.constraints.find(c => c.type === 'PRICE_CEILING');
      expect(price?.unitOrCurrency).toBe('USD');
    });

    it('detects contradictory price ranges (minPrice > maxPrice) and sets status INVALID', async () => {
      const plan = await plannerService.planResearch({
        rawQuery: 'Gaming laptop under $200 and over $400',
      });

      expect(plan.status).toBe('INVALID');
      const contradiction = plan.ambiguities.find(a => a.code === 'CONFLICTING_CONSTRAINTS');
      expect(contradiction).toBeDefined();
      expect(contradiction?.message).toContain('exceeds maximum price');
    });

    it('detects contradictory brand requirements (required vs excluded keyword)', async () => {
      const plan = await plannerService.planResearch({
        rawQuery: 'Sony headphones without Sony',
      });

      expect(plan.status).toBe('INVALID');
      expect(plan.ambiguities.some(a => a.code === 'CONFLICTING_CONSTRAINTS')).toBe(true);
    });
  });

  describe('4. AC-004 Query Formulation & Multi-Engine Expansion Tests', () => {
    it('generates between 2 and 5 diversified queries targeting distinct search angles', () => {
      // AC-004 exact test entity: "Lenovo ThinkPad X1 Carbon Gen 11"
      const variants = generateSearchQueryVariants(
        'Lenovo ThinkPad X1 Carbon Gen 11',
        'Lenovo ThinkPad X1 Carbon Gen 11',
        [
          {
            id: 'c-brand',
            type: 'BRAND',
            priority: 'REQUIRED',
            key: 'brand',
            operator: 'EQ',
            rawValue: 'Lenovo',
            normalizedValue: 'Lenovo',
            provenance: 'DETERMINISTIC_EXTRACTION',
          },
        ]
      );

      expect(variants.length).toBeGreaterThanOrEqual(2);
      expect(variants.length).toBeLessThanOrEqual(5);

      // Verify angles
      const angles = variants.map(v => v.angle);
      expect(angles).toContain('PRIMARY');
      expect(angles).toContain('SPECIFICATION_FOCUSED');
      expect(angles).toContain('PRICE_AND_DEALS');

      // Verify Primary Query
      const primary = variants.find(v => v.isPrimary);
      expect(primary).toBeDefined();
      expect(primary?.query).toBe('Lenovo ThinkPad X1 Carbon Gen 11');

      // Verify zero broken search syntax characters
      for (const v of variants) {
        expect(v.query).not.toMatch(/[<>{}[\]\\]/);
        expect(v.rationale).toBeTruthy();
      }
    });

    it('deduplicates queries and preserves stable ordering', () => {
      const variants = generateSearchQueryVariants(
        'Asus ROG Zephyrus G14',
        'Asus ROG Zephyrus G14',
        []
      );

      const queryStrings = variants.map(v => v.query.toLowerCase());
      const uniqueStrings = new Set(queryStrings);
      expect(queryStrings.length).toBe(uniqueStrings.size);
      expect(variants[0]?.isPrimary).toBe(true);
    });

    it('incorporates negative exclusion operators safely in retailer review queries', () => {
      const variants = generateSearchQueryVariants(
        'Sony WH-1000XM5',
        'Sony WH-1000XM5 exclude ebay',
        [
          {
            id: 'c-ex-ebay',
            type: 'EXCLUDED_DOMAIN',
            priority: 'EXCLUDED',
            key: 'domain',
            operator: 'NOT_IN',
            rawValue: 'ebay',
            normalizedValue: 'ebay.com',
            provenance: 'DETERMINISTIC_EXTRACTION',
          },
        ]
      );

      const retailerQuery = variants.find(v => v.angle === 'RETAILER_AGGREGATOR');
      expect(retailerQuery?.query).toContain('-site:ebay.com');
    });
  });

  describe('5. End-to-End Service & Schema Validation Tests', () => {
    it('generates a runtime-validated ResearchPlan conforming to ResearchPlanSchema', async () => {
      const plan = await plannerService.planResearch({
        rawQuery: 'Best noise-canceling headphones under $350 for travel',
      });

      // Zod validation throws if invalid
      const parsed = ResearchPlanSchema.parse(plan);
      expect(parsed.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(parsed.status).toBe('READY');
      expect(parsed.searchQueries.length).toBeGreaterThanOrEqual(2);
      expect(parsed.plannerVersion).toBe('1.0.0');
      expect(parsed.createdAt).toBeTruthy();
    });

    it('classifies TaskType accurately based on research intent keywords', async () => {
      const monitorPlan = await plannerService.planResearch({
        rawQuery: 'Track price drop on iPad Pro M4',
      });
      expect(monitorPlan.intent.taskType).toBe(TaskType.PRICE_MONITOR);

      const specPlan = await plannerService.planResearch({
        rawQuery: 'Verify claims regarding RTX 4090 dimensions and power draw',
      });
      expect(specPlan.intent.taskType).toBe(TaskType.SPEC_VERIFICATION);

      const productPlan = await plannerService.planResearch({
        rawQuery: 'Find a gaming monitor under $400',
      });
      expect(productPlan.intent.taskType).toBe(TaskType.PRODUCT_RESEARCH);
    });

    it('singleton getter returns shared instance', () => {
      const service1 = getResearchPlannerService();
      const service2 = getResearchPlannerService();
      expect(service1).toBe(service2);
    });
  });

  describe('6. Optional AI-Assisted Interpretation Seam Tests (Mocked)', () => {
    it('enhances targetEntity when AI adapter returns valid JSON without overwriting user constraints', async () => {
      const mockResponse: NormalizedInferenceResponse = {
        text: JSON.stringify({ targetEntity: 'Sony WH-1000XM5 Silver' }),
        finishReason: 'stop',
        modelRef: { providerId: 'openai', modelId: 'gpt-4o' },
        latencyMs: 150,
        completedAt: new Date().toISOString(),
      };

      const mockAdapter = {
        id: 'openai' as const,
        generateText: vi.fn().mockResolvedValue({
          success: true,
          data: mockResponse,
          latencyMs: 150,
        }),
      } as unknown as AiProviderAdapter;

      const plan = await plannerService.planResearch(
        {
          rawQuery: 'Sony WH-1000XM5 under $300 in new condition',
        },
        {
          aiAdapter: mockAdapter,
          userId: 'user-test-123',
        }
      );

      expect(mockAdapter.generateText).toHaveBeenCalledTimes(1);
      expect(plan.intent.targetEntity).toBe('Sony WH-1000XM5 Silver');
      expect(plan.intent.provenance).toBe('AI_INFERRED');

      // User price constraint is still strictly preserved
      const price = plan.intent.constraints.find(c => c.type === 'PRICE_CEILING');
      expect(price?.normalizedValue).toBe(300);
    });

    it('falls back safely to deterministic rules when AI adapter fails', async () => {
      const mockAdapter = {
        id: 'nim' as const,
        generateText: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'PROVIDER_UNAVAILABLE', message: 'NVIDIA service down' },
          latencyMs: 100,
        }),
      } as unknown as AiProviderAdapter;

      const plan = await plannerService.planResearch(
        {
          rawQuery: 'Lenovo ThinkPad X1 Carbon Gen 11',
        },
        {
          aiAdapter: mockAdapter,
          userId: 'user-test-123',
        }
      );

      expect(plan.status).toBe('READY');
      expect(plan.intent.targetEntity).toContain('ThinkPad X1 Carbon Gen 11');
      expect(plan.warnings.some(w => w.code === 'AI_PLANNING_FALLBACK')).toBe(true);
    });
  });
});
