import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ModelRouterService,
  resolveOperationProfile,
  STANDARD_OPERATION_PROFILES,
  evaluateCandidateEligibility,
  rankEligibleCandidates,
  type ProviderConfigStatus,
  type ModelOperationProfile,
  type ModelRoutingRequest,
} from '@/server/models/router';
import {
  type ModelCatalogEntry,
  getStaticCatalog,
  getStaticModel,
  ModelCatalogService,
} from '@/server/models';
import type { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import type { ProviderConfigurationRow } from '@/server/persistence/types';
import { AiResearchSynthesizer } from '@/server/synthesis/ai-synthesizer';
import { AiClaimExtractor } from '@/server/claims/adapters/ai-claim-extractor';
import { VerificationState } from '@/server/persistence/types';
import { SourceAccessState, ExtractionState } from '@/server/extraction/contracts';
import type { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { createSuccessResult } from '@/server/providers/contracts/operation-result';
import type { AiProviderAdapter } from '@/server/providers/contracts/adapter';

describe('Step 42: Auto-Pick Model Router and Capability-Aware Model Selection', () => {
  let mockCatalogService: ModelCatalogService;
  let mockProviderConfigRepo: ProviderConfigRepository;

  beforeEach(() => {
    mockCatalogService = new ModelCatalogService();
    mockProviderConfigRepo = {
      listByOwner: vi.fn().mockResolvedValue([
        {
          id: 'cfg-1',
          user_id: 'user-test-1',
          provider_id: 'openai',
          is_enabled: true,
          selected_model_id: 'gpt-4o',
          custom_base_url: null,
          has_credential: true,
          credential_preview: 'sk-...1234',
          last_connection_test_at: '2026-02-01T00:00:00Z',
          last_connection_test_status: 'SUCCESS',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        } as ProviderConfigurationRow,
        {
          id: 'cfg-2',
          user_id: 'user-test-1',
          provider_id: 'openrouter',
          is_enabled: true,
          selected_model_id: null,
          custom_base_url: null,
          has_credential: true,
          credential_preview: 'sk-or-...5678',
          last_connection_test_at: '2026-02-01T00:00:00Z',
          last_connection_test_status: 'SUCCESS',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        } as ProviderConfigurationRow,
        {
          id: 'cfg-3',
          user_id: 'user-test-1',
          provider_id: 'nim',
          is_enabled: false, // Disabled provider for testing
          selected_model_id: null,
          custom_base_url: null,
          has_credential: true,
          credential_preview: 'nvapi-...9999',
          last_connection_test_at: '2026-02-01T00:00:00Z',
          last_connection_test_status: 'SUCCESS',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        } as ProviderConfigurationRow,
      ]),
    } as unknown as ProviderConfigRepository;
  });

  describe('1. Operation Requirement Profiles', () => {
    it('defines standard requirement profiles for core operations', () => {
      expect(STANDARD_OPERATION_PROFILES.claim_extraction).toBeDefined();
      expect(STANDARD_OPERATION_PROFILES.claim_extraction!.requiredCapabilities).toContain(
        'structured_output'
      );
      expect(STANDARD_OPERATION_PROFILES.claim_extraction!.minimumContextTokens).toBe(8000);

      expect(STANDARD_OPERATION_PROFILES.research_synthesis).toBeDefined();
      expect(STANDARD_OPERATION_PROFILES.research_synthesis!.minimumContextTokens).toBe(16000);

      expect(STANDARD_OPERATION_PROFILES.streaming_generation).toBeDefined();
      expect(STANDARD_OPERATION_PROFILES.streaming_generation!.requiresStreaming).toBe(true);

      expect(STANDARD_OPERATION_PROFILES.multimodal_research).toBeDefined();
      expect(STANDARD_OPERATION_PROFILES.multimodal_research!.requiredInputModality).toBe('image');
    });

    it('resolves standard operation profile with custom overrides without mutating original', () => {
      const resolved = resolveOperationProfile('claim_extraction', {
        minimumContextTokens: 32000,
        minimumStructuredOutputLevel: 'SCHEMA_CONSTRAINED',
      });

      expect(resolved.minimumContextTokens).toBe(32000);
      expect(resolved.minimumStructuredOutputLevel).toBe('SCHEMA_CONSTRAINED');
      // Original remains untouched
      expect(STANDARD_OPERATION_PROFILES.claim_extraction!.minimumContextTokens).toBe(8000);
    });

    it('creates safe generic profile for unknown operation types', () => {
      const generic = resolveOperationProfile('custom_analytics_op');
      expect(generic.operationType).toBe('custom_analytics_op');
      expect(generic.requiredCapabilities).toContain('text_generation');
      expect(generic.minimumStructuredOutputLevel).toBe('POST_VALIDATED');
    });
  });

  describe('2. Capability-Aware Eligibility Filtering', () => {
    const gpt4o = getStaticModel('openai', 'gpt-4o')!;
    const o1Mini = getStaticModel('openai', 'o1-mini')!;
    const llamaNIM = getStaticModel('nim', 'meta/llama-3.1-70b-instruct')!;

    it('approves a model that satisfies all mandatory requirements', () => {
      const profile = STANDARD_OPERATION_PROFILES.research_synthesis!;
      const providerStatus: ProviderConfigStatus = {
        providerId: 'openai',
        isEnabled: true,
        isHealthy: true,
        hasCredential: true,
      };

      const { isEligible, rejection } = evaluateCandidateEligibility(gpt4o, profile, providerStatus);
      expect(isEligible).toBe(true);
      expect(rejection).toBeUndefined();
    });

    it('rejects a model when provider is disabled in user configuration', () => {
      const profile = STANDARD_OPERATION_PROFILES.research_synthesis!;
      const disabledStatus: ProviderConfigStatus = {
        providerId: 'nim',
        isEnabled: false,
        isHealthy: true,
        hasCredential: true,
      };

      const { isEligible, rejection } = evaluateCandidateEligibility(llamaNIM, profile, disabledStatus);
      expect(isEligible).toBe(false);
      expect(rejection?.reasonCode).toBe('PROVIDER_DISABLED');
      expect(rejection?.details).toContain('disabled in user configuration');
    });

    it('rejects a model when provider has no credentials configured', () => {
      const profile = STANDARD_OPERATION_PROFILES.claim_extraction!;
      const unconfiguredStatus: ProviderConfigStatus = {
        providerId: 'openai',
        isEnabled: true,
        isHealthy: true,
        hasCredential: false,
      };

      const { isEligible, rejection } = evaluateCandidateEligibility(gpt4o, profile, unconfiguredStatus);
      expect(isEligible).toBe(false);
      expect(rejection?.reasonCode).toBe('PROVIDER_UNCONFIGURED');
    });

    it('rejects a model when provider health check is failing', () => {
      const profile = STANDARD_OPERATION_PROFILES.claim_extraction!;
      const unhealthyStatus: ProviderConfigStatus = {
        providerId: 'openai',
        isEnabled: true,
        isHealthy: false,
        hasCredential: true,
      };

      const { isEligible, rejection } = evaluateCandidateEligibility(gpt4o, profile, unhealthyStatus);
      expect(isEligible).toBe(false);
      expect(rejection?.reasonCode).toBe('PROVIDER_UNHEALTHY');
    });

    it('rejects a model when structured output level is below mandatory requirement', () => {
      const strictProfile: ModelOperationProfile = {
        operationType: 'strict_schema_op',
        minimumStructuredOutputLevel: 'SCHEMA_CONSTRAINED',
      };

      // o1-mini has level 'JSON_OBJECT', which is below 'SCHEMA_CONSTRAINED'
      const { isEligible, rejection } = evaluateCandidateEligibility(o1Mini, strictProfile);
      expect(isEligible).toBe(false);
      expect(rejection?.reasonCode).toBe('OUTPUT_FORMAT_INCOMPATIBLE');
      expect(rejection?.details).toContain('is below required');
    });

    it('rejects a model missing vision capability when image modality is required', () => {
      const visionProfile = STANDARD_OPERATION_PROFILES.multimodal_research!;
      // o1-mini lacks image input
      const { isEligible, rejection } = evaluateCandidateEligibility(o1Mini, visionProfile);
      expect(isEligible).toBe(false);
      expect(rejection?.reasonCode).toBe('CAPABILITY_UNSUPPORTED');
      expect(rejection?.details).toContain('image');
    });

    it('rejects a model with insufficient known context window', () => {
      const hugeContextProfile: ModelOperationProfile = {
        operationType: 'huge_document_synthesis',
        minimumContextTokens: 150000,
      };

      // gpt-4o has 128,000 context tokens (< 150,000)
      const { isEligible, rejection } = evaluateCandidateEligibility(gpt4o, hugeContextProfile);
      expect(isEligible).toBe(false);
      expect(rejection?.reasonCode).toBe('CONTEXT_CAPACITY_INSUFFICIENT');
    });

    it('rejects a model with UNKNOWN capability when strict verification is required', () => {
      const unverifiedModel: ModelCatalogEntry = {
        ...gpt4o,
        id: 'openai:unverified-model',
        nativeModelId: 'unverified-model',
        capabilities: {
          ...gpt4o.capabilities,
          textGeneration: { supported: true, provenance: 'UNKNOWN' },
        },
      };

      const profile: ModelOperationProfile = {
        operationType: 'strict_verification_op',
        requiredCapabilities: ['text_generation'],
        allowUnverifiedCapabilities: false,
      };

      const { isEligible, rejection } = evaluateCandidateEligibility(unverifiedModel, profile);
      expect(isEligible).toBe(false);
      expect(rejection?.reasonCode).toBe('CAPABILITY_UNVERIFIED');
    });
  });

  describe('3. Deterministic Candidate Ranking & Tie-Breaking', () => {
    it('prioritizes user-configured selected model above all else', () => {
      const gpt4o = getStaticModel('openai', 'gpt-4o')!;
      const gpt4oMini = getStaticModel('openai', 'gpt-4o-mini')!;
      const claude = getStaticModel('openrouter', 'anthropic/claude-3.5-sonnet')!;

      const candidates = [gpt4oMini, claude, gpt4o];
      const ranked = rankEligibleCandidates(candidates, {
        userSelectedModelIds: { openai: 'gpt-4o-mini', openrouter: undefined, nim: undefined },
      });

      expect(ranked[0]?.nativeModelId).toBe('gpt-4o-mini');
    });

    it('prioritizes preferred providers order when user model is unconfigured', () => {
      const gpt4o = getStaticModel('openai', 'gpt-4o')!;
      const claude = getStaticModel('openrouter', 'anthropic/claude-3.5-sonnet')!;

      // Both are recommended and have schema-constrained structured output
      const ranked = rankEligibleCandidates([gpt4o, claude], {
        preferredProviders: ['openrouter', 'openai'],
      });

      expect(ranked[0]?.providerId).toBe('openrouter');
      expect(ranked[0]?.nativeModelId).toBe('anthropic/claude-3.5-sonnet');
    });

    it('breaks ties deterministically using stable canonical ID sorting', () => {
      const catalog = getStaticCatalog();
      // Run ranking 10 times to verify deterministic stability
      const firstResult = rankEligibleCandidates(catalog);
      for (let i = 0; i < 9; i++) {
        const nextResult = rankEligibleCandidates(catalog);
        expect(nextResult.map((m) => m.id)).toEqual(firstResult.map((m) => m.id));
      }
    });
  });

  describe('4. ModelRouterService Routing Execution', () => {
    it('executes AUTO_PICK successfully and explains winning candidate', async () => {
      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });

      const request: ModelRoutingRequest = {
        userId: 'user-test-1',
        operationType: 'research_synthesis',
        routingMode: 'AUTO_PICK',
        preferredProviders: ['openai', 'openrouter'],
      };

      const decision = await router.route(request);
      expect(decision.status).toBe('SUCCESS');
      expect(decision.routingMode).toBe('AUTO_PICK');
      expect(decision.selectedModel).toBeDefined();
      expect(decision.selectedModel?.providerId).toBe('openai');
      // User has gpt-4o set as selected_model_id in mockProviderConfigRepo!
      expect(decision.selectedModel?.nativeModelId).toBe('gpt-4o');
      expect(decision.selectionReasons).toContain('USER_CONFIGURED_MODEL_PREFERENCE');
      expect(decision.explanation).toContain('Auto-Pick selected "openai:gpt-4o"');
      expect(decision.eligibleCandidatesCount).toBeGreaterThan(0);
      expect(decision.alternativeCandidates?.length).toBeGreaterThan(0);
    });

    it('preserves valid explicit model selection without overriding', async () => {
      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });

      const request: ModelRoutingRequest = {
        userId: 'user-test-1',
        operationType: 'claim_extraction',
        routingMode: 'EXPLICIT',
        explicitSelection: {
          providerId: 'openrouter',
          modelId: 'anthropic/claude-3.5-sonnet',
        },
      };

      const decision = await router.route(request);
      expect(decision.status).toBe('SUCCESS');
      expect(decision.routingMode).toBe('EXPLICIT');
      expect(decision.selectedModel?.catalogId).toBe(
        'openrouter:anthropic/claude-3.5-sonnet'
      );
      expect(decision.selectionReasons).toContain('EXPLICIT_SELECTION_PRESERVED');
    });

    it('rejects incompatible explicit model selection when fallback is disabled', async () => {
      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });

      // Provider 'nim' is disabled in user configuration
      const request: ModelRoutingRequest = {
        userId: 'user-test-1',
        operationType: 'research_synthesis',
        routingMode: 'EXPLICIT',
        explicitSelection: {
          providerId: 'nim',
          modelId: 'meta/llama-3.1-70b-instruct',
        },
        allowFallback: false,
      };

      const decision = await router.route(request);
      expect(decision.status).toBe('EXPLICIT_INCOMPATIBLE');
      expect(decision.routingMode).toBe('EXPLICIT');
      expect(decision.selectedModel).toBeNull();
      expect(decision.rejectedCandidates[0]?.reasonCode).toBe('PROVIDER_DISABLED');
      expect(decision.explanation).toContain('fallback is disabled');
    });

    it('falls back to Auto-Pick when explicit model is incompatible and fallback is authorized', async () => {
      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });

      // Explicitly request disabled provider 'nim', but authorize fallback
      const request: ModelRoutingRequest = {
        userId: 'user-test-1',
        operationType: 'research_synthesis',
        routingMode: 'EXPLICIT',
        explicitSelection: {
          providerId: 'nim',
          modelId: 'meta/llama-3.1-70b-instruct',
        },
        allowFallback: true,
      };

      const decision = await router.route(request);
      expect(decision.status).toBe('SUCCESS');
      expect(decision.routingMode).toBe('FALLBACK');
      expect(decision.selectedModel).toBeDefined();
      expect(decision.selectedModel?.providerId).not.toBe('nim'); // Selected an enabled provider instead!
      expect(decision.explanation).toContain('fallback');
      expect(decision.rejectedCandidates.some((r) => r.modelId === 'meta/llama-3.1-70b-instruct')).toBe(true);
    });

    it('returns NO_ELIGIBLE_MODEL when requirements cannot be met by any configured model', async () => {
      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });

      // Impossible requirement: 5M context tokens
      const request: ModelRoutingRequest = {
        userId: 'user-test-1',
        operationType: 'impossible_op',
        customRequirements: {
          minimumContextTokens: 5_000_000,
        },
        routingMode: 'AUTO_PICK',
      };

      const decision = await router.route(request);
      expect(decision.status).toBe('NO_ELIGIBLE_MODEL');
      expect(decision.selectedModel).toBeNull();
      expect(decision.eligibleCandidatesCount).toBe(0);
      expect(decision.rejectedCandidates.length).toBeGreaterThan(0);
      expect(decision.explanation).toContain('No configured model');
    });

    it('never exposes credentials or private keys in routing decision outputs', async () => {
      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });

      const decision = await router.route({
        userId: 'user-test-1',
        operationType: 'research_synthesis',
      });

      const serialized = JSON.stringify(decision);
      expect(serialized).not.toContain('sk-...1234');
      expect(serialized).not.toContain('nvapi-');
      expect(serialized).not.toContain('apiKey');
      expect(serialized).not.toContain('secret');
    });
  });

  describe('5. Consumer Integration with Synthesis & Claim Extraction', () => {
    it('AiResearchSynthesizer routes via Auto-Pick when useAutoPick is enabled', async () => {
      const mockAdapter: AiProviderAdapter = {
        id: 'openai',
        getMetadata: vi.fn(),
        getCapabilities: vi.fn(),
        testConnection: vi.fn(),
        listModels: vi.fn(),
        generateText: vi.fn().mockResolvedValue(
          createSuccessResult({
            text: JSON.stringify({
              directAnswer: 'Synthesized answer with verified citations.',
              keyFindings: [
                {
                  id: 'f-1',
                  title: 'Price Verification',
                  statement: 'Sony WH-1000XM5 retails for $398.00 at major retailers.',
                  findingType: 'FACTUAL',
                  citationIds: ['cite_1'],
                },
              ],
              supportingCitations: [
                {
                  id: 'cite_1',
                  claimId: 'claim_price_1',
                  sourceDocumentId: 'doc_1',
                  sourceTitle: 'Widget Spec',
                  sourceUrl: 'https://example.com/spec',
                  verbatimQuote: 'The Sony WH-1000XM5 retails for $398.00 at major retailers.',
                  charOffsets: { start: 0, end: 59 },
                },
              ],
              conflicts: [],
              uncertaintiesAndLimitations: [],
              candidateComparisons: [],
            }),
            finishReason: 'stop',
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          }, 45)
        ),
      };

      const mockCredentialService = {
        getDecryptedCredential: vi.fn().mockResolvedValue('sk-openai-key'),
      } as unknown as ProviderCredentialService;

      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });

      // Vi spy on router.route to verify integration
      const routeSpy = vi.spyOn(router, 'route');

      // Mock getDefaultProviderRegistry adapter
      const { getDefaultProviderRegistry } = await import('@/server/providers/registry');
      vi.spyOn(getDefaultProviderRegistry(), 'getAdapter').mockReturnValue(mockAdapter);

      const synthesizer = new AiResearchSynthesizer(mockCredentialService, router);

      const result = await synthesizer.synthesize({
        runId: 'run-test-1',
        userId: 'user-test-1',
        query: 'What is the price of Sony WH-1000XM5?',
        claims: [
          {
            id: 'claim_price_1',
            runId: 'run-test-1',
            sourceDocumentId: 'doc_1',
            userId: 'user-test-1',
            subject: 'Sony WH-1000XM5',
            claimKey: 'price',
            extractedRawValue: '$398.00',
            claimType: 'PRICE',
            polarity: 'POSITIVE',
            qualifiers: [],
            evidence: {
              verbatimQuote: 'The Sony WH-1000XM5 retails for $398.00 at major retailers.',
              charOffsetStart: 0,
              charOffsetEnd: 59,
              groundingStatus: 'GROUNDED_EXACT',
              confidenceScore: 1.0,
            },
            extractionStatus: 'EXPLICIT',
            extractionMethod: 'LLM_STRUCTURED',
            verificationState: VerificationState.SUPPORTED,
            extractedAt: '2026-02-01T00:00:00Z',
          },
        ],
        sources: [
          {
            id: 'doc_1',
            url: 'https://example.com/spec',
            title: 'Widget Spec',
          },
        ],
        useAutoPick: true,
      });

      expect(routeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-test-1',
          operationType: 'research_synthesis',
          routingMode: 'AUTO_PICK',
        })
      );
      expect(result.status).toBe('SUCCESS');
      expect(result.metadata.modelUsed).toBe('gpt-4o');
    });

    it('AiClaimExtractor routes via Auto-Pick when useAutoPick is enabled', async () => {
      const mockAdapter: AiProviderAdapter = {
        id: 'openai',
        getMetadata: vi.fn(),
        getCapabilities: vi.fn(),
        testConnection: vi.fn(),
        listModels: vi.fn(),
        generateText: vi.fn().mockResolvedValue(
          createSuccessResult({
            text: JSON.stringify({
              claims: [
                {
                  subject: 'Widget A',
                  claim_key: 'battery_capacity',
                  raw_value: '5000 mAh',
                  claim_type: 'SPECIFICATION',
                  polarity: 'POSITIVE',
                  verbatim_quote: 'The battery capacity is 5000 mAh.',
                },
              ],
            }),
            finishReason: 'stop',
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          }, 35)
        ),
      };

      const mockCredentialService = {
        getDecryptedCredential: vi.fn().mockResolvedValue('sk-openai-key'),
      } as unknown as ProviderCredentialService;

      const router = new ModelRouterService({
        catalogService: mockCatalogService,
        providerConfigRepo: mockProviderConfigRepo,
      });
      const routeSpy = vi.spyOn(router, 'route');

      // Temporarily mock provider registry adapter
      const { getDefaultProviderRegistry } = await import('@/server/providers/registry');
      vi.spyOn(getDefaultProviderRegistry(), 'getAdapter').mockReturnValue(mockAdapter);

      const extractor = new AiClaimExtractor(mockCredentialService, router);

      const extractionResult = await extractor.extractClaims({
        runId: 'run-test-1',
        sourceDocumentId: 'doc-1',
        userId: 'user-test-1',
        document: {
          id: 'doc-1',
          provider: 'direct_safe_fetch',
          requestedUrl: 'https://example.com/battery',
          finalUrl: 'https://example.com/battery',
          domain: 'example.com',
          title: 'Battery Spec',
          markdownContent: '# Spec\nThe battery capacity is 5000 mAh.',
          textExcerpt: 'The battery capacity is 5000 mAh.',
          contentHash: 'hash123',
          author: null,
          publisher: null,
          publishedDate: null,
          language: 'en',
          contentType: 'text/html',
          httpStatusCode: 200,
          accessState: SourceAccessState.ACCESSIBLE,
          extractionState: ExtractionState.SUCCESS,
          warnings: [],
          retrievedAt: '2026-02-01T00:00:00Z',
          usage: { bytesReceived: 1024, latencyMs: 50 },
        },
        useAutoPick: true,
      });

      expect(routeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-test-1',
          operationType: 'claim_extraction',
          routingMode: 'AUTO_PICK',
        })
      );
      expect(extractionResult.acceptedClaims.length).toBe(1);
      expect(extractionResult.acceptedClaims[0]?.extractedRawValue).toBe('5000 mAh');
      expect(extractionResult.acceptedClaims[0]?.evidence.verbatimQuote).toContain('5000 mAh');
    });
  });
});
