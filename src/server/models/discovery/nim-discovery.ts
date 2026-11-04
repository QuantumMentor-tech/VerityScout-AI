/**
 * VerityScout AI — NVIDIA NIM Model Discovery Parser
 * Governed by: Step 41 (Model Catalog, Model Capabilities, and Supported Operations)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Normalizes NVIDIA NIM `/v1/models` payload into typed ModelCatalogEntry instances.
 * Enriches discovered models using static catalog baselines while preserving trinary capabilities.
 */

import {
  type ModelCatalogEntry,
  createModelCatalogId,
} from '../contracts';
import { getStaticModel } from '../static-catalog';

export interface NimRawModelItem {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  name?: string;
}

export interface NimRawDiscoveryPayload {
  object?: string;
  data?: NimRawModelItem[];
}

function deriveNimFamily(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes('llama-3')) return 'llama-3';
  if (lower.includes('mistral') || lower.includes('mixtral')) return 'mistral';
  if (lower.includes('nemotron')) return 'nemotron';
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('gemma')) return 'gemma';
  return 'nim-general';
}

/**
 * Normalizes NVIDIA NIM model discovery payload into ModelCatalogEntry items.
 */
export function parseNimDiscoveryModels(
  raw: unknown,
  refreshedAt = new Date().toISOString()
): ModelCatalogEntry[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const payload = raw as NimRawDiscoveryPayload;
  const items = Array.isArray(payload.data) ? payload.data : [];
  const results: ModelCatalogEntry[] = [];

  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    const modelId = item.id.trim();
    if (!modelId) continue;

    const staticBaseline = getStaticModel('nim', modelId);
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

    const family = deriveNimFamily(modelId);
    const hasTools = modelId.includes('instruct') || modelId.includes('chat');

    results.push({
      id: createModelCatalogId('nim', modelId),
      providerId: 'nim',
      nativeModelId: modelId,
      displayName: item.name?.trim() || modelId,
      family,
      description: `NVIDIA NIM model endpoint: ${modelId}`,
      contextWindowTokens: undefined,
      maxOutputTokens: 4096,
      capabilities: {
        textGeneration: { supported: true, provenance: 'PROVIDER_DECLARED' },
        structuredOutput: {
          status: 'SUPPORTED',
          level: 'JSON_OBJECT',
          provenance: 'PROVIDER_DECLARED',
        },
        streaming: { supported: true, provenance: 'PROVIDER_DECLARED' },
        toolCalling: { supported: hasTools, provenance: 'PROVIDER_DECLARED' },
        imageInput: { supported: modelId.includes('vision') || modelId.includes('multimodal'), provenance: 'PROVIDER_DECLARED' },
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
