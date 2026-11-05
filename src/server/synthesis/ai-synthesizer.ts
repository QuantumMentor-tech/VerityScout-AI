import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  SYNTHESIS_RULESET_VERSION,
  ResearchSynthesisOutputSchema,
  type ResearchSynthesisInput,
  type ResearchSynthesisOutput,
} from './contracts';
import {
  RESEARCH_SYNTHESIS_SYSTEM_PROMPT,
  buildSynthesisUserPrompt,
} from './prompt-template';
import { validateCitations } from './citation-validator';
import { getDefaultProviderRegistry } from '@/server/providers/registry';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import type { AiProviderId } from '@/server/providers/contracts/provider-id';
import {
  type ModelRouterService,
  getDefaultModelRouterService,
} from '@/server/models/router';
import { logger } from '@/lib/logging/logger';

export class AiResearchSynthesizer {
  private readonly credentialService: ProviderCredentialService;
  private readonly routerService?: ModelRouterService | undefined;

  constructor(
    credentialService?: ProviderCredentialService,
    routerService?: ModelRouterService
  ) {
    this.credentialService = credentialService ?? new ProviderCredentialService();
    this.routerService = routerService;
  }

  /**
   * Executes AI-assisted evidence synthesis with post-generation citation validation.
   */
  async synthesize(input: ResearchSynthesisInput): Promise<ResearchSynthesisOutput> {
    const startTime = Date.now();
    const {
      runId,
      userId,
      query,
      claims,
      sources,
      providerId = 'openai',
      modelId = 'gpt-4o-mini',
      useAutoPick,
      signal,
    } = input;

    let targetProviderId: AiProviderId = providerId as AiProviderId;
    let targetModelId = modelId;

    if (useAutoPick) {
      const router = this.routerService ?? getDefaultModelRouterService();
      const decision = await router.route({
        userId,
        operationType: 'research_synthesis',
        routingMode: 'AUTO_PICK',
        allowFallback: true,
        correlationId: `synthesis-${runId}`,
      });

      if (decision.status === 'SUCCESS' && decision.selectedModel) {
        targetProviderId = decision.selectedModel.providerId;
        targetModelId = decision.selectedModel.nativeModelId;
      } else {
        throw new Error(
          `Auto-Pick model routing failed for research synthesis: ${decision.explanation}`
        );
      }
    }

    const pId = targetProviderId;
    const registry = getDefaultProviderRegistry();
    const adapter = registry.getAdapter(pId);
    if (!adapter) {
      throw new Error(`AI Provider "${targetProviderId}" is not registered`);
    }

    // Resolve credentials
    const credentials = await this.credentialService.getDecryptedCredential(userId, pId);
    if (!credentials) {
      throw new Error(`No credentials configured for provider "${targetProviderId}" (user: ${userId})`);
    }

    const systemPrompt = RESEARCH_SYNTHESIS_SYSTEM_PROMPT;
    const userPrompt = buildSynthesisUserPrompt(query, claims, sources);

    try {
      const result = await registry.generateText(
        {
          modelRef: { providerId: pId, modelId: targetModelId },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          responseFormat: { type: 'json_object' },
          ...(signal ? { abortSignal: signal } : {}),
        },
        {
          userId,
          correlationId: `synthesis-${runId}`,
          runId,
          operationType: 'research_synthesis',
          ...(signal ? { abortSignal: signal } : {}),
        },
      );

      if (!result.success) {
        throw new Error(`AI Synthesis provider call failed: ${result.error.message}`);
      }

      const rawJson = JSON.parse(result.data.text);

      // Validate citations against eligible evidence (AC-04)
      const rawCitations = Array.isArray(rawJson.supportingCitations) ? rawJson.supportingCitations : [];
      const rawFindings = Array.isArray(rawJson.keyFindings) ? rawJson.keyFindings : [];

      const { validatedCitations, validatedFindings } = validateCitations(
        rawCitations,
        rawFindings,
        {
          runId,
          userId,
          eligibleClaims: claims,
          eligibleSources: sources,
        },
      );

      const candidateOutput = {
        id: `synth_${randomUUID()}`,
        runId,
        userId,
        query,
        status: validatedFindings.length > 0 ? 'SUCCESS' : 'PARTIAL',
        directAnswer: rawJson.directAnswer || `Evidence analysis completed for query: "${query}".`,
        keyFindings: validatedFindings,
        supportingCitations: validatedCitations,
        conflicts: Array.isArray(rawJson.conflicts) ? rawJson.conflicts : [],
        uncertaintiesAndLimitations: Array.isArray(rawJson.uncertaintiesAndLimitations)
          ? rawJson.uncertaintiesAndLimitations
          : [],
        candidateComparisons: Array.isArray(rawJson.candidateComparisons)
          ? rawJson.candidateComparisons
          : [],
        metadata: {
          synthesizedAt: new Date().toISOString(),
          rulesetVersion: SYNTHESIS_RULESET_VERSION,
          synthesizerStrategy: 'AI_PROVIDER',
          modelUsed: targetModelId,
          evidenceCoverage: {
            totalEligibleClaims: claims.length,
            citedClaimsCount: validatedCitations.length,
            sourcesCount: sources.length,
          },
          durationMs: Date.now() - startTime,
        },
      };

      return ResearchSynthesisOutputSchema.parse(candidateOutput);
    } catch (err) {
      logger.warn(
        'AI_SYNTHESIS_FALLBACK',
        'AI Synthesis failed or output was invalid, falling back to rule-based synthesis',
        {
          error: err instanceof Error ? err.message : String(err),
          runId,
          providerId,
        },
      );
      throw err;
    }
  }
}
