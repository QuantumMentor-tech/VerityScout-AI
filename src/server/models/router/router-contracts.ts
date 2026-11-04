/**
 * VerityScout AI — Model Router Contracts, Operation Profiles & Rejection Taxonomy
 * Governed by: Step 42 (Auto-Pick Model Router and Capability-Aware Model Selection)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Core Principles:
 * 1. Capability-Aware Eligibility: Mandatory technical requirements must be verified before ranking.
 * 2. User-Choice Preservation: Explicit user selections are never silently overridden without authorized fallback.
 * 3. Trinary Verification: UNKNOWN capabilities are never treated as established support for mandatory features.
 * 4. Deterministic Explainability: Auditable structured reason codes and truth-grounded selection explanations.
 * 5. Strict Credential Isolation: Never exposes API keys or secrets in routing requests or decisions.
 */

import { z } from 'zod';
import {
  type AiProviderId,
  AI_PROVIDER_IDS,
  type ModelCapabilityType,
  type StructuredOutputSupportLevel,
  MODEL_CAPABILITY_TYPES,
  STRUCTURED_OUTPUT_LEVELS,
} from '../contracts';

export { type AiProviderId, AI_PROVIDER_IDS };

// ============================================================================
// 1. OPERATION TYPES & ROUTING MODES
// ============================================================================

export const MODEL_OPERATIONS = [
  'claim_extraction',
  'research_synthesis',
  'structured_generation',
  'streaming_generation',
  'multimodal_research',
] as const;
export type ModelOperationType = (typeof MODEL_OPERATIONS)[number] | (string & {});

export const MODEL_ROUTING_MODES = [
  'AUTO_PICK',
  'EXPLICIT',
  'FALLBACK',
] as const;
export type ModelRoutingMode = (typeof MODEL_ROUTING_MODES)[number];

export const ROUTING_DECISION_STATUSES = [
  'SUCCESS',                   // Candidate successfully selected
  'NO_ELIGIBLE_MODEL',         // No configured model satisfied mandatory requirements
  'EXPLICIT_INCOMPATIBLE',     // Explicit selection failed compatibility checks and fallback is disabled
  'CONFIGURATION_UNAVAILABLE', // No enabled providers or valid credentials found for user
  'INVALID_REQUEST',           // Request format or required parameters invalid
] as const;
export type RoutingDecisionStatus = (typeof ROUTING_DECISION_STATUSES)[number];

// ============================================================================
// 2. CANDIDATE REJECTION TAXONOMY
// ============================================================================

export const CANDIDATE_REJECTION_REASONS = [
  'CAPABILITY_UNSUPPORTED',         // Model is confirmed to lack a mandatory capability
  'CAPABILITY_UNVERIFIED',          // Mandatory capability is UNKNOWN and strict verification is required
  'OUTPUT_FORMAT_INCOMPATIBLE',     // Model does not satisfy required structured output level
  'CONTEXT_CAPACITY_INSUFFICIENT',  // Model known context window is less than required tokens
  'PROVIDER_DISABLED',              // Provider is disabled in user configuration
  'PROVIDER_UNCONFIGURED',          // Provider has no credentials configured for user
  'PROVIDER_UNHEALTHY',             // Provider connection test or health check is marked failing
  'MODEL_UNAVAILABLE',              // Model is marked UNAVAILABLE or DEPRECATED in catalog
  'DEPLOYMENT_RESTRICTED',          // Model restricted by user or administrative policy
  'UNKNOWN_MODEL',                  // Model identifier was not found in catalog
] as const;
export type CandidateRejectionReason = (typeof CANDIDATE_REJECTION_REASONS)[number];

export interface CandidateRejection {
  readonly modelId: string;
  readonly providerId: AiProviderId;
  readonly reasonCode: CandidateRejectionReason;
  readonly details: string;
}

// ============================================================================
// 3. OPERATION REQUIREMENT PROFILE CONTRACT
// ============================================================================

export const ModelOperationProfileSchema = z.object({
  operationType: z.string().min(1),
  requiredCapabilities: z.array(z.enum(MODEL_CAPABILITY_TYPES)).optional(),
  minimumStructuredOutputLevel: z.enum(STRUCTURED_OUTPUT_LEVELS).optional(),
  requiredInputModality: z.enum(['text', 'image', 'multimodal']).optional(),
  minimumContextTokens: z.number().int().positive().optional(),
  minimumOutputTokens: z.number().int().positive().optional(),
  requiresStreaming: z.boolean().optional(),
  allowUnverifiedCapabilities: z.boolean().optional(),
  description: z.string().optional(),
});

export interface ModelOperationProfile {
  readonly operationType: ModelOperationType;
  readonly requiredCapabilities?: readonly ModelCapabilityType[] | undefined;
  readonly minimumStructuredOutputLevel?: StructuredOutputSupportLevel | undefined;
  readonly requiredInputModality?: 'text' | 'image' | 'multimodal' | undefined;
  readonly minimumContextTokens?: number | undefined;
  readonly minimumOutputTokens?: number | undefined;
  readonly requiresStreaming?: boolean | undefined;
  readonly allowUnverifiedCapabilities?: boolean | undefined;
  readonly description?: string | undefined;
}

// ============================================================================
// 4. ROUTING REQUEST & PREFERENCES CONTRACT
// ============================================================================

export interface ExplicitModelSelection {
  readonly providerId: AiProviderId;
  readonly modelId: string;
}

export const ModelRoutingRequestSchema = z.object({
  userId: z.string().min(1),
  operationType: z.string().min(1),
  customRequirements: ModelOperationProfileSchema.partial().optional(),
  routingMode: z.enum(MODEL_ROUTING_MODES).optional(),
  explicitSelection: z.object({
    providerId: z.enum(AI_PROVIDER_IDS),
    modelId: z.string().min(1),
  }).optional(),
  preferredProviders: z.array(z.enum(AI_PROVIDER_IDS)).optional(),
  preferredFamilies: z.array(z.string()).optional(),
  allowFallback: z.boolean().optional(),
  correlationId: z.string().optional(),
});

export interface ModelRoutingRequest {
  readonly userId: string;
  readonly operationType: ModelOperationType;
  readonly customRequirements?: Partial<ModelOperationProfile> | undefined;
  readonly routingMode?: ModelRoutingMode | undefined;
  readonly explicitSelection?: ExplicitModelSelection | undefined;
  readonly preferredProviders?: readonly AiProviderId[] | undefined;
  readonly preferredFamilies?: readonly string[] | undefined;
  readonly allowFallback?: boolean | undefined;
  readonly correlationId?: string | undefined;
}

// ============================================================================
// 5. ROUTING DECISION CONTRACT
// ============================================================================

export interface SelectedModelInfo {
  readonly providerId: AiProviderId;
  readonly nativeModelId: string;
  readonly catalogId: string;
  readonly displayName: string;
  readonly family: string;
  readonly structuredOutputLevel: StructuredOutputSupportLevel;
  readonly contextWindowTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly isRecommended: boolean;
}

export interface ModelRoutingDecision {
  readonly decisionId: string;
  readonly status: RoutingDecisionStatus;
  readonly routingMode: ModelRoutingMode;
  readonly operationType: ModelOperationType;
  readonly policyVersion: string;
  readonly selectedModel: SelectedModelInfo | null;
  readonly selectionReasons: readonly string[];
  readonly explanation: string;
  readonly eligibleCandidatesCount: number;
  readonly rejectedCandidates: readonly CandidateRejection[];
  readonly alternativeCandidates?: readonly SelectedModelInfo[] | undefined;
  readonly timestamp: string;
}

