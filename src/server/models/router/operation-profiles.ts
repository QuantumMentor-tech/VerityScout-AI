/**
 * VerityScout AI — Standard Operation Requirement Profiles
 * Governed by: Step 42 (Auto-Pick Model Router and Capability-Aware Model Selection)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Defines explicit technical profiles describing what each AI operation requires.
 */

import {
  type ModelOperationProfile,
  type ModelOperationType,
} from './router-contracts';

export const STANDARD_OPERATION_PROFILES: Record<string, ModelOperationProfile> = {
  claim_extraction: {
    operationType: 'claim_extraction',
    requiredCapabilities: ['text_generation', 'structured_output'],
    minimumStructuredOutputLevel: 'JSON_OBJECT',
    minimumContextTokens: 8000,
    allowUnverifiedCapabilities: false,
    description: 'Structured fact claim extraction with strict quote grounding from extracted sources',
  },
  research_synthesis: {
    operationType: 'research_synthesis',
    requiredCapabilities: ['text_generation', 'structured_output'],
    minimumStructuredOutputLevel: 'JSON_OBJECT',
    minimumContextTokens: 16000,
    allowUnverifiedCapabilities: false,
    description: 'Evidence-linked research synthesis evaluating verified claims against queries',
  },
  structured_generation: {
    operationType: 'structured_generation',
    requiredCapabilities: ['text_generation', 'structured_output'],
    minimumStructuredOutputLevel: 'SCHEMA_CONSTRAINED',
    minimumContextTokens: 4000,
    allowUnverifiedCapabilities: false,
    description: 'Strict API JSON schema-constrained structured object generation',
  },
  streaming_generation: {
    operationType: 'streaming_generation',
    requiredCapabilities: ['text_generation', 'streaming'],
    requiresStreaming: true,
    minimumContextTokens: 4000,
    allowUnverifiedCapabilities: false,
    description: 'Interactive low-latency token streaming generation',
  },
  multimodal_research: {
    operationType: 'multimodal_research',
    requiredCapabilities: ['text_generation', 'image_input'],
    requiredInputModality: 'image',
    minimumContextTokens: 8000,
    allowUnverifiedCapabilities: false,
    description: 'Multimodal visual document and image evidence evaluation',
  },
};

/**
 * Resolves an operation requirement profile, applying any custom overrides.
 */
export function resolveOperationProfile(
  operationType: ModelOperationType,
  overrides?: Partial<ModelOperationProfile> | undefined
): ModelOperationProfile {
  const baseProfile = STANDARD_OPERATION_PROFILES[operationType] ?? {
    operationType,
    requiredCapabilities: ['text_generation'],
    minimumStructuredOutputLevel: 'POST_VALIDATED',
    allowUnverifiedCapabilities: false,
    description: `Generic model-backed operation: ${operationType}`,
  };

  if (!overrides) {
    return baseProfile;
  }

  return {
    ...baseProfile,
    ...overrides,
    operationType,
    requiredCapabilities: overrides.requiredCapabilities ?? baseProfile.requiredCapabilities,
  };
}

