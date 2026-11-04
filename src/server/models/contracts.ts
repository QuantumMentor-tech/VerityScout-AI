/**
 * VerityScout AI — Model Catalog, Capabilities, and Taxonomy Contracts
 * Governed by: Step 41 (Model Catalog, Model Capabilities, and Supported Operations)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Core Principles:
 * 1. Provider-Agnostic Representation: Standardized representation across OpenAI, OpenRouter, and NVIDIA NIM.
 * 2. Typed Capability Taxonomy: Distinguishes strict schema-constrained output, JSON object mode, and post-parse validation.
 * 3. Trinary Verification & Provenance: Never silently assumes unsupported or unverified capabilities are supported.
 * 4. Resilient Fallbacks: Discovered models enrich static definitions; catalog never wipes entries on refresh failure.
 * 5. Strict Credential Isolation: Never exposes secret keys or tokens in catalog contracts.
 */

import { z } from 'zod';
import {
  type AiProviderId,
  AI_PROVIDER_IDS,
  isAiProviderId,
  assertValidProviderId,
} from '@/server/providers/contracts/provider-id';

export { type AiProviderId, AI_PROVIDER_IDS, isAiProviderId, assertValidProviderId };

// ============================================================================
// 1. CAPABILITY TAXONOMY ENUMS & TYPES
// ============================================================================

export const MODEL_CAPABILITY_TYPES = [
  'text_generation',
  'structured_output',
  'streaming',
  'tool_calling',
  'image_input',
] as const;
export type ModelCapabilityType = (typeof MODEL_CAPABILITY_TYPES)[number];

export const STRUCTURED_OUTPUT_LEVELS = [
  'SCHEMA_CONSTRAINED', // Strict API JSON schema enforcement (e.g. OpenAI json_schema strict mode)
  'JSON_OBJECT',        // Urged JSON mode (e.g. response_format: { type: "json_object" })
  'POST_VALIDATED',     // Raw text completion parsed and validated by client-side parser (e.g. Zod)
  'UNSUPPORTED',        // Cannot output structured JSON or model explicitly rejects it
  'UNKNOWN',            // Capability untested or unmeasured
] as const;
export type StructuredOutputSupportLevel = (typeof STRUCTURED_OUTPUT_LEVELS)[number];

export const CAPABILITY_VERIFICATION_STATUSES = [
  'SUPPORTED',
  'UNSUPPORTED',
  'UNKNOWN',
] as const;
export type CapabilityVerificationStatus = (typeof CAPABILITY_VERIFICATION_STATUSES)[number];

export const CAPABILITY_PROVENANCES = [
  'PROVIDER_DECLARED',    // Explicitly reported by provider discovery API
  'STATIC_BUNDLED',       // Curated in VerityScout AI static baseline catalog
  'OPERATOR_CONFIGURED',  // Declared via administrator or user configuration
  'VERIFIED_PROBE',       // Empirically confirmed through active test probe
  'UNKNOWN',              // Provenance undetermined
] as const;
export type CapabilityProvenance = (typeof CAPABILITY_PROVENANCES)[number];

export const MODEL_AVAILABILITY_STATES = [
  'AVAILABLE',            // Active and ready for inference
  'CONFIGURED_ONLY',      // Configured in settings but discovery not yet confirmed
  'DISCOVERED_ONLY',      // Found in remote API, but provider credential/settings unverified
  'UNAVAILABLE',          // Provider unhealthy, connection failed, or marked disabled
  'DEPRECATED',           // Flagged as deprecated or superseded
  'UNKNOWN',              // Initial or unmeasured state
] as const;
export type ModelAvailabilityState = (typeof MODEL_AVAILABILITY_STATES)[number];

// ============================================================================
// 2. CAPABILITY SCHEMAS & INTERFACES
// ============================================================================

export const BooleanCapabilitySchema = z.object({
  supported: z.boolean(),
  provenance: z.enum(CAPABILITY_PROVENANCES),
  notes: z.string().optional(),
});
export type BooleanCapability = z.infer<typeof BooleanCapabilitySchema>;

export const StructuredOutputCapabilitySchema = z.object({
  status: z.enum(CAPABILITY_VERIFICATION_STATUSES),
  level: z.enum(STRUCTURED_OUTPUT_LEVELS),
  provenance: z.enum(CAPABILITY_PROVENANCES),
  notes: z.string().optional(),
});
export type StructuredOutputCapability = z.infer<typeof StructuredOutputCapabilitySchema>;

export const ModelCapabilitiesSchema = z.object({
  textGeneration: BooleanCapabilitySchema,
  structuredOutput: StructuredOutputCapabilitySchema,
  streaming: BooleanCapabilitySchema,
  toolCalling: BooleanCapabilitySchema,
  imageInput: BooleanCapabilitySchema,
});
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

export const ModelPricingSchema = z.object({
  promptCostPer1MUsd: z.number().nonnegative().optional(),
  completionCostPer1MUsd: z.number().nonnegative().optional(),
});
export type ModelPricing = z.infer<typeof ModelPricingSchema>;

// ============================================================================
// 3. MODEL CATALOG ENTRY CONTRACT
// ============================================================================

export const ModelCatalogEntrySchema = z.object({
  id: z.string().min(3),
  providerId: z.enum(AI_PROVIDER_IDS),
  nativeModelId: z.string().min(1),
  displayName: z.string().min(1),
  family: z.string().min(1),
  description: z.string().optional(),
  contextWindowTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  pricing: ModelPricingSchema.optional(),
  capabilities: ModelCapabilitiesSchema,
  availabilityState: z.enum(MODEL_AVAILABILITY_STATES),
  provenance: z.enum(CAPABILITY_PROVENANCES),
  isRecommended: z.boolean(),
  lastVerifiedAt: z.string().datetime().optional(),
  lastRefreshedAt: z.string().datetime(),
});

export interface ModelCatalogEntry {
  readonly id: string;
  readonly providerId: AiProviderId;
  readonly nativeModelId: string;
  readonly displayName: string;
  readonly family: string;
  readonly description?: string | undefined;
  readonly contextWindowTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly pricing?: ModelPricing | undefined;
  readonly capabilities: ModelCapabilities;
  readonly availabilityState: ModelAvailabilityState;
  readonly provenance: CapabilityProvenance;
  readonly isRecommended: boolean;
  readonly lastVerifiedAt?: string | undefined;
  readonly lastRefreshedAt: string;
}

// ============================================================================
// 4. QUERY FILTERING INTERFACE & SCHEMA
// ============================================================================

export const ModelCatalogQuerySchema = z.object({
  providerId: z.enum(AI_PROVIDER_IDS).optional(),
  requiredCapabilities: z.array(z.enum(MODEL_CAPABILITY_TYPES)).optional(),
  structuredOutputLevels: z.array(z.enum(STRUCTURED_OUTPUT_LEVELS)).optional(),
  supportsImages: z.boolean().optional(),
  minContextWindow: z.number().int().positive().optional(),
  availabilityStates: z.array(z.enum(MODEL_AVAILABILITY_STATES)).optional(),
  family: z.string().optional(),
  searchTerm: z.string().optional(),
});

export interface ModelCatalogQuery {
  readonly providerId?: AiProviderId | undefined;
  readonly requiredCapabilities?: readonly ModelCapabilityType[] | undefined;
  readonly structuredOutputLevels?: readonly StructuredOutputSupportLevel[] | undefined;
  readonly supportsImages?: boolean | undefined;
  readonly minContextWindow?: number | undefined;
  readonly availabilityStates?: readonly ModelAvailabilityState[] | undefined;
  readonly family?: string | undefined;
  readonly searchTerm?: string | undefined;
}

// ============================================================================
// 5. REFRESH & OPERATION SUMMARY CONTRACTS
// ============================================================================

export interface ProviderRefreshResult {
  readonly status: 'SUCCESS' | 'ERROR' | 'SKIPPED';
  readonly modelCount: number;
  readonly error?: string | undefined;
}

export interface CatalogRefreshSummary {
  readonly refreshedCount: number;
  readonly providerResults: Record<AiProviderId, ProviderRefreshResult>;
  readonly timestamp: string;
}

// ============================================================================
// 6. IDENTIFIER AND MATCHING UTILITIES
// ============================================================================

/**
 * Builds a standardized canonical model catalog ID: "providerId:nativeModelId"
 */
export function createModelCatalogId(providerId: AiProviderId, nativeModelId: string): string {
  assertValidProviderId(providerId);
  const trimmed = nativeModelId.trim();
  if (!trimmed) {
    throw new Error('Native model ID cannot be empty or whitespace');
  }
  return `${providerId}:${trimmed}`;
}

/**
 * Parses a standardized model catalog ID ("providerId:nativeModelId")
 */
export function parseModelCatalogId(catalogId: string): { providerId: AiProviderId; nativeModelId: string } {
  const colonIndex = catalogId.indexOf(':');
  if (colonIndex <= 0 || colonIndex === catalogId.length - 1) {
    throw new Error(
      `Invalid serialized model catalog ID: "${catalogId}". Expected format "providerId:nativeModelId"`
    );
  }
  const providerPart = catalogId.slice(0, colonIndex);
  const nativeModelId = catalogId.slice(colonIndex + 1);

  if (!isAiProviderId(providerPart)) {
    throw new Error(`Unknown provider ID in model catalog ID: "${providerPart}"`);
  }

  return { providerId: providerPart, nativeModelId };
}

/**
 * Evaluates whether a ModelCatalogEntry satisfies the constraints in a ModelCatalogQuery.
 */
export function matchesModelQuery(entry: ModelCatalogEntry, query?: ModelCatalogQuery): boolean {
  if (!query) {
    return true;
  }

  // 1. Provider ID match
  if (query.providerId && entry.providerId !== query.providerId) {
    return false;
  }

  // 2. Family match (case-insensitive)
  if (query.family && entry.family.toLowerCase() !== query.family.toLowerCase()) {
    return false;
  }

  // 3. Availability states
  if (query.availabilityStates && query.availabilityStates.length > 0) {
    if (!query.availabilityStates.includes(entry.availabilityState)) {
      return false;
    }
  }

  // 4. Minimum Context Window
  if (query.minContextWindow !== undefined) {
    if (entry.contextWindowTokens === undefined || entry.contextWindowTokens < query.minContextWindow) {
      return false;
    }
  }

  // 5. Image / Vision Support
  if (query.supportsImages !== undefined) {
    if (entry.capabilities.imageInput.supported !== query.supportsImages) {
      return false;
    }
  }

  // 6. Structured Output Levels
  if (query.structuredOutputLevels && query.structuredOutputLevels.length > 0) {
    if (!query.structuredOutputLevels.includes(entry.capabilities.structuredOutput.level)) {
      return false;
    }
  }

  // 7. Required Capabilities
  if (query.requiredCapabilities && query.requiredCapabilities.length > 0) {
    for (const cap of query.requiredCapabilities) {
      switch (cap) {
        case 'text_generation':
          if (!entry.capabilities.textGeneration.supported) return false;
          break;
        case 'structured_output':
          if (entry.capabilities.structuredOutput.status !== 'SUPPORTED') return false;
          break;
        case 'streaming':
          if (!entry.capabilities.streaming.supported) return false;
          break;
        case 'tool_calling':
          if (!entry.capabilities.toolCalling.supported) return false;
          break;
        case 'image_input':
          if (!entry.capabilities.imageInput.supported) return false;
          break;
      }
    }
  }

  // 8. Search term (case-insensitive substring on id, nativeModelId, displayName, description)
  if (query.searchTerm) {
    const term = query.searchTerm.toLowerCase().trim();
    if (term) {
      const idMatch = entry.id.toLowerCase().includes(term);
      const nameMatch = entry.displayName.toLowerCase().includes(term);
      const nativeMatch = entry.nativeModelId.toLowerCase().includes(term);
      const descMatch = entry.description ? entry.description.toLowerCase().includes(term) : false;
      const familyMatch = entry.family.toLowerCase().includes(term);

      if (!idMatch && !nameMatch && !nativeMatch && !descMatch && !familyMatch) {
        return false;
      }
    }
  }

  return true;
}

