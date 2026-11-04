/**
 * VerityScout AI — OpenRouter Model Discovery Parser
 * Governed by: Step 41 (Model Catalog, Model Capabilities, and Supported Operations)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Normalizes OpenRouter `/api/v1/models` response into rich typed ModelCatalogEntry instances.
 * Extracts context window, pricing, multimodal modality, and supported parameters.
 */

import {
  type ModelCatalogEntry,
  type StructuredOutputSupportLevel,
  createModelCatalogId,
} from '../contracts';
import { getStaticModel } from '../static-catalog';

export interface OpenRouterRawPricing {
  prompt?: string | number;
  completion?: string | number;
  request?: string | number;
  image?: string | number;
}

export interface OpenRouterRawArchitecture {
  modality?: string;
  tokenizer?: string;
  instruct_type?: string | null;
}

export interface OpenRouterRawModelItem {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: OpenRouterRawPricing;
  architecture?: OpenRouterRawArchitecture;
  supported_parameters?: string[];
}

export interface OpenRouterRawDiscoveryPayload {
  data?: OpenRouterRawModelItem[];
}

function deriveOpenRouterFamily(id: string): string {
  const lower = id.toLowerCase();
  if (lower.startsWith('anthropic/claude-3')) return 'claude-3';
  if (lower.startsWith('openai/gpt-4')) return 'gpt-4';
  if (lower.startsWith('openai/o1')) return 'o-series';
  if (lower.includes('llama-3')) return 'llama-3';
  if (lower.includes('mistral') || lower.includes('mixtral')) return 'mistral';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('qwen')) return 'qwen';
  return 'openrouter-general';
}

function parseTokenPricePer1M(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num) || num < 0) return undefined;
  // OpenRouter pricing is per-token USD (e.g., 0.000003), so multiply by 1,000,000
  return Number((num * 1_000_000).toFixed(4));
}

/**
 * Normalizes OpenRouter model discovery payload into ModelCatalogEntry items.
 */
export function parseOpenRouterDiscoveryModels(
  raw: unknown,
  refreshedAt = new Date().toISOString()
): ModelCatalogEntry[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const payload = raw as OpenRouterRawDiscoveryPayload;
  const items = Array.isArray(payload.data) ? payload.data : [];
  const results: ModelCatalogEntry[] = [];

  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    const modelId = item.id.trim();
    if (!modelId) continue;

    const staticBaseline = getStaticModel('openrouter', modelId);
    const family = deriveOpenRouterFamily(modelId);
    const supportedParams = Array.isArray(item.supported_parameters) ? item.supported_parameters : [];

    // Parse capabilities from supported_parameters & architecture
    const hasTools = supportedParams.includes('tools') || supportedParams.includes('tool_choice');
    const hasResponseFormat = supportedParams.includes('response_format');
    const modality = item.architecture?.modality?.toLowerCase() ?? '';
    const hasImageInput = modality.includes('image') || modality.includes('multimodal');

    // Structured output level
    let structLevel: StructuredOutputSupportLevel = 'POST_VALIDATED';
    if (staticBaseline?.capabilities.structuredOutput.level === 'SCHEMA_CONSTRAINED') {
      structLevel = 'SCHEMA_CONSTRAINED';
    } else if (hasResponseFormat) {
      structLevel = 'JSON_OBJECT';
    }

    // Pricing
    const promptCost = parseTokenPricePer1M(item.pricing?.prompt);
    const completionCost = parseTokenPricePer1M(item.pricing?.completion);
    const pricing = (promptCost !== undefined || completionCost !== undefined)
      ? {
          ...(promptCost !== undefined ? { promptCostPer1MUsd: promptCost } : {}),
          ...(completionCost !== undefined ? { completionCostPer1MUsd: completionCost } : {}),
        }
      : staticBaseline?.pricing;

    results.push({
      id: createModelCatalogId('openrouter', modelId),
      providerId: 'openrouter',
      nativeModelId: modelId,
      displayName: item.name?.trim() || staticBaseline?.displayName || modelId,
      family,
      description: item.description?.trim() || staticBaseline?.description,
      contextWindowTokens: typeof item.context_length === 'number' && item.context_length > 0
        ? item.context_length
        : staticBaseline?.contextWindowTokens,
      maxOutputTokens: staticBaseline?.maxOutputTokens,
      ...(pricing ? { pricing } : {}),
      capabilities: {
        textGeneration: { supported: true, provenance: 'PROVIDER_DECLARED' },
        structuredOutput: {
          status: hasResponseFormat || structLevel === 'SCHEMA_CONSTRAINED' ? 'SUPPORTED' : 'UNKNOWN',
          level: structLevel,
          provenance: 'PROVIDER_DECLARED',
        },
        streaming: { supported: true, provenance: 'PROVIDER_DECLARED' },
        toolCalling: { supported: hasTools, provenance: 'PROVIDER_DECLARED' },
        imageInput: { supported: hasImageInput, provenance: 'PROVIDER_DECLARED' },
      },
      availabilityState: 'AVAILABLE',
      provenance: 'PROVIDER_DECLARED',
      isRecommended: staticBaseline?.isRecommended ?? false,
      lastVerifiedAt: refreshedAt,
      lastRefreshedAt: refreshedAt,
    });
  }

  return results;
}
