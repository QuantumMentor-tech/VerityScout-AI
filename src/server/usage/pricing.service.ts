import 'server-only';
import { STATIC_BUNDLED_CATALOG } from '@/server/models/static-catalog';
import type { CostStatus } from '@/server/persistence/types';

export interface ModelPricingRate {
  readonly providerId: string;
  readonly modelId: string;
  readonly promptCostPer1MUsd?: number | undefined;
  readonly completionCostPer1MUsd?: number | undefined;
  readonly currency: string;
  readonly pricingVersion: string;
  readonly source: string;
  readonly isFreeTier?: boolean | undefined;
}

export interface CostCalculationInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly inputTokens?: number | null | undefined;
  readonly outputTokens?: number | null | undefined;
  readonly providerReportedCost?: number | string | null | undefined;
}

export interface CostCalculationResult {
  readonly costStatus: CostStatus;
  readonly estimatedCostUsd: string | null;
  readonly providerCostUsd: string | null;
  readonly currency: string;
  readonly pricingVersion: string | null;
  readonly costExplanation: string;
}

export const PRICING_VERSION = '2026-11-catalog-v1';

export class ModelPricingService {
  private readonly rates = new Map<string, ModelPricingRate>();

  constructor() {
    this.initializeFromCatalog();
  }

  private initializeFromCatalog(): void {
    for (const entry of STATIC_BUNDLED_CATALOG) {
      const key = this.getRateKey(entry.providerId, entry.nativeModelId);
      const isNim = entry.providerId === 'nim';

      if (entry.pricing) {
        this.rates.set(key, {
          providerId: entry.providerId,
          modelId: entry.nativeModelId,
          promptCostPer1MUsd: entry.pricing.promptCostPer1MUsd,
          completionCostPer1MUsd: entry.pricing.completionCostPer1MUsd,
          currency: 'USD',
          pricingVersion: PRICING_VERSION,
          source: 'STATIC_BUNDLED_CATALOG',
          isFreeTier: false,
        });
      } else if (isNim) {
        // NVIDIA NIM developer tier / self-hosted containers have zero marginal cloud billing
        this.rates.set(key, {
          providerId: entry.providerId,
          modelId: entry.nativeModelId,
          promptCostPer1MUsd: 0,
          completionCostPer1MUsd: 0,
          currency: 'USD',
          pricingVersion: PRICING_VERSION,
          source: 'NIM_SELF_HOSTED',
          isFreeTier: true,
        });
      }
    }
  }

  private getRateKey(providerId: string, modelId: string): string {
    return `${providerId.toLowerCase()}:${modelId.toLowerCase()}`;
  }

  /**
   * Calculates estimated cost using decimal-safe arithmetic and explicit provenance.
   * Never silently turns unknown cost into zero.
   */
  calculateCost(input: CostCalculationInput): CostCalculationResult {
    const { providerId, modelId, inputTokens, outputTokens, providerReportedCost } = input;
    const key = this.getRateKey(providerId, modelId);
    const rate = this.rates.get(key);

    let providerCostUsd: string | null = null;
    if (providerReportedCost !== undefined && providerReportedCost !== null) {
      const parsed =
        typeof providerReportedCost === 'number'
          ? providerReportedCost
          : parseFloat(providerReportedCost);
      if (!isNaN(parsed) && parsed >= 0) {
        providerCostUsd = parsed.toFixed(6);
      }
    }

    // 1. If provider explicitly returned cost (e.g. OpenRouter total_cost), honor as PROVIDER_REPORTED_COST
    if (providerCostUsd !== null) {
      return {
        costStatus: 'PROVIDER_REPORTED_COST',
        estimatedCostUsd: providerCostUsd,
        providerCostUsd,
        currency: 'USD',
        pricingVersion: rate?.pricingVersion ?? 'PROVIDER_REPORTED',
        costExplanation: `Direct provider-reported monetary cost: $${providerCostUsd} USD`,
      };
    }

    // 2. Check if rate exists
    if (!rate) {
      return {
        costStatus: 'UNKNOWN_COST',
        estimatedCostUsd: null,
        providerCostUsd: null,
        currency: 'USD',
        pricingVersion: null,
        costExplanation: `Missing catalog pricing rate for model "${providerId}:${modelId}"`,
      };
    }

    // 3. Free tier / self-hosted NIM containers
    if (rate.isFreeTier) {
      return {
        costStatus: 'CALCULATED_ESTIMATE',
        estimatedCostUsd: '0.000000',
        providerCostUsd: null,
        currency: 'USD',
        pricingVersion: rate.pricingVersion,
        costExplanation: 'NVIDIA NIM developer tier / self-hosted container (zero marginal cloud fee)',
      };
    }

    // 4. Token validation: input and output tokens must be known non-negative numbers
    const hasInputTokens = typeof inputTokens === 'number' && inputTokens >= 0;
    const hasOutputTokens = typeof outputTokens === 'number' && outputTokens >= 0;

    if (!hasInputTokens || !hasOutputTokens) {
      return {
        costStatus: 'UNKNOWN_COST',
        estimatedCostUsd: null,
        providerCostUsd: null,
        currency: rate.currency,
        pricingVersion: rate.pricingVersion,
        costExplanation: `Incomplete token usage reported: promptTokens=${String(inputTokens)}, completionTokens=${String(outputTokens)}`,
      };
    }

    const promptRate = rate.promptCostPer1MUsd ?? 0;
    const completionRate = rate.completionCostPer1MUsd ?? 0;

    // Decimal-safe fixed arithmetic (scaled to nano-dollars to avoid float precision loss)
    // Formula: (tokens * ratePer1M) / 1,000,000
    const promptCostNano = Math.round((inputTokens * promptRate * 1_000_000_000) / 1_000_000);
    const completionCostNano = Math.round((outputTokens * completionRate * 1_000_000_000) / 1_000_000);
    const totalCostNano = promptCostNano + completionCostNano;

    const totalCostUsd = (totalCostNano / 1_000_000_000).toFixed(6);

    return {
      costStatus: 'CALCULATED_ESTIMATE',
      estimatedCostUsd: totalCostUsd,
      providerCostUsd: null,
      currency: rate.currency,
      pricingVersion: rate.pricingVersion,
      costExplanation: `Calculated from ${inputTokens} input @ $${promptRate}/1M + ${outputTokens} output @ $${completionRate}/1M (${rate.pricingVersion})`,
    };
  }

  /**
   * Registers or overrides a model pricing rate.
   */
  setRate(rate: ModelPricingRate): void {
    const key = this.getRateKey(rate.providerId, rate.modelId);
    this.rates.set(key, rate);
  }

  /**
   * Retrieves pricing rate metadata for a provider/model.
   */
  getRate(providerId: string, modelId: string): ModelPricingRate | null {
    const key = this.getRateKey(providerId, modelId);
    return this.rates.get(key) ?? null;
  }
}

export { ModelPricingService as PricingService };

let defaultPricingService: ModelPricingService | null = null;

export function getDefaultPricingService(): ModelPricingService {
  if (!defaultPricingService) {
    defaultPricingService = new ModelPricingService();
  }
  return defaultPricingService;
}
