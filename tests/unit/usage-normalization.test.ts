import { describe, it, expect } from 'vitest';
import {
  UsageAccountingService,
  ModelPricingService,
} from '@/server/usage';
import { CostStatus } from '@/server/persistence/types';

describe('Usage Normalization and Validation', () => {
  const pricingService = new ModelPricingService();

  describe('Pricing Service Cost Normalization', () => {
    it('NORM-001: Identifies CALCULATED_ESTIMATE when input and output tokens are present', () => {
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(result.costStatus).toBe(CostStatus.CALCULATED_ESTIMATE);
      expect(result.estimatedCostUsd).not.toBeNull();
      expect(result.currency).toBe('USD');
      expect(result.costExplanation).toContain('1000 input');
    });

    it('NORM-002: Identifies UNKNOWN_COST when output tokens are missing', () => {
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o',
        inputTokens: 500,
        outputTokens: null,
      });

      expect(result.costStatus).toBe(CostStatus.UNKNOWN_COST);
      expect(result.estimatedCostUsd).toBeNull();
      expect(result.costExplanation).toContain('Incomplete token usage');
    });

    it('NORM-003: Identifies UNKNOWN_COST when input tokens are missing', () => {
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o',
        inputTokens: null,
        outputTokens: 300,
      });

      expect(result.costStatus).toBe(CostStatus.UNKNOWN_COST);
      expect(result.estimatedCostUsd).toBeNull();
      expect(result.costExplanation).toContain('Incomplete token usage');
    });

    it('NORM-004: Identifies UNKNOWN_COST when both token counts are null', () => {
      const result = pricingService.calculateCost({
        providerId: 'openai',
        modelId: 'gpt-4o',
        inputTokens: null,
        outputTokens: null,
      });

      expect(result.costStatus).toBe(CostStatus.UNKNOWN_COST);
      expect(result.estimatedCostUsd).toBeNull();
    });

    it('NORM-005: Preserves provider-reported monetary cost when supplied', () => {
      const result = pricingService.calculateCost({
        providerId: 'openrouter',
        modelId: 'anthropic/claude-3.5-sonnet',
        inputTokens: 2000,
        outputTokens: 800,
        providerReportedCost: '0.018000',
      });

      expect(result.costStatus).toBe(CostStatus.PROVIDER_REPORTED_COST);
      expect(result.estimatedCostUsd).toBe('0.018000');
      expect(result.providerCostUsd).toBe('0.018000');
    });
  });

  describe('Token Validation Rules', () => {
    const usageAccountingService = new UsageAccountingService({
      usageRepo: {} as any,
      runRepo: {} as any,
      pricingService,
    });

    it('VAL-001: Throws validation error for negative input tokens', async () => {
      await expect(
        usageAccountingService.recordInferenceUsage({
          runId: '11111111-1111-4111-a111-111111111111',
          taskId: '22222222-2222-4222-a222-222222222222',
          userId: '33333333-3333-4333-a333-333333333333',
          operationType: 'claim_extraction',
          providerId: 'openai',
          modelId: 'gpt-4o',
          inputTokens: -5,
          outputTokens: 10,
        })
      ).rejects.toThrow('Invalid input tokens: -5');
    });

    it('VAL-002: Throws validation error for negative output tokens', async () => {
      await expect(
        usageAccountingService.recordInferenceUsage({
          runId: '11111111-1111-4111-a111-111111111111',
          taskId: '22222222-2222-4222-a222-222222222222',
          userId: '33333333-3333-4333-a333-333333333333',
          operationType: 'claim_extraction',
          providerId: 'openai',
          modelId: 'gpt-4o',
          inputTokens: 10,
          outputTokens: -1,
        })
      ).rejects.toThrow('Invalid output tokens: -1');
    });

    it('VAL-003: Throws validation error for non-integer tokens', async () => {
      await expect(
        usageAccountingService.recordInferenceUsage({
          runId: '11111111-1111-4111-a111-111111111111',
          taskId: '22222222-2222-4222-a222-222222222222',
          userId: '33333333-3333-4333-a333-333333333333',
          operationType: 'claim_extraction',
          providerId: 'openai',
          modelId: 'gpt-4o',
          inputTokens: 12.34 as any,
          outputTokens: 10,
        })
      ).rejects.toThrow('Invalid input tokens: 12.34');
    });
  });
});
