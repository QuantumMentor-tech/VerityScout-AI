import 'server-only';

/**
 * VerityScout AI — Model Router Service (Auto-Pick & Explicit Routing)
 * Governed by: Step 42 (Auto-Pick Model Router and Capability-Aware Model Selection)
 * Roadmap Phase: Phase 9 (Model Routing and Asynchronous Research)
 *
 * Core Architectural Rules:
 * 1. Strict Capability Enforcement: Never select a model that fails mandatory operation requirements.
 * 2. User-Choice Preservation: Explicit model choices are preserved unless incompatible, and fallback requires explicit authorization.
 * 3. 100% Deterministic: Zero LLM participation in routing. Lexicographical tie-breaking ensures reproducibility.
 * 4. Zero Credential Exposure: Never copies API keys or authorization tokens into routing decisions.
 * 5. Bounded & Resilient: Uses in-memory catalog data; handles unknown and missing providers safely.
 */

import { randomUUID } from 'node:crypto';
import {
  type AiProviderId,
  isAiProviderId,
} from '../contracts';
import {
  getDefaultModelCatalogService,
  type ModelCatalogService,
} from '../model-catalog.service';
import {
  type ModelRoutingRequest,
  type ModelRoutingDecision,
  type SelectedModelInfo,
  type CandidateRejection,
  ModelRoutingRequestSchema,
} from './router-contracts';
import { resolveOperationProfile } from './operation-profiles';
import {
  evaluateCandidateEligibility,
  rankEligibleCandidates,
  type ProviderConfigStatus,
  type RoutingPreferences,
} from './candidate-evaluator';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import { logger } from '@/lib/logging/logger';

export const ROUTING_POLICY_VERSION = 'v1.0.0';

export interface ModelRouterServiceOptions {
  readonly catalogService?: ModelCatalogService | undefined;
  readonly providerConfigRepo?: ProviderConfigRepository | undefined;
}

export class ModelRouterService {
  private readonly catalogService: ModelCatalogService;
  private readonly providerConfigRepo: ProviderConfigRepository;

  constructor(options?: ModelRouterServiceOptions) {
    this.catalogService = options?.catalogService ?? getDefaultModelCatalogService();
    this.providerConfigRepo = options?.providerConfigRepo ?? new ProviderConfigRepository();
  }

  /**
   * Evaluates user provider configurations from repository.
   */
  private async loadUserProviderStatuses(
    userId: string
  ): Promise<Map<AiProviderId, ProviderConfigStatus>> {
    const statusMap = new Map<AiProviderId, ProviderConfigStatus>();

    try {
      const rows = await this.providerConfigRepo.listByOwner(userId);
      for (const row of rows) {
        if (row.provider_id && isAiProviderId(row.provider_id)) {
          statusMap.set(row.provider_id, {
            providerId: row.provider_id,
            isEnabled: row.is_enabled ?? true,
            isHealthy: row.last_connection_test_status !== 'FAILED',
            hasCredential: row.has_credential ?? false,
            selectedModelId: row.selected_model_id ?? undefined,
          });
        }
      }
    } catch (err) {
      // In test or non-DB environments, log diagnostic and proceed with unconfigured map
      logger.warn(
        'ROUTER_PROVIDER_CONFIG_LOOKUP_WARNING',
        `Unable to load user provider configurations for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        { userId }
      );
    }

    return statusMap;
  }

  /**
   * Executes capability-aware model routing for an AI operation.
   */
  public async route(request: ModelRoutingRequest): Promise<ModelRoutingDecision> {
    const decisionId = randomUUID();
    const timestamp = new Date().toISOString();

    // 1. Validate request structure
    const validationResult = ModelRoutingRequestSchema.safeParse(request);
    if (!validationResult.success) {
      return {
        decisionId,
        status: 'INVALID_REQUEST',
        routingMode: request.routingMode ?? 'AUTO_PICK',
        operationType: request.operationType,
        policyVersion: ROUTING_POLICY_VERSION,
        selectedModel: null,
        selectionReasons: ['INVALID_ROUTING_REQUEST_SCHEMA'],
        explanation: `Request validation failed: ${validationResult.error.message}`,
        eligibleCandidatesCount: 0,
        rejectedCandidates: [],
        timestamp,
      };
    }

    const {
      userId,
      operationType,
      customRequirements,
      routingMode = 'AUTO_PICK',
      explicitSelection,
      preferredProviders,
      preferredFamilies,
      allowFallback = false,
      correlationId,
    } = request;

    // 2. Resolve technical requirements profile
    const profile = resolveOperationProfile(operationType, customRequirements);

    // 3. Load user provider statuses
    const providerStatuses = await this.loadUserProviderStatuses(userId);

    // 4. Handle EXPLICIT Selection Mode
    if (explicitSelection && routingMode === 'EXPLICIT') {
      const { providerId, modelId } = explicitSelection;
      const explicitModel = await this.catalogService.getModel(providerId, modelId);
      const providerStatus = providerStatuses.get(providerId);

      if (!explicitModel) {
        const rejection: CandidateRejection = {
          modelId,
          providerId,
          reasonCode: 'UNKNOWN_MODEL',
          details: `Requested model "${providerId}:${modelId}" does not exist in catalog`,
        };

        if (allowFallback) {
          logger.info(
            'ROUTER_EXPLICIT_FALLBACK_TRIGGERED',
            `Explicit model "${providerId}:${modelId}" unknown; falling back to Auto-Pick`,
            { userId, operationType, correlationId }
          );
          return this.executeAutoPick({
            userId,
            profile,
            providerStatuses,
            preferredProviders,
            preferredFamilies,
            decisionId,
            timestamp,
            correlationId,
            fallbackTriggerReason: `Explicit model "${providerId}:${modelId}" unknown`,
            initialRejections: [rejection],
          });
        }

        return {
          decisionId,
          status: 'EXPLICIT_INCOMPATIBLE',
          routingMode: 'EXPLICIT',
          operationType,
          policyVersion: ROUTING_POLICY_VERSION,
          selectedModel: null,
          selectionReasons: ['EXPLICIT_MODEL_NOT_FOUND'],
          explanation: `Explicitly chosen model "${providerId}:${modelId}" is not present in the model catalog and fallback is disabled.`,
          eligibleCandidatesCount: 0,
          rejectedCandidates: [rejection],
          timestamp,
        };
      }

      const { isEligible, rejection } = evaluateCandidateEligibility(
        explicitModel,
        profile,
        providerStatus
      );

      if (isEligible) {
        const selectedInfo = this.formatSelectedModelInfo(explicitModel);
        return {
          decisionId,
          status: 'SUCCESS',
          routingMode: 'EXPLICIT',
          operationType,
          policyVersion: ROUTING_POLICY_VERSION,
          selectedModel: selectedInfo,
          selectionReasons: [
            'EXPLICIT_SELECTION_PRESERVED',
            'MATCHES_MANDATORY_CAPABILITIES',
            ...(explicitModel.capabilities.structuredOutput.level === 'SCHEMA_CONSTRAINED'
              ? ['STRICT_JSON_SCHEMA_SUPPORTED']
              : []),
          ],
          explanation: `Explicitly chosen model "${explicitModel.id}" satisfies all mandatory capabilities for operation "${operationType}".`,
          eligibleCandidatesCount: 1,
          rejectedCandidates: [],
          timestamp,
        };
      }

      // Explicit model is ineligible
      const rejections: CandidateRejection[] = rejection ? [rejection] : [];
      if (allowFallback) {
        logger.info(
          'ROUTER_EXPLICIT_FALLBACK_TRIGGERED',
          `Explicit model "${explicitModel.id}" ineligible (${rejection?.reasonCode}); falling back to Auto-Pick`,
          { userId, operationType, correlationId }
        );
        return this.executeAutoPick({
          userId,
          profile,
          providerStatuses,
          preferredProviders,
          preferredFamilies,
          decisionId,
          timestamp,
          correlationId,
          fallbackTriggerReason: `Explicit model "${explicitModel.id}" failed mandatory checks: ${rejection?.details}`,
          initialRejections: rejections,
        });
      }

      return {
        decisionId,
        status: 'EXPLICIT_INCOMPATIBLE',
        routingMode: 'EXPLICIT',
        operationType,
        policyVersion: ROUTING_POLICY_VERSION,
        selectedModel: null,
        selectionReasons: ['EXPLICIT_SELECTION_MANDATORY_CAPABILITY_VIOLATION'],
        explanation: `Explicitly chosen model "${explicitModel.id}" is incompatible: ${rejection?.details ?? 'Failed mandatory requirements'} (fallback is disabled).`,
        eligibleCandidatesCount: 0,
        rejectedCandidates: rejections,
        timestamp,
      };
    }

    // 5. Handle AUTO_PICK Mode
    return this.executeAutoPick({
      userId,
      profile,
      providerStatuses,
      preferredProviders,
      preferredFamilies,
      decisionId,
      timestamp,
      correlationId,
    });
  }

  /**
   * Internal execution of Auto-Pick candidate evaluation and ranking.
   */
  private async executeAutoPick(params: {
    readonly userId: string;
    readonly profile: ReturnType<typeof resolveOperationProfile>;
    readonly providerStatuses: Map<AiProviderId, ProviderConfigStatus>;
    readonly preferredProviders?: readonly AiProviderId[] | undefined;
    readonly preferredFamilies?: readonly string[] | undefined;
    readonly decisionId: string;
    readonly timestamp: string;
    readonly correlationId?: string | undefined;
    readonly fallbackTriggerReason?: string | undefined;
    readonly initialRejections?: readonly CandidateRejection[] | undefined;
  }): Promise<ModelRoutingDecision> {
    const {
      profile,
      providerStatuses,
      preferredProviders,
      preferredFamilies,
      decisionId,
      timestamp,
      correlationId,
      fallbackTriggerReason,
      initialRejections = [],
    } = params;

    const allModels = await this.catalogService.listModels();
    const eligible: typeof allModels[number][] = [];
    const rejections: CandidateRejection[] = [...initialRejections];

    for (const model of allModels) {
      const providerStatus = providerStatuses.get(model.providerId);
      const { isEligible, rejection } = evaluateCandidateEligibility(
        model,
        profile,
        providerStatus
      );

      if (isEligible) {
        eligible.push(model);
      } else if (rejection) {
        rejections.push(rejection);
      }
    }

    if (eligible.length === 0) {
      logger.warn(
        'ROUTER_NO_ELIGIBLE_MODEL',
        `No configured models satisfied mandatory requirements for operation "${profile.operationType}"`,
        {
          operationType: profile.operationType,
          totalInspected: allModels.length,
          totalRejected: rejections.length,
          correlationId,
        }
      );

      return {
        decisionId,
        status: 'NO_ELIGIBLE_MODEL',
        routingMode: fallbackTriggerReason ? 'FALLBACK' : 'AUTO_PICK',
        operationType: profile.operationType,
        policyVersion: ROUTING_POLICY_VERSION,
        selectedModel: null,
        selectionReasons: ['NO_ELIGIBLE_CANDIDATE_FOUND'],
        explanation: fallbackTriggerReason
          ? `Fallback triggered (${fallbackTriggerReason}), but no other configured models satisfied mandatory capabilities.`
          : `No configured model meets all mandatory technical requirements for "${profile.operationType}".`,
        eligibleCandidatesCount: 0,
        rejectedCandidates: rejections,
        timestamp,
      };
    }

    // Build user preferences map
    const userSelectedModelIds: Record<AiProviderId, string | undefined> = {
      openai: providerStatuses.get('openai')?.selectedModelId ?? undefined,
      openrouter: providerStatuses.get('openrouter')?.selectedModelId ?? undefined,
      nim: providerStatuses.get('nim')?.selectedModelId ?? undefined,
    };

    const preferences: RoutingPreferences = {
      preferredProviders,
      preferredFamilies,
      userSelectedModelIds,
    };

    // Rank candidates deterministically
    const ranked = rankEligibleCandidates(eligible, preferences);
    const winningCandidate = ranked[0]!;
    const alternativeCandidates = ranked.slice(1).map((m) => this.formatSelectedModelInfo(m));

    // Formulate structured selection reasons
    const selectionReasons: string[] = ['MATCHES_MANDATORY_CAPABILITIES'];
    if (winningCandidate.capabilities.structuredOutput.level === 'SCHEMA_CONSTRAINED') {
      selectionReasons.push('STRICT_JSON_SCHEMA_SUPPORTED');
    }
    if (winningCandidate.isRecommended) {
      selectionReasons.push('CURATED_RECOMMENDED_MODEL');
    }
    if (userSelectedModelIds[winningCandidate.providerId] === winningCandidate.nativeModelId) {
      selectionReasons.push('USER_CONFIGURED_MODEL_PREFERENCE');
    }
    if (preferredProviders && preferredProviders[0] === winningCandidate.providerId) {
      selectionReasons.push('PRIMARY_PREFERRED_PROVIDER');
    }
    selectionReasons.push('DETERMINISTIC_SELECTION_POLICY');

    const routingMode = fallbackTriggerReason ? 'FALLBACK' : 'AUTO_PICK';
    const explanation = fallbackTriggerReason
      ? `Selected "${winningCandidate.id}" as fallback (${fallbackTriggerReason}) because it satisfies all mandatory requirements and scored highest under the selection policy.`
      : `Auto-Pick selected "${winningCandidate.id}" because it satisfies all mandatory capabilities for "${profile.operationType}" and scored highest among ${eligible.length} eligible models.`;

    logger.info(
      'ROUTER_SELECTION_SUCCESS',
      `Model router selected "${winningCandidate.id}" via ${routingMode} for "${profile.operationType}"`,
      {
        selectedModelId: winningCandidate.id,
        routingMode,
        operationType: profile.operationType,
        eligibleCount: eligible.length,
        rejectedCount: rejections.length,
        correlationId,
      }
    );

    return {
      decisionId,
      status: 'SUCCESS',
      routingMode,
      operationType: profile.operationType,
      policyVersion: ROUTING_POLICY_VERSION,
      selectedModel: this.formatSelectedModelInfo(winningCandidate),
      selectionReasons,
      explanation,
      eligibleCandidatesCount: eligible.length,
      rejectedCandidates: rejections,
      alternativeCandidates,
      timestamp,
    };
  }

  /**
   * Helper to format a ModelCatalogEntry into a public SelectedModelInfo structure.
   */
  private formatSelectedModelInfo(model: ReturnType<typeof this.formatModelTuple>): SelectedModelInfo {
    return {
      providerId: model.providerId,
      nativeModelId: model.nativeModelId,
      catalogId: model.id,
      displayName: model.displayName,
      family: model.family,
      structuredOutputLevel: model.capabilities.structuredOutput.level,
      contextWindowTokens: model.contextWindowTokens,
      maxOutputTokens: model.maxOutputTokens,
      isRecommended: model.isRecommended,
    };
  }

  private formatModelTuple(m: Parameters<typeof evaluateCandidateEligibility>[0]) {
    return m;
  }
}

// Singleton router instance management
let defaultModelRouterService: ModelRouterService | null = null;

export function getDefaultModelRouterService(): ModelRouterService {
  if (!defaultModelRouterService) {
    defaultModelRouterService = new ModelRouterService();
  }
  return defaultModelRouterService;
}

export function resetDefaultModelRouterService(): void {
  defaultModelRouterService = null;
}
