import { describe, it, expect } from 'vitest';
import { ModelPricingService, PRICING_VERSION } from '@/server/usage/pricing.service';
import { CostStatus } from '@/server/persistence/types';

describe('Cost Calculation & Pricing Service', () => {
  const pricingService = new ModelPricingService();

  describe('Known Catalog Pricing', () => {
    it('COST-001: Correctly calculates cost for gpt-4o ($2.50 / 1M in, $10.00 / 1M out)', () => {
      // 100,000 in = $0.25, 50,000 out = $0.50 => total $0.75
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o',
        inputTokens: 100_000,
        outputTokens: 50_000,
      });

      expect(result.costStatus).toBe(CostStatus.CALCULATED_ESTIMATE);
      expect(result.estimatedCostUsd).toBe('0.750000');
      expect(result.pricingVersion).toBe(PRICING_VERSION);
    });

    it('COST-002: Correctly calculates sub-cent micro-costs for gpt-4o-mini ($0.15 / 1M in, $0.60 / 1M out)', () => {
      // 1,000 in = $0.00015, 1,000 out = $0.00060 => total $0.00075
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o-mini',
        inputTokens: 1000,
        outputTokens: 1000,
      });

      expect(result.costStatus).toBe(CostStatus.CALCULATED_ESTIMATE);
      expect(result.estimatedCostUsd).toBe('0.000750');
    });

    it('COST-003: Computes exact single-token cost without floating point drift', () => {
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o',
        inputTokens: 1,
        outputTokens: 0,
      });

      expect(result.costStatus).toBe(CostStatus.CALCULATED_ESTIMATE);
      expect(typeof result.estimatedCostUsd).toBe('string');
      expect(parseFloat(result.estimatedCostUsd!)).toBeGreaterThan(0);
      expect(parseFloat(result.estimatedCostUsd!)).toBeLessThan(0.00001);
    });
  });

  describe('NVIDIA NIM & Free-Tier Models', () => {
    it('COST-004: Explicitly tracks NIM self-hosted developer containers as $0.000000 with note', () => {
      const result = pricingService.calculateCost({
        providerId: 'nim',
        modelId: 'meta/llama-3.1-70b-instruct',
        inputTokens: 5000,
        outputTokens: 1200,
      });

      expect(result.costStatus).toBe(CostStatus.CALCULATED_ESTIMATE);
      expect(result.estimatedCostUsd).toBe('0.000000');
      expect(result.costExplanation).toContain('zero marginal cloud fee');
    });
  });

  describe('Unpriced and Unknown Catalog Models', () => {
    it('COST-005: Returns UNKNOWN_COST and null estimatedCostUsd when model is not in catalog', () => {
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'future-unreleased-model-99',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(result.costStatus).toBe(CostStatus.UNKNOWN_COST);
      expect(result.estimatedCostUsd).toBeNull();
      expect(result.costExplanation).toContain('Missing catalog pricing');
    });

    it('COST-006: Does not turn missing token usage into $0.00', () => {
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o',
        inputTokens: null,
        outputTokens: null,
      });

      expect(result.costStatus).toBe(CostStatus.UNKNOWN_COST);
      expect(result.estimatedCostUsd).toBeNull();
    });
  });

  describe('Provider Reported Override', () => {
    it('COST-007: Prioritizes verified provider-reported cost over local estimate', () => {
      const result = pricingService.calculateCost({
        providerId: 'openrouter',
        modelId: 'anthropic/claude-3.5-sonnet',
        inputTokens: 1000,
        outputTokens: 500,
        providerReportedCost: '0.004215',
      });

      expect(result.costStatus).toBe(CostStatus.PROVIDER_REPORTED_COST);
      expect(result.estimatedCostUsd).toBe('0.004215');
      expect(result.providerCostUsd).toBe('0.004215');
    });
  });
});
