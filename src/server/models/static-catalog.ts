/**
 * VerityScout AI — Static Bundled Model Catalog
 * Governed by: Step 41 (Model Catalog, Model Capabilities, and Supported Operations)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Primary Architectural Rules:
 * 1. Curated baseline of verified model metadata for canonical providers (OpenAI, OpenRouter, NVIDIA NIM).
 * 2. Unambiguous structured output taxonomy (SCHEMA_CONSTRAINED vs JSON_OBJECT vs POST_VALIDATED).
 * 3. Never fabricate context windows, prices, or capability support.
 * 4. Provides immutable fallback guarantees if remote model discovery is unavailable or unauthenticated.
 */

import {
  type ModelCatalogEntry,
  type AiProviderId,
  createModelCatalogId,
} from './contracts';

const BASELINE_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const STATIC_BUNDLED_CATALOG: readonly ModelCatalogEntry[] = [
  // ==========================================================================
  // OPENAI MODELS
  // ==========================================================================
  {
    id: createModelCatalogId('openai', 'gpt-4o'),
    providerId: 'openai',
    nativeModelId: 'gpt-4o',
    displayName: 'GPT-4o',
    family: 'gpt-4',
    description: 'Flagship high-intelligence multimodal model with native JSON schema constraints',
    contextWindowTokens: 128000,
    maxOutputTokens: 16384,
    pricing: {
      promptCostPer1MUsd: 2.5,
      completionCostPer1MUsd: 10.0,
    },
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'SCHEMA_CONSTRAINED',
        provenance: 'STATIC_BUNDLED',
        notes: 'Strict JSON schema mode enforced via response_format json_schema',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: true, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: true,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },
  {
    id: createModelCatalogId('openai', 'gpt-4o-mini'),
    providerId: 'openai',
    nativeModelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    family: 'gpt-4',
    description: 'Fast, cost-efficient multimodal model optimal for claims extraction and normalization',
    contextWindowTokens: 128000,
    maxOutputTokens: 16384,
    pricing: {
      promptCostPer1MUsd: 0.15,
      completionCostPer1MUsd: 0.6,
    },
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'SCHEMA_CONSTRAINED',
        provenance: 'STATIC_BUNDLED',
        notes: 'Strict JSON schema mode enforced via response_format json_schema',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: true, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: true,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },
  {
    id: createModelCatalogId('openai', 'o1'),
    providerId: 'openai',
    nativeModelId: 'o1',
    displayName: 'OpenAI o1',
    family: 'o-series',
    description: 'Deep reasoning model specialized in complex verification and logical synthesis',
    contextWindowTokens: 200000,
    maxOutputTokens: 100000,
    pricing: {
      promptCostPer1MUsd: 15.0,
      completionCostPer1MUsd: 60.0,
    },
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'SCHEMA_CONSTRAINED',
        provenance: 'STATIC_BUNDLED',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: true, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: false,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },
  {
    id: createModelCatalogId('openai', 'o1-mini'),
    providerId: 'openai',
    nativeModelId: 'o1-mini',
    displayName: 'OpenAI o1-mini',
    family: 'o-series',
    description: 'Lightweight reasoning model for code and structured mathematical analysis',
    contextWindowTokens: 128000,
    maxOutputTokens: 65536,
    pricing: {
      promptCostPer1MUsd: 3.0,
      completionCostPer1MUsd: 12.0,
    },
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'JSON_OBJECT',
        provenance: 'STATIC_BUNDLED',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: false, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: false, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: false,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },

  // ==========================================================================
  // OPENROUTER MODELS
  // ==========================================================================
  {
    id: createModelCatalogId('openrouter', 'anthropic/claude-3.5-sonnet'),
    providerId: 'openrouter',
    nativeModelId: 'anthropic/claude-3.5-sonnet',
    displayName: 'Claude 3.5 Sonnet',
    family: 'claude-3',
    description: 'High-capability reasoning and vision model with exceptional fact-extraction precision',
    contextWindowTokens: 200000,
    maxOutputTokens: 8192,
    pricing: {
      promptCostPer1MUsd: 3.0,
      completionCostPer1MUsd: 15.0,
    },
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'SCHEMA_CONSTRAINED',
        provenance: 'STATIC_BUNDLED',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: true, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: true,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },
  {
    id: createModelCatalogId('openrouter', 'meta-llama/llama-3.1-70b-instruct'),
    providerId: 'openrouter',
    nativeModelId: 'meta-llama/llama-3.1-70b-instruct',
    displayName: 'Llama 3.1 70B Instruct',
    family: 'llama-3',
    description: 'Open-weights dense model with strong multi-step instruction following',
    contextWindowTokens: 131072,
    maxOutputTokens: 8192,
    pricing: {
      promptCostPer1MUsd: 0.35,
      completionCostPer1MUsd: 0.4,
    },
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'JSON_OBJECT',
        provenance: 'STATIC_BUNDLED',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: false, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: false,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },
  {
    id: createModelCatalogId('openrouter', 'google/gemini-2.0-flash-001'),
    providerId: 'openrouter',
    nativeModelId: 'google/gemini-2.0-flash-001',
    displayName: 'Gemini 2.0 Flash',
    family: 'gemini-2',
    description: 'Next-generation low-latency multimodal model with 1M context window',
    contextWindowTokens: 1048576,
    maxOutputTokens: 8192,
    pricing: {
      promptCostPer1MUsd: 0.1,
      completionCostPer1MUsd: 0.4,
    },
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'SCHEMA_CONSTRAINED',
        provenance: 'STATIC_BUNDLED',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: true, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: true,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },

  // ==========================================================================
  // NVIDIA NIM MODELS
  // ==========================================================================
  {
    id: createModelCatalogId('nim', 'meta/llama-3.1-70b-instruct'),
    providerId: 'nim',
    nativeModelId: 'meta/llama-3.1-70b-instruct',
    displayName: 'Meta Llama 3.1 70B Instruct (NIM)',
    family: 'llama-3',
    description: 'Hardware-accelerated NVIDIA NIM inference container for Llama 3.1 70B',
    contextWindowTokens: 131072,
    maxOutputTokens: 4096,
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'JSON_OBJECT',
        provenance: 'STATIC_BUNDLED',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: false, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: true,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },
  {
    id: createModelCatalogId('nim', 'mistralai/mixtral-8x7b-instruct-v0.1'),
    providerId: 'nim',
    nativeModelId: 'mistralai/mixtral-8x7b-instruct-v0.1',
    displayName: 'Mixtral 8x7B Instruct (NIM)',
    family: 'mistral',
    description: 'Sparse mixture of experts model with high token throughput on NVIDIA NIM',
    contextWindowTokens: 32768,
    maxOutputTokens: 4096,
    capabilities: {
      textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
      structuredOutput: {
        status: 'SUPPORTED',
        level: 'POST_VALIDATED',
        provenance: 'STATIC_BUNDLED',
        notes: 'Post-generation schema validation via Zod parser',
      },
      streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
      toolCalling: { supported: false, provenance: 'STATIC_BUNDLED' },
      imageInput: { supported: false, provenance: 'STATIC_BUNDLED' },
    },
    availabilityState: 'AVAILABLE',
    provenance: 'STATIC_BUNDLED',
    isRecommended: false,
    lastVerifiedAt: BASELINE_TIMESTAMP,
    lastRefreshedAt: BASELINE_TIMESTAMP,
  },
];

/**
 * Returns a cloned copy of the static bundled catalog.
 */
export function getStaticCatalog(): readonly ModelCatalogEntry[] {
  return [...STATIC_BUNDLED_CATALOG];
}

/**
 * Looks up a static model definition by provider and native model ID.
 */
export function getStaticModel(
  providerId: AiProviderId,
  nativeModelId: string
): ModelCatalogEntry | null {
  const targetId = createModelCatalogId(providerId, nativeModelId);
  const found = STATIC_BUNDLED_CATALOG.find((m) => m.id === targetId);
  return found ? { ...found } : null;
}

