/**
 * VerityScout AI — Model Candidate Evaluator & Deterministic Ranker
 * Governed by: Step 42 (Auto-Pick Model Router and Capability-Aware Model Selection)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Core Principles:
 * 1. Hard Capability Filtering Before Ranking: No preference can override a mandatory technical requirement.
 * 2. Trinary Verification Enforcement: Unknown capabilities are not assumed supported when strict verification is required.
 * 3. 100% Deterministic Ordering: Lexicographical tie-breaking ensures identical inputs yield identical winning models.
 */

import {
  type ModelCatalogEntry,
  type StructuredOutputSupportLevel,
  type AiProviderId,
} from '../contracts';
import {
  type ModelOperationProfile,
  type CandidateRejection,
} from './router-contracts';

export interface ProviderConfigStatus {
  readonly providerId: AiProviderId;
  readonly isEnabled: boolean;
  readonly isHealthy: boolean;
  readonly hasCredential: boolean;
  readonly selectedModelId?: string | null | undefined;
}

export interface RoutingPreferences {
  readonly preferredProviders?: readonly AiProviderId[] | undefined;
  readonly preferredFamilies?: readonly string[] | undefined;
  readonly userSelectedModelIds?: Record<AiProviderId, string | null | undefined> | undefined;
}

const STRUCTURED_OUTPUT_RANK: Record<StructuredOutputSupportLevel, number> = {
  SCHEMA_CONSTRAINED: 4,
  JSON_OBJECT: 3,
  POST_VALIDATED: 2,
  UNSUPPORTED: 0,
  UNKNOWN: 1,
};

/**
 * Evaluates whether a candidate model satisfies all mandatory requirements for an operation profile.
 */
export function evaluateCandidateEligibility(
  model: ModelCatalogEntry,
  profile: ModelOperationProfile,
  providerStatus?: ProviderConfigStatus | undefined
): { isEligible: boolean; rejection?: CandidateRejection | undefined } {
  // 1. Provider configuration checks
  if (providerStatus) {
    if (!providerStatus.isEnabled) {
      return {
        isEligible: false,
        rejection: {
          modelId: model.nativeModelId,
          providerId: model.providerId,
          reasonCode: 'PROVIDER_DISABLED',
          details: `Provider "${model.providerId}" is disabled in user configuration`,
        },
      };
    }

    if (!providerStatus.hasCredential) {
      return {
        isEligible: false,
        rejection: {
          modelId: model.nativeModelId,
          providerId: model.providerId,
          reasonCode: 'PROVIDER_UNCONFIGURED',
          details: `No active credential configured for provider "${model.providerId}"`,
        },
      };
    }

    if (!providerStatus.isHealthy) {
      return {
        isEligible: false,
        rejection: {
          modelId: model.nativeModelId,
          providerId: model.providerId,
          reasonCode: 'PROVIDER_UNHEALTHY',
          details: `Provider "${model.providerId}" has failing connection health status`,
        },
      };
    }
  }

  // 2. Model availability check
  if (model.availabilityState === 'UNAVAILABLE' || model.availabilityState === 'DEPRECATED') {
    return {
      isEligible: false,
      rejection: {
        modelId: model.nativeModelId,
        providerId: model.providerId,
        reasonCode: 'MODEL_UNAVAILABLE',
        details: `Model "${model.id}" is marked ${model.availabilityState}`,
      },
    };
  }

  // 3. Structured output support level check
  if (profile.minimumStructuredOutputLevel) {
    const modelLevelRank = STRUCTURED_OUTPUT_RANK[model.capabilities.structuredOutput.level] ?? 0;
    const requiredLevelRank = STRUCTURED_OUTPUT_RANK[profile.minimumStructuredOutputLevel] ?? 0;

    if (modelLevelRank < requiredLevelRank) {
      return {
        isEligible: false,
        rejection: {
          modelId: model.nativeModelId,
          providerId: model.providerId,
          reasonCode: 'OUTPUT_FORMAT_INCOMPATIBLE',
          details: `Model structured output level "${model.capabilities.structuredOutput.level}" is below required "${profile.minimumStructuredOutputLevel}"`,
        },
      };
    }
  }

  // 4. Mandatory capability verification
  const requiredCaps = profile.requiredCapabilities ?? [];
  for (const cap of requiredCaps) {
    switch (cap) {
      case 'text_generation':
        if (!model.capabilities.textGeneration.supported) {
          return {
            isEligible: false,
            rejection: {
              modelId: model.nativeModelId,
              providerId: model.providerId,
              reasonCode: 'CAPABILITY_UNSUPPORTED',
              details: `Model "${model.id}" lacks required text generation capability`,
            },
          };
        }
        if (
          model.capabilities.textGeneration.provenance === 'UNKNOWN' &&
          !profile.allowUnverifiedCapabilities
        ) {
          return {
            isEligible: false,
            rejection: {
              modelId: model.nativeModelId,
              providerId: model.providerId,
              reasonCode: 'CAPABILITY_UNVERIFIED',
              details: `Text generation capability is unverified for model "${model.id}"`,
            },
          };
        }
        break;

      case 'structured_output':
        if (model.capabilities.structuredOutput.status !== 'SUPPORTED') {
          return {
            isEligible: false,
            rejection: {
              modelId: model.nativeModelId,
              providerId: model.providerId,
              reasonCode: 'CAPABILITY_UNSUPPORTED',
              details: `Model "${model.id}" lacks required structured output capability`,
            },
          };
        }
        break;

      case 'streaming':
        if (!model.capabilities.streaming.supported) {
          return {
            isEligible: false,
            rejection: {
              modelId: model.nativeModelId,
              providerId: model.providerId,
              reasonCode: 'CAPABILITY_UNSUPPORTED',
              details: `Model "${model.id}" lacks required streaming capability`,
            },
          };
        }
        break;

      case 'tool_calling':
        if (!model.capabilities.toolCalling.supported) {
          return {
            isEligible: false,
            rejection: {
              modelId: model.nativeModelId,
              providerId: model.providerId,
              reasonCode: 'CAPABILITY_UNSUPPORTED',
              details: `Model "${model.id}" lacks required tool calling capability`,
            },
          };
        }
        break;

      case 'image_input':
        if (!model.capabilities.imageInput.supported) {
          return {
            isEligible: false,
            rejection: {
              modelId: model.nativeModelId,
              providerId: model.providerId,
              reasonCode: 'CAPABILITY_UNSUPPORTED',
              details: `Model "${model.id}" lacks required vision/image input capability`,
            },
          };
        }
        break;
    }
  }

  // 5. Streaming requirement check
  if (profile.requiresStreaming && !model.capabilities.streaming.supported) {
    return {
      isEligible: false,
      rejection: {
        modelId: model.nativeModelId,
        providerId: model.providerId,
        reasonCode: 'CAPABILITY_UNSUPPORTED',
        details: `Operation explicitly requires streaming but model "${model.id}" does not support it`,
      },
    };
  }

  // 6. Input Modality check
  if (
    (profile.requiredInputModality === 'image' || profile.requiredInputModality === 'multimodal') &&
    !model.capabilities.imageInput.supported
  ) {
    return {
      isEligible: false,
      rejection: {
        modelId: model.nativeModelId,
        providerId: model.providerId,
        reasonCode: 'CAPABILITY_UNSUPPORTED',
        details: `Operation requires "${profile.requiredInputModality}" input modality, unsupported by "${model.id}"`,
      },
    };
  }

  // 7. Context window limit check
  if (
    profile.minimumContextTokens !== undefined &&
    model.contextWindowTokens !== undefined &&
    model.contextWindowTokens < profile.minimumContextTokens
  ) {
    return {
      isEligible: false,
      rejection: {
        modelId: model.nativeModelId,
        providerId: model.providerId,
        reasonCode: 'CONTEXT_CAPACITY_INSUFFICIENT',
        details: `Model context window (${model.contextWindowTokens} tokens) is below required minimum (${profile.minimumContextTokens} tokens)`,
      },
    };
  }

  return { isEligible: true };
}

/**
 * Calculates a deterministic score for an eligible model candidate.
 */
function calculateCandidateScore(
  model: ModelCatalogEntry,
  preferences?: RoutingPreferences | undefined
): number {
  let score = 0;

  // 1. User-configured model preference: Highest priority (+1000)
  if (preferences?.userSelectedModelIds) {
    const configuredModelId = preferences.userSelectedModelIds[model.providerId];
    if (configuredModelId && configuredModelId.toLowerCase() === model.nativeModelId.toLowerCase()) {
      score += 1000;
    }
  }

  // 2. Preferred provider ranking (+100 per rank position)
  if (preferences?.preferredProviders && preferences.preferredProviders.length > 0) {
    const providerIndex = preferences.preferredProviders.indexOf(model.providerId);
    if (providerIndex !== -1) {
      score += (preferences.preferredProviders.length - providerIndex) * 100;
    }
  }

  // 3. Preferred model family (+50)
  if (preferences?.preferredFamilies && preferences.preferredFamilies.length > 0) {
    if (preferences.preferredFamilies.some((f) => f.toLowerCase() === model.family.toLowerCase())) {
      score += 50;
    }
  }

  // 4. Curated recommended model (+40)
  if (model.isRecommended) {
    score += 40;
  }

  // 5. Structured output fidelity preference (+10 to +30)
  const structRank = STRUCTURED_OUTPUT_RANK[model.capabilities.structuredOutput.level] ?? 0;
  score += structRank * 10;

  // 6. Context capacity minor bonus (up to +20)
  if (model.contextWindowTokens) {
    score += Math.min(model.contextWindowTokens, 200000) / 10000;
  }

  return score;
}

/**
 * Ranks eligible candidates deterministically using policy preferences and lexicographical tie-breaking.
 */
export function rankEligibleCandidates(
  candidates: readonly ModelCatalogEntry[],
  preferences?: RoutingPreferences | undefined
): ModelCatalogEntry[] {
  const scored = candidates.map((candidate) => ({
    candidate,
    score: calculateCandidateScore(candidate, preferences),
  }));

  scored.sort((a, b) => {
    // Primary: Score descending
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Stable Tie-breaker: Lexicographical sort on canonical ID ascending
    return a.candidate.id.localeCompare(b.candidate.id);
  });

  return scored.map((s) => s.candidate);
}

