/**
 * VerityScout AI — AI Provider Adapter Interface Contract
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Architectural Rules:
 * 1. Interface definition only — concrete inference adapters belong to Steps 28-30.
 * 2. All operations accept an explicit, secure ProviderOperationContext.
 * 3. Adapters return standardized ProviderOperationResult<T> without leaking raw wire formats.
 */

import type { AiProviderId } from './provider-id';
import type { ProviderMetadata } from './metadata';
import type { ProviderCapabilities } from './capabilities';
import type { ModelDefinition } from './model';
import type { NormalizedInferenceRequest, NormalizedInferenceResponse } from './inference';
import type { ProviderOperationResult } from './operation-result';
import type { ConnectionTestResult } from '../connection-tester';

export interface ProviderOperationContext {
  readonly userId: string;
  readonly correlationId: string;
  readonly customBaseUrl?: string;
  readonly abortSignal?: AbortSignal;
}

export interface AiProviderAdapter {
  readonly id: AiProviderId;

  /**
   * Returns static metadata and documentation references for this provider.
   */
  getMetadata(): ProviderMetadata;

  /**
   * Returns trinary capability declarations for this provider integration.
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Performs an authenticated, non-inference connection test against the approved endpoint.
   */
  testConnection(context: ProviderOperationContext): Promise<ProviderOperationResult<ConnectionTestResult>>;

  /**
   * Retrieves or lists available models from the provider or catalog.
   */
  listModels(context: ProviderOperationContext): Promise<ProviderOperationResult<readonly ModelDefinition[]>>;

  /**
   * Dispatches a normalized text-generation / synthesis inference request.
   */
  generateText(
    request: NormalizedInferenceRequest,
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<NormalizedInferenceResponse>>;
}
