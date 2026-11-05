import 'server-only';

/**
 * VerityScout AI — Centralized AI Provider Registry
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Architectural Rules:
 * 1. Single source of truth for known provider definitions and registered adapters.
 * 2. Never claims an unimplemented adapter is operational.
 * 3. Rejects duplicate registrations or unknown provider IDs.
 * 4. Integrates seamlessly with Step 26 connection test infrastructure while preparing for Steps 28-30 adapters.
 */

import { randomUUID } from 'node:crypto';
import {
  type AiProviderId,
  isAiProviderId,
  assertValidProviderId,
} from './contracts/provider-id';
import {
  type ProviderMetadata,
  BASELINE_PROVIDER_METADATA,
} from './contracts/metadata';
import type { ProviderCapabilities } from './contracts/capabilities';
import type { ModelDefinition } from './contracts/model';
import {
  type NormalizedInferenceRequest,
  type NormalizedInferenceResponse,
  validateInferenceRequest,
} from './contracts/inference';
import {
  type ProviderOperationResult,
  type ProviderErrorCode,
  createSuccessResult,
  createErrorResult,
  createProviderError,
} from './contracts/operation-result';
import type {
  AiProviderAdapter,
  ProviderOperationContext,
} from './contracts/adapter';
import {
  testProviderConnection,
  type ConnectionTestResult,
  type ProviderConnectionTesterOptions,
} from './connection-tester';
import { OpenAiProviderAdapter } from './adapters/openai/openai.adapter';
import { OpenRouterProviderAdapter } from './adapters/openrouter/openrouter.adapter';
import { NimProviderAdapter } from './adapters/nim/nim.adapter';
import {
  getConcurrencyManager,
  type IConcurrencyManager,
  getDefaultUsageAccountingService,
  type UsageAccountingService,
} from '@/server/usage';
import { logger } from '@/lib/logging/logger';

export type ConnectionTestFn = (
  userId: string,
  providerId: string,
  options?: ProviderConnectionTesterOptions
) => Promise<ConnectionTestResult>;

export interface AiProviderRegistryOptions {
  readonly initialMetadata?: Partial<Record<AiProviderId, ProviderMetadata>>;
  readonly connectionTestFn?: ConnectionTestFn;
  readonly concurrencyManager?: IConcurrencyManager;
  readonly usageService?: UsageAccountingService;
}

export class AiProviderRegistry {
  private readonly metadataMap: Map<AiProviderId, ProviderMetadata>;
  private readonly adapterMap: Map<AiProviderId, AiProviderAdapter>;
  private readonly connectionTestFn: ConnectionTestFn;
  private readonly concurrencyManager?: IConcurrencyManager | undefined;
  private readonly usageService?: UsageAccountingService | undefined;

  constructor(options?: AiProviderRegistryOptions) {
    this.metadataMap = new Map();
    this.adapterMap = new Map();
    this.connectionTestFn = options?.connectionTestFn ?? testProviderConnection;
    this.concurrencyManager = options?.concurrencyManager;
    this.usageService = options?.usageService;

    // Populate baseline metadata
    for (const [id, meta] of Object.entries(BASELINE_PROVIDER_METADATA) as [AiProviderId, ProviderMetadata][]) {
      this.metadataMap.set(id, { ...meta });
    }

    // Apply any customized metadata overrides
    if (options?.initialMetadata) {
      for (const [id, meta] of Object.entries(options.initialMetadata) as [AiProviderId, ProviderMetadata | undefined][]) {
        if (meta && isAiProviderId(id)) {
          this.metadataMap.set(id, meta);
        }
      }
    }
  }

  /**
   * Returns metadata for all known providers.
   */
  public getKnownProviders(): readonly ProviderMetadata[] {
    return Array.from(this.metadataMap.values());
  }

  /**
   * Retrieves metadata for a specific provider.
   */
  public getProviderMetadata(id: AiProviderId): ProviderMetadata {
    assertValidProviderId(id);
    const meta = this.metadataMap.get(id);
    if (!meta) {
      throw new Error(`Metadata not found for provider "${id}"`);
    }
    return meta;
  }

  /**
   * Retrieves declared capabilities for a specific provider.
   * If an adapter is registered, returns the adapter's capabilities; otherwise baseline metadata.
   */
  public getProviderCapabilities(id: AiProviderId): ProviderCapabilities {
    assertValidProviderId(id);
    const adapter = this.adapterMap.get(id);
    if (adapter) {
      return adapter.getCapabilities();
    }
    return this.getProviderMetadata(id).defaultCapabilities;
  }

  /**
   * Registers an executable provider adapter.
   * Throws if the adapter ID is unrecognized or if an adapter is already registered.
   */
  public registerAdapter(adapter: AiProviderAdapter): void {
    if (!adapter || !isAiProviderId(adapter.id)) {
      throw new TypeError(`Cannot register adapter: invalid or unrecognized provider ID "${String(adapter?.id)}"`);
    }

    if (this.adapterMap.has(adapter.id)) {
      throw new Error(
        `Duplicate adapter registration: an adapter for provider "${adapter.id}" is already registered. Overwriting is prohibited.`
      );
    }

    this.adapterMap.set(adapter.id, adapter);

    // Update metadata status to ADAPTER_IMPLEMENTED
    const existing = this.metadataMap.get(adapter.id);
    if (existing) {
      this.metadataMap.set(adapter.id, {
        ...existing,
        integrationStatus: 'ADAPTER_IMPLEMENTED',
      });
    }
  }

  /**
   * Checks whether an executable adapter is registered for the specified provider.
   */
  public hasAdapter(id: AiProviderId): boolean {
    return this.adapterMap.has(id);
  }

  /**
   * Retrieves the registered adapter for the specified provider, if present.
   */
  public getAdapter(id: AiProviderId): AiProviderAdapter | undefined {
    return this.adapterMap.get(id);
  }

  /**
   * Executes a connection test for the specified provider.
   * Delegates to the registered adapter if present, or to the Step 26 connection tester.
   */
  public async testConnection(
    providerId: AiProviderId,
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<ConnectionTestResult>> {
    assertValidProviderId(providerId);

    const adapter = this.getAdapter(providerId);
    if (adapter) {
      return adapter.testConnection(context);
    }

    // Fallback: use established Step 26 connection tester
    const startTime = Date.now();
    try {
      const result = await this.connectionTestFn(context.userId, providerId);
      const latencyMs = Math.max(0, Date.now() - startTime);

      if (result.success) {
        return createSuccessResult(result, latencyMs);
      }

      // Map Step 26 ConnectionTestResultCode to ProviderErrorCode
      const mappedCode: ProviderErrorCode = this.mapConnectionCodeToErrorCode(result.code);
      return createErrorResult(
        createProviderError({
          code: mappedCode,
          message: result.message,
          providerId,
          correlationId: context.correlationId,
        }),
        latencyMs
      );
    } catch (err) {
      const latencyMs = Math.max(0, Date.now() - startTime);
      return createErrorResult(
        createProviderError({
          code: 'UNKNOWN_PROVIDER_ERROR',
          message: err instanceof Error ? err.message : 'Unknown connection test failure',
          providerId,
          correlationId: context.correlationId,
        }),
        latencyMs
      );
    }
  }

  /**
   * Lists models for a provider.
   * Returns an explicit UNSUPPORTED_OPERATION error if no adapter is registered.
   */
  public async listModels(
    providerId: AiProviderId,
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<readonly ModelDefinition[]>> {
    assertValidProviderId(providerId);

    const adapter = this.getAdapter(providerId);
    if (!adapter) {
      return createErrorResult(
        createProviderError({
          code: 'UNSUPPORTED_OPERATION',
          message: `Model listing is not yet implemented for provider "${providerId}". Adapter will be introduced in subsequent roadmap steps.`,
          providerId,
          correlationId: context.correlationId,
        }),
        0
      );
    }

    return adapter.listModels(context);
  }

  /**
   * Executes a normalized text-generation inference request.
   * Returns an explicit UNSUPPORTED_OPERATION error if no adapter is registered.
   */
  public async generateText(
    request: NormalizedInferenceRequest,
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<NormalizedInferenceResponse>> {
    const startTime = Date.now();
    try {
      validateInferenceRequest(request);
    } catch (validationErr) {
      return createErrorResult(
        createProviderError({
          code: 'INVALID_REQUEST',
          message: validationErr instanceof Error ? validationErr.message : 'Invalid inference request',
          providerId: request.modelRef?.providerId ?? 'openai',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    const adapter = this.getAdapter(request.modelRef.providerId);
    if (!adapter) {
      return createErrorResult(
        createProviderError({
          code: 'UNSUPPORTED_OPERATION',
          message: `Inference adapter for provider "${request.modelRef.providerId}" is not yet implemented. Concrete adapters are delivered in Steps 28 (OpenAI), 29 (OpenRouter), and 30 (NVIDIA NIM).`,
          providerId: request.modelRef.providerId,
          correlationId: context.correlationId,
        }),
        Math.max(0, Date.now() - startTime)
      );
    }

    const concurrencyManager = this.concurrencyManager ?? getConcurrencyManager();
    const scopeKey = `provider:${request.modelRef.providerId}`;
    const maxSlots = this.getProviderConcurrencyLimit(request.modelRef.providerId);
    const holderId = `inf-${context.userId}-${Date.now()}-${randomUUID().slice(0, 8)}`;

    try {
      return await concurrencyManager.executeWithConcurrency(
        scopeKey,
        maxSlots,
        holderId,
        async () => {
          const result = await adapter.generateText(request, context);

          // Asynchronously record usage if successful
          if (result.success && result.data) {
            try {
              const usageService = this.usageService ?? getDefaultUsageAccountingService();
              await usageService.recordInferenceUsage({
                userId: context.userId,
                runId: context.runId,
                taskId: context.taskId,
                attempt: context.attempt ?? 1,
                providerId: request.modelRef.providerId,
                modelId: request.modelRef.modelId,
                operationType: context.operationType ?? 'standalone_inference',
                requestId: context.correlationId,
                inputTokens: result.data.usage?.promptTokens,
                outputTokens: result.data.usage?.completionTokens,
                totalTokens: result.data.usage?.totalTokens,
                usageSource: result.data.usage ? 'PROVIDER_REPORTED' : 'UNKNOWN',
                latencyMs: result.latencyMs,
              });
            } catch (usageErr) {
              logger.warn('PROVIDER_USAGE_RECORD_WARNING', 'Failed to record usage event', {
                correlationId: context.correlationId,
                error: usageErr instanceof Error ? usageErr.message : String(usageErr),
              });
            }
          }

          return result;
        },
        {
          leaseDurationMs: 30000,
          acquisitionTimeoutMs: 10000,
          signal: context.abortSignal,
        }
      );
    } catch (concurrencyErr: unknown) {
      return createErrorResult(
        createProviderError({
          code: 'RATE_LIMITED',
          message:
            concurrencyErr instanceof Error
              ? concurrencyErr.message
              : `Concurrency limit exceeded for provider "${request.modelRef.providerId}"`,
          providerId: request.modelRef.providerId,
          correlationId: context.correlationId,
          isRetryableOverride: true,
        }),
        Math.max(0, Date.now() - startTime)
      );
    }
  }

  private getProviderConcurrencyLimit(providerId: string): number {
    switch (providerId.toLowerCase()) {
      case 'openai':
        return 5;
      case 'openrouter':
        return 4;
      case 'nim':
        return 2;
      default:
        return 5;
    }
  }

  private mapConnectionCodeToErrorCode(code: string): ProviderErrorCode {
    switch (code) {
      case 'AUTH_FAILED':
        return 'AUTH_FAILED';
      case 'PERMISSION_DENIED':
        return 'PERMISSION_DENIED';
      case 'RATE_LIMITED':
        return 'RATE_LIMITED';
      case 'TIMEOUT':
        return 'TIMEOUT';
      case 'NETWORK_ERROR':
        return 'NETWORK_ERROR';
      case 'SERVER_ERROR':
        return 'PROVIDER_UNAVAILABLE';
      case 'ENDPOINT_NOT_ALLOWED':
        return 'INVALID_PROVIDER_CONFIG';
      default:
        return 'UNKNOWN_PROVIDER_ERROR';
    }
  }
}

let defaultProviderRegistry: AiProviderRegistry | null = null;

export function getDefaultProviderRegistry(): AiProviderRegistry {
  if (!defaultProviderRegistry) {
    defaultProviderRegistry = new AiProviderRegistry();
    defaultProviderRegistry.registerAdapter(new OpenAiProviderAdapter());
    defaultProviderRegistry.registerAdapter(new OpenRouterProviderAdapter());
    defaultProviderRegistry.registerAdapter(new NimProviderAdapter());
  }
  return defaultProviderRegistry;
}

export function resetDefaultProviderRegistry(): void {
  defaultProviderRegistry = null;
}

export function createProviderRegistry(options?: AiProviderRegistryOptions): AiProviderRegistry {
  return new AiProviderRegistry(options);
}
