import 'server-only';

/**
 * VerityScout AI — Model Catalog Service
 * Governed by: Step 41 (Model Catalog, Model Capabilities, and Supported Operations)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Core Principles:
 * 1. Provider-Agnostic Model Directory: Combines static baselines, live discovery, and operator configuration.
 * 2. Strict Credential Isolation: Never exposes keys or secret tokens through catalog queries.
 * 3. Fault-Tolerant Refresh: Failures in remote discovery never clear or corrupt existing valid entries.
 * 4. Deterministic Capability Checking: Distinguishes strict schema constraints from unconstrained JSON.
 */

import {
  type ModelCatalogEntry,
  type ModelCatalogQuery,
  type ModelCapabilityType,
  type StructuredOutputSupportLevel,
  type CatalogRefreshSummary,
  type ProviderRefreshResult,
  type AiProviderId,
  AI_PROVIDER_IDS,
  createModelCatalogId,
  matchesModelQuery,
} from './contracts';
import { STATIC_BUNDLED_CATALOG, getStaticModel } from './static-catalog';
import {
  getDefaultProviderRegistry,
  type AiProviderRegistry,
} from '@/server/providers/registry';
import type { ProviderOperationContext } from '@/server/providers/contracts/adapter';
import { parseOpenAiDiscoveryModels } from './discovery/openai-discovery';
import { parseOpenRouterDiscoveryModels } from './discovery/openrouter-discovery';
import { parseNimDiscoveryModels } from './discovery/nim-discovery';
import { logger } from '@/lib/logging/logger';

export interface ModelCatalogServiceOptions {
  readonly registry?: AiProviderRegistry | undefined;
  readonly cacheTtlMs?: number | undefined;
}

export interface CatalogFreshnessInfo {
  readonly entryCount: number;
  readonly lastRefreshedAt: string | null;
  readonly isStale: boolean;
}

export class ModelCatalogService {
  private readonly registry: AiProviderRegistry;
  private readonly cacheTtlMs: number;

  // Primary memory cache: catalog ID -> entry
  private readonly catalog = new Map<string, ModelCatalogEntry>();

  // Provider refresh timestamps and error history
  private readonly providerRefreshMeta = new Map<
    AiProviderId,
    { timestamp: string; success: boolean; error?: string | undefined }
  >();

  constructor(options?: ModelCatalogServiceOptions) {
    this.registry = options?.registry ?? getDefaultProviderRegistry();
    this.cacheTtlMs = options?.cacheTtlMs ?? 15 * 60 * 1000; // 15 minutes default

    // Initialize catalog with static bundled baseline
    this.seedStaticCatalog();
  }

  /**
   * Seeds the in-memory catalog with the curated static catalog.
   */
  private seedStaticCatalog(): void {
    for (const entry of STATIC_BUNDLED_CATALOG) {
      this.catalog.set(entry.id, { ...entry });
    }
  }

  /**
   * Lists all model catalog entries satisfying the query constraints.
   */
  public async listModels(query?: ModelCatalogQuery): Promise<readonly ModelCatalogEntry[]> {
    const all = Array.from(this.catalog.values());
    return all.filter((entry) => matchesModelQuery(entry, query));
  }

  /**
   * Retrieves a single model catalog entry by provider ID and native model ID.
   */
  public async getModel(
    providerId: AiProviderId,
    nativeModelId: string
  ): Promise<ModelCatalogEntry | null> {
    const catalogId = createModelCatalogId(providerId, nativeModelId);
    const existing = this.catalog.get(catalogId);
    if (existing) {
      return { ...existing };
    }

    // Fallback to static catalog if not yet discovered or registered
    const staticModel = getStaticModel(providerId, nativeModelId);
    if (staticModel) {
      return { ...staticModel };
    }

    return null;
  }

  /**
   * Verifies whether a given model supports a specific capability type.
   */
  public async checkCapability(
    providerId: AiProviderId,
    nativeModelId: string,
    capability: ModelCapabilityType
  ): Promise<boolean> {
    const model = await this.getModel(providerId, nativeModelId);
    if (!model) {
      return false;
    }

    switch (capability) {
      case 'text_generation':
        return model.capabilities.textGeneration.supported;
      case 'structured_output':
        return model.capabilities.structuredOutput.status === 'SUPPORTED';
      case 'streaming':
        return model.capabilities.streaming.supported;
      case 'tool_calling':
        return model.capabilities.toolCalling.supported;
      case 'image_input':
        return model.capabilities.imageInput.supported;
      default:
        return false;
    }
  }

  /**
   * Returns the structured output level for a given model.
   */
  public async getStructuredOutputLevel(
    providerId: AiProviderId,
    nativeModelId: string
  ): Promise<StructuredOutputSupportLevel> {
    const model = await this.getModel(providerId, nativeModelId);
    if (!model) {
      return 'UNKNOWN';
    }
    return model.capabilities.structuredOutput.level;
  }

  /**
   * Registers or updates an operator-configured model definition.
   */
  public registerOperatorModel(entry: ModelCatalogEntry): void {
    const sanitizedEntry: ModelCatalogEntry = {
      ...entry,
      provenance: 'OPERATOR_CONFIGURED',
      availabilityState: entry.availabilityState || 'AVAILABLE',
      lastRefreshedAt: new Date().toISOString(),
    };
    this.catalog.set(sanitizedEntry.id, sanitizedEntry);
  }

  /**
   * Refreshes model discovery across specified providers (or all canonical providers).
   * Safe execution: Never deletes or corrupts existing catalog entries on provider error.
   */
  public async refreshCatalog(options?: {
    readonly providerId?: AiProviderId | undefined;
    readonly context?: ProviderOperationContext | undefined;
  }): Promise<CatalogRefreshSummary> {
    const targetProviders: AiProviderId[] = options?.providerId
      ? [options.providerId]
      : [...AI_PROVIDER_IDS];

    const context: ProviderOperationContext = options?.context ?? {
      userId: 'system-discovery',
      correlationId: `catalog-refresh-${Date.now()}`,
    };

    const providerResults: Record<AiProviderId, ProviderRefreshResult> = {
      openai: { status: 'SKIPPED', modelCount: 0 },
      openrouter: { status: 'SKIPPED', modelCount: 0 },
      nim: { status: 'SKIPPED', modelCount: 0 },
    };

    let totalRefreshed = 0;
    const nowIso = new Date().toISOString();

    for (const pId of targetProviders) {
      const adapter = this.registry.getAdapter(pId);
      if (!adapter) {
        providerResults[pId] = {
          status: 'ERROR',
          modelCount: 0,
          error: `No registered adapter for provider "${pId}"`,
        };
        continue;
      }

      try {
        const result = await adapter.listModels(context);
        if (result.success) {
          const rawModels = result.data;
          let discoveredEntries: ModelCatalogEntry[] = [];

          // Map model definitions through discovery parsers
          if (pId === 'openai') {
            discoveredEntries = parseOpenAiDiscoveryModels(
              { data: rawModels.map((m) => ({ id: m.reference.modelId })) },
              nowIso
            );
          } else if (pId === 'openrouter') {
            discoveredEntries = parseOpenRouterDiscoveryModels(
              {
                data: rawModels.map((m) => ({
                  id: m.reference.modelId,
                  name: m.name,
                  description: m.description,
                  context_length: m.limits?.contextWindowTokens,
                })),
              },
              nowIso
            );
          } else if (pId === 'nim') {
            discoveredEntries = parseNimDiscoveryModels(
              { data: rawModels.map((m) => ({ id: m.reference.modelId, name: m.name })) },
              nowIso
            );
          }

          // Merge into catalog cache without destroying operator-configured models
          for (const discovered of discoveredEntries) {
            const existing = this.catalog.get(discovered.id);
            if (existing && existing.provenance === 'OPERATOR_CONFIGURED') {
              // Preserve operator config while updating refreshed timestamp and availability
              this.catalog.set(discovered.id, {
                ...existing,
                availabilityState: 'AVAILABLE',
                lastRefreshedAt: nowIso,
              });
            } else {
              this.catalog.set(discovered.id, discovered);
            }
          }

          totalRefreshed += discoveredEntries.length;
          providerResults[pId] = {
            status: 'SUCCESS',
            modelCount: discoveredEntries.length,
          };
          this.providerRefreshMeta.set(pId, { timestamp: nowIso, success: true });
        } else {
          // Provider returned error result (e.g. MISSING_CREDENTIAL, RATE_LIMITED)
          const errorMsg = result.error?.message ?? 'Provider model listing failed';
          providerResults[pId] = {
            status: 'ERROR',
            modelCount: 0,
            error: errorMsg,
          };
          this.providerRefreshMeta.set(pId, {
            timestamp: nowIso,
            success: false,
            error: errorMsg,
          });
          logger.warn('MODEL_CATALOG_REFRESH_WARNING', `Provider ${pId} listing failed: ${errorMsg}`, {
            providerId: pId,
            correlationId: context.correlationId,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unexpected discovery error';
        providerResults[pId] = {
          status: 'ERROR',
          modelCount: 0,
          error: errorMsg,
        };
        this.providerRefreshMeta.set(pId, {
          timestamp: nowIso,
          success: false,
          error: errorMsg,
        });
        logger.warn('MODEL_CATALOG_REFRESH_ERROR', `Exception refreshing provider ${pId}: ${errorMsg}`, {
          providerId: pId,
          correlationId: context.correlationId,
        });
      }
    }

    return {
      refreshedCount: totalRefreshed,
      providerResults,
      timestamp: nowIso,
    };
  }

  /**
   * Reports catalog entry counts and freshness status.
   */
  public getFreshness(providerId?: AiProviderId): CatalogFreshnessInfo {
    const entries = providerId
      ? Array.from(this.catalog.values()).filter((e) => e.providerId === providerId)
      : Array.from(this.catalog.values());

    let mostRecentRefresh: number | null = null;
    let mostRecentRefreshIso: string | null = null;

    for (const entry of entries) {
      const parsedTime = Date.parse(entry.lastRefreshedAt);
      if (!isNaN(parsedTime) && (mostRecentRefresh === null || parsedTime > mostRecentRefresh)) {
        mostRecentRefresh = parsedTime;
        mostRecentRefreshIso = entry.lastRefreshedAt;
      }
    }

    const isStale = mostRecentRefresh === null
      ? true
      : Date.now() - mostRecentRefresh > this.cacheTtlMs;

    return {
      entryCount: entries.length,
      lastRefreshedAt: mostRecentRefreshIso,
      isStale,
    };
  }
}

// Singleton instance management
let defaultModelCatalogService: ModelCatalogService | null = null;

export function getDefaultModelCatalogService(): ModelCatalogService {
  if (!defaultModelCatalogService) {
    defaultModelCatalogService = new ModelCatalogService();
  }
  return defaultModelCatalogService;
}

export function resetDefaultModelCatalogService(): void {
  defaultModelCatalogService = null;
}
