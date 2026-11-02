/**
 * VerityScout AI — Model Metadata & Reference Contracts
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Architectural Rules:
 * 1. Model references uniquely identify a model by (providerId, modelId).
 * 2. Model metadata is independent of runtime connection or user credential state.
 * 3. Never fabricate context windows, price figures, or token limits.
 */

import { assertValidProviderId, isAiProviderId, type AiProviderId } from './provider-id';
import type { ProviderCapabilities } from './capabilities';

export interface ModelReference {
  readonly providerId: AiProviderId;
  readonly modelId: string;
}

export interface ContextWindowLimits {
  readonly contextWindowTokens?: number;
  readonly maxOutputTokens?: number;
}

export interface ModelPricingEstimate {
  readonly promptCostPer1MUsd?: number;
  readonly completionCostPer1MUsd?: number;
}

export interface ModelDefinition {
  readonly reference: ModelReference;
  readonly name: string;
  readonly description?: string;
  readonly capabilities: ProviderCapabilities;
  readonly limits?: ContextWindowLimits;
  readonly pricing?: ModelPricingEstimate;
  readonly isRecommended?: boolean;
  readonly lastVerifiedAt?: string;
}

/**
 * Creates a strongly-typed ModelReference.
 */
export function createModelReference(providerId: AiProviderId, modelId: string): ModelReference {
  assertValidProviderId(providerId);
  const trimmed = modelId.trim();
  if (!trimmed) {
    throw new Error('Model ID cannot be empty or whitespace');
  }
  return { providerId, modelId: trimmed };
}

/**
 * Formats a ModelReference as a standardized string: "providerId:modelId"
 */
export function formatModelReference(ref: ModelReference): string {
  return `${ref.providerId}:${ref.modelId}`;
}

/**
 * Parses a formatted model reference string ("providerId:modelId").
 */
export function parseModelReference(serialized: string): ModelReference {
  const colonIndex = serialized.indexOf(':');
  if (colonIndex <= 0 || colonIndex === serialized.length - 1) {
    throw new Error(
      `Invalid serialized model reference: "${serialized}". Expected format "providerId:modelId"`
    );
  }
  const providerPart = serialized.slice(0, colonIndex);
  const modelPart = serialized.slice(colonIndex + 1);

  if (!isAiProviderId(providerPart)) {
    throw new Error(`Unknown provider ID in model reference: "${providerPart}"`);
  }

  return createModelReference(providerPart, modelPart);
}
