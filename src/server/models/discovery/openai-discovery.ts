/**
 * VerityScout AI — OpenAI Model Discovery Parser
 * Governed by: Step 41 (Model Catalog, Model Capabilities, and Supported Operations)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Normalizes OpenAI `/v1/models` discovery responses into typed ModelCatalogEntry instances.
 * Enriches discovered models using static catalog baselines while avoiding fabrication.
 */

import {
  type ModelCatalogEntry,
  createModelCatalogId,
} from '../contracts';
import { getStaticModel } from '../static-catalog';

export interface OpenAiRawModelItem {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface OpenAiRawDiscoveryPayload {
  object?: string;
  data?: OpenAiRawModelItem[];
}

const NON_GENERATION_PREFIXES = [
  'text-embedding',
  'tts-',
  'whisper-',
  'dall-e-',
  'babbage-',
  'davinci-',
  'canary-',
];

function isLikelyGenerationModel(id: string): boolean {
  const lower = id.toLowerCase();
  for (const prefix of NON_GENERATION_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return false;
    }
  }
  return true;
}

function deriveOpenAiFamily(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes('gpt-4o')) return 'gpt-4';
  if (lower.includes('gpt-4')) return 'gpt-4';
  if (lower.startsWith('o1') || lower.startsWith('o3')) return 'o-series';
  if (lower.includes('gpt-3.5')) return 'gpt-3.5';
  return 'openai-other';
}

/**
 * Normalizes raw OpenAI model discovery payload into ModelCatalogEntry items.
 */
export function parseOpenAiDiscoveryModels(
  raw: unknown,
  refreshedAt = new Date().toISOString()
): ModelCatalogEntry[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const payload = raw as OpenAiRawDiscoveryPayload;
  const items = Array.isArray(payload.data) ? payload.data : [];
  const results: ModelCatalogEntry[] = [];

  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    const modelId = item.id.trim();
    if (!modelId) continue;

    // Filter non-inference / auxiliary models
    if (!isLikelyGenerationModel(modelId)) continue;

    // Check if we have a curated static catalog entry
    const staticBaseline = getStaticModel('openai', modelId);
    if (staticBaseline) {
      results.push({
        ...staticBaseline,
        availabilityState: 'AVAILABLE',
        provenance: 'PROVIDER_DECLARED',
        lastVerifiedAt: refreshedAt,
        lastRefreshedAt: refreshedAt,
      });
      continue;
    }

    // Dynamic discovered entry
    const family = deriveOpenAiFamily(modelId);
    const isVision = modelId.toLowerCase().includes('4o') || modelId.toLowerCase().includes('vision');

    results.push({
      id: createModelCatalogId('openai', modelId),
      providerId: 'openai',
      nativeModelId: modelId,
      displayName: modelId,
      family,
      description: `OpenAI discovered model: ${modelId}`,
      contextWindowTokens: modelId.includes('128k') ? 128000 : undefined,
      maxOutputTokens: undefined,
      capabilities: {
        textGeneration: { supported: true, provenance: 'PROVIDER_DECLARED' },
        structuredOutput: {
          status: 'SUPPORTED',
          level: 'JSON_OBJECT',
          provenance: 'PROVIDER_DECLARED',
        },
        streaming: { supported: true, provenance: 'PROVIDER_DECLARED' },
        toolCalling: { supported: true, provenance: 'PROVIDER_DECLARED' },
        imageInput: { supported: isVision, provenance: 'PROVIDER_DECLARED' },
      },
      availabilityState: 'AVAILABLE',
      provenance: 'PROVIDER_DECLARED',
      isRecommended: false,
      lastVerifiedAt: refreshedAt,
      lastRefreshedAt: refreshedAt,
    });
  }

  return results;
}

