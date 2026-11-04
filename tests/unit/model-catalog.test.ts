import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type ModelCatalogEntry,
  type ModelCatalogQuery,
  createModelCatalogId,
  parseModelCatalogId,
  matchesModelQuery,
  ModelCatalogEntrySchema,
  ModelCatalogQuerySchema,
  getStaticCatalog,
  getStaticModel,
  STATIC_BUNDLED_CATALOG,
  parseOpenAiDiscoveryModels,
  parseOpenRouterDiscoveryModels,
  parseNimDiscoveryModels,
  ModelCatalogService,
} from '@/server/models';
import type { AiProviderRegistry } from '@/server/providers/registry';
import type { AiProviderAdapter } from '@/server/providers/contracts/adapter';
import { createSuccessResult, createErrorResult, createProviderError } from '@/server/providers/contracts/operation-result';
import type { ModelDefinition } from '@/server/providers/contracts/model';

describe('Step 41: Model Catalog, Capabilities, and Supported Operations', () => {
  describe('1. Model Catalog Contracts & Identification', () => {
    it('generates canonical catalog IDs formatted as "providerId:nativeModelId"', () => {
      expect(createModelCatalogId('openai', 'gpt-4o')).toBe('openai:gpt-4o');
      expect(createModelCatalogId('openrouter', 'anthropic/claude-3.5-sonnet')).toBe(
        'openrouter:anthropic/claude-3.5-sonnet'
      );
      expect(createModelCatalogId('nim', 'meta/llama-3.1-70b-instruct')).toBe(
        'nim:meta/llama-3.1-70b-instruct'
      );
    });

    it('rejects invalid or empty IDs when creating catalog ID', () => {
      // @ts-expect-error testing invalid provider ID
      expect(() => createModelCatalogId('invalid-provider', 'gpt-4o')).toThrow(/Invalid provider ID/);
      expect(() => createModelCatalogId('openai', '   ')).toThrow(/cannot be empty/);
    });

    it('parses valid catalog IDs back into provider and native model ID', () => {
      const parsed = parseModelCatalogId('openrouter:google/gemini-2.0-flash-001');
      expect(parsed).toEqual({
        providerId: 'openrouter',
        nativeModelId: 'google/gemini-2.0-flash-001',
      });
    });

    it('rejects malformed catalog IDs during parse', () => {
      expect(() => parseModelCatalogId('no-colon-id')).toThrow(/Invalid serialized model catalog ID/);
      expect(() => parseModelCatalogId('unknown-provider:model-123')).toThrow(/Unknown provider ID/);
      expect(() => parseModelCatalogId(':model-only')).toThrow(/Invalid serialized model catalog ID/);
      expect(() => parseModelCatalogId('openai:')).toThrow(/Invalid serialized model catalog ID/);
    });

    it('validates a complete model catalog entry with Zod schema', () => {
      const entry: ModelCatalogEntry = {
        id: 'openai:gpt-4o',
        providerId: 'openai',
        nativeModelId: 'gpt-4o',
        displayName: 'GPT-4o',
        family: 'gpt-4',
        description: 'Multimodal flagship',
        contextWindowTokens: 128000,
        maxOutputTokens: 16384,
        pricing: { promptCostPer1MUsd: 2.5, completionCostPer1MUsd: 10.0 },
        capabilities: {
          textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
          structuredOutput: {
            status: 'SUPPORTED',
            level: 'SCHEMA_CONSTRAINED',
            provenance: 'STATIC_BUNDLED',
          },
          streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
          toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
          imageInput: { supported: true, provenance: 'STATIC_BUNDLED' },
        },
        availabilityState: 'AVAILABLE',
        provenance: 'STATIC_BUNDLED',
        isRecommended: true,
        lastRefreshedAt: '2026-01-01T00:00:00.000Z',
      };

      const parsed = ModelCatalogEntrySchema.safeParse(entry);
      expect(parsed.success).toBe(true);
    });

    it('validates query schemas with optional filters', () => {
      const query: ModelCatalogQuery = {
        providerId: 'openrouter',
        requiredCapabilities: ['structured_output', 'image_input'],
        structuredOutputLevels: ['SCHEMA_CONSTRAINED', 'JSON_OBJECT'],
        minContextWindow: 64000,
        searchTerm: 'claude',
      };

      const parsed = ModelCatalogQuerySchema.safeParse(query);
      expect(parsed.success).toBe(true);
    });
  });

  describe('2. Query Matching & Capability Evaluation', () => {
    const sampleEntry: ModelCatalogEntry = {
      id: 'openai:gpt-4o',
      providerId: 'openai',
      nativeModelId: 'gpt-4o',
      displayName: 'GPT-4o',
      family: 'gpt-4',
      description: 'Multimodal flagship with JSON schema support',
      contextWindowTokens: 128000,
      maxOutputTokens: 16384,
      capabilities: {
        textGeneration: { supported: true, provenance: 'STATIC_BUNDLED' },
        structuredOutput: {
          status: 'SUPPORTED',
          level: 'SCHEMA_CONSTRAINED',
          provenance: 'STATIC_BUNDLED',
        },
        streaming: { supported: true, provenance: 'STATIC_BUNDLED' },
        toolCalling: { supported: true, provenance: 'STATIC_BUNDLED' },
        imageInput: { supported: true, provenance: 'STATIC_BUNDLED' },
      },
      availabilityState: 'AVAILABLE',
      provenance: 'STATIC_BUNDLED',
      isRecommended: true,
      lastRefreshedAt: '2026-01-01T00:00:00.000Z',
    };

    it('matches when no query filters are specified', () => {
      expect(matchesModelQuery(sampleEntry)).toBe(true);
      expect(matchesModelQuery(sampleEntry, {})).toBe(true);
    });

    it('filters correctly by provider ID', () => {
      expect(matchesModelQuery(sampleEntry, { providerId: 'openai' })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { providerId: 'openrouter' })).toBe(false);
    });

    it('filters correctly by structured output level', () => {
      expect(matchesModelQuery(sampleEntry, { structuredOutputLevels: ['SCHEMA_CONSTRAINED'] })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { structuredOutputLevels: ['JSON_OBJECT'] })).toBe(false);
      expect(
        matchesModelQuery(sampleEntry, { structuredOutputLevels: ['JSON_OBJECT', 'SCHEMA_CONSTRAINED'] })
      ).toBe(true);
    });

    it('filters correctly by context window and vision support', () => {
      expect(matchesModelQuery(sampleEntry, { minContextWindow: 100000 })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { minContextWindow: 200000 })).toBe(false);
      expect(matchesModelQuery(sampleEntry, { supportsImages: true })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { supportsImages: false })).toBe(false);
    });

    it('filters correctly by required capabilities', () => {
      expect(matchesModelQuery(sampleEntry, { requiredCapabilities: ['text_generation', 'tool_calling'] })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { requiredCapabilities: ['structured_output'] })).toBe(true);
    });

    it('matches search terms across name, id, description, and family', () => {
      expect(matchesModelQuery(sampleEntry, { searchTerm: 'gpt-4o' })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { searchTerm: 'multimodal' })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { searchTerm: 'gpt-4' })).toBe(true);
      expect(matchesModelQuery(sampleEntry, { searchTerm: 'claude' })).toBe(false);
    });
  });

  describe('3. Curated Static Bundled Catalog', () => {
    it('contains verified models across all canonical providers', () => {
      const catalog = getStaticCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(8);

      const providers = new Set(catalog.map((m) => m.providerId));
      expect(providers.has('openai')).toBe(true);
      expect(providers.has('openrouter')).toBe(true);
      expect(providers.has('nim')).toBe(true);
    });

    it('distinguishes strict SCHEMA_CONSTRAINED vs JSON_OBJECT vs POST_VALIDATED models', () => {
      const gpt4o = getStaticModel('openai', 'gpt-4o');
      expect(gpt4o).toBeDefined();
      expect(gpt4o?.capabilities.structuredOutput.level).toBe('SCHEMA_CONSTRAINED');

      const llama70b = getStaticModel('openrouter', 'meta-llama/llama-3.1-70b-instruct');
      expect(llama70b).toBeDefined();
      expect(llama70b?.capabilities.structuredOutput.level).toBe('JSON_OBJECT');

      const mixtralNim = getStaticModel('nim', 'mistralai/mixtral-8x7b-instruct-v0.1');
      expect(mixtralNim).toBeDefined();
      expect(mixtralNim?.capabilities.structuredOutput.level).toBe('POST_VALIDATED');
    });

    it('returns null when querying nonexistent model in static catalog', () => {
      expect(getStaticModel('openai', 'non-existent-model')).toBeNull();
    });

    it('ensures no sensitive credentials exist in static catalog entries', () => {
      for (const entry of STATIC_BUNDLED_CATALOG) {
        const serialized = JSON.stringify(entry);
        expect(serialized).not.toContain('apiKey');
        expect(serialized).not.toContain('secret');
        expect(serialized).not.toContain('password');
      }
    });
  });

  describe('4. Discovery Parsers', () => {
    it('parses OpenAI model discovery and filters out non-generation models', () => {
      const mockOpenAiPayload = {
        object: 'list',
        data: [
          { id: 'gpt-4o', object: 'model' },
          { id: 'text-embedding-3-small', object: 'model' },
          { id: 'tts-1', object: 'model' },
          { id: 'whisper-1', object: 'model' },
          { id: 'dall-e-3', object: 'model' },
          { id: 'gpt-4-turbo-2024-04-09', object: 'model' },
        ],
      };

      const parsed = parseOpenAiDiscoveryModels(mockOpenAiPayload, '2026-02-01T12:00:00.000Z');
      expect(parsed).toHaveLength(2);
      expect(parsed.map((p) => p.nativeModelId)).toEqual(['gpt-4o', 'gpt-4-turbo-2024-04-09']);

      // Known model was enriched with static baseline
      const gpt4o = parsed.find((p) => p.nativeModelId === 'gpt-4o');
      expect(gpt4o?.contextWindowTokens).toBe(128000);
      expect(gpt4o?.capabilities.structuredOutput.level).toBe('SCHEMA_CONSTRAINED');
    });

    it('parses OpenRouter rich discovery metadata with pricing and architecture', () => {
      const mockOpenRouterPayload = {
        data: [
          {
            id: 'anthropic/claude-3.5-sonnet',
            name: 'Anthropic: Claude 3.5 Sonnet',
            description: 'Advanced reasoning and vision',
            context_length: 200000,
            pricing: {
              prompt: '0.000003',
              completion: '0.000015',
            },
            architecture: {
              modality: 'text+image->text',
              instruct_type: null,
            },
            supported_parameters: ['tools', 'tool_choice', 'response_format', 'temperature'],
          },
        ],
      };

      const parsed = parseOpenRouterDiscoveryModels(mockOpenRouterPayload, '2026-02-01T12:00:00.000Z');
      expect(parsed).toHaveLength(1);
      const entry = parsed[0]!;
      expect(entry.id).toBe('openrouter:anthropic/claude-3.5-sonnet');
      expect(entry.contextWindowTokens).toBe(200000);
      expect(entry.pricing?.promptCostPer1MUsd).toBe(3.0);
      expect(entry.pricing?.completionCostPer1MUsd).toBe(15.0);
      expect(entry.capabilities.toolCalling.supported).toBe(true);
      expect(entry.capabilities.imageInput.supported).toBe(true);
      expect(entry.capabilities.structuredOutput.status).toBe('SUPPORTED');
    });

    it('parses NVIDIA NIM discovery models and handles unknown models safely', () => {
      const mockNimPayload = {
        data: [
          { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
          { id: 'nvidia/custom-nim-model', name: 'Custom NIM' },
        ],
      };

      const parsed = parseNimDiscoveryModels(mockNimPayload, '2026-02-01T12:00:00.000Z');
      expect(parsed).toHaveLength(2);

      const known = parsed.find((p) => p.nativeModelId === 'meta/llama-3.1-70b-instruct');
      expect(known?.capabilities.structuredOutput.level).toBe('JSON_OBJECT');

      const custom = parsed.find((p) => p.nativeModelId === 'nvidia/custom-nim-model');
      expect(custom?.providerId).toBe('nim');
      expect(custom?.provenance).toBe('PROVIDER_DECLARED');
    });

    it('handles malformed or empty payloads gracefully across all parsers', () => {
      expect(parseOpenAiDiscoveryModels(null)).toEqual([]);
      expect(parseOpenAiDiscoveryModels({})).toEqual([]);
      expect(parseOpenRouterDiscoveryModels('invalid')).toEqual([]);
      expect(parseNimDiscoveryModels(undefined)).toEqual([]);
    });
  });

  describe('5. ModelCatalogService Operations', () => {
    let mockRegistry: AiProviderRegistry;
    let mockOpenAiAdapter: AiProviderAdapter;
    let mockOpenRouterAdapter: AiProviderAdapter;
    let mockNimAdapter: AiProviderAdapter;

    beforeEach(() => {
      mockOpenAiAdapter = {
        id: 'openai',
        getMetadata: vi.fn(),
        getCapabilities: vi.fn(),
        testConnection: vi.fn(),
        generateText: vi.fn(),
        listModels: vi.fn().mockResolvedValue(
          createSuccessResult([
            {
              reference: { providerId: 'openai', modelId: 'gpt-4o' },
              name: 'GPT-4o',
              capabilities: {} as any,
            },
          ] as readonly ModelDefinition[], 50)
        ),
      };

      mockOpenRouterAdapter = {
        id: 'openrouter',
        getMetadata: vi.fn(),
        getCapabilities: vi.fn(),
        testConnection: vi.fn(),
        generateText: vi.fn(),
        listModels: vi.fn().mockResolvedValue(
          createSuccessResult([
            {
              reference: { providerId: 'openrouter', modelId: 'anthropic/claude-3.5-sonnet' },
              name: 'Claude 3.5 Sonnet',
              capabilities: {} as any,
            },
          ] as readonly ModelDefinition[], 60)
        ),
      };

      mockNimAdapter = {
        id: 'nim',
        getMetadata: vi.fn(),
        getCapabilities: vi.fn(),
        testConnection: vi.fn(),
        generateText: vi.fn(),
        listModels: vi.fn().mockResolvedValue(
          createSuccessResult([
            {
              reference: { providerId: 'nim', modelId: 'meta/llama-3.1-70b-instruct' },
              name: 'Llama 3.1 70B',
              capabilities: {} as any,
            },
          ] as readonly ModelDefinition[], 40)
        ),
      };

      mockRegistry = {
        getAdapter: vi.fn((id: string) => {
          if (id === 'openai') return mockOpenAiAdapter;
          if (id === 'openrouter') return mockOpenRouterAdapter;
          if (id === 'nim') return mockNimAdapter;
          return null;
        }),
      } as unknown as AiProviderRegistry;
    });

    it('initializes with the static bundled catalog seeded', async () => {
      const service = new ModelCatalogService({ registry: mockRegistry });
      const models = await service.listModels();
      expect(models.length).toBeGreaterThanOrEqual(STATIC_BUNDLED_CATALOG.length);

      const gpt4o = await service.getModel('openai', 'gpt-4o');
      expect(gpt4o).toBeDefined();
      expect(gpt4o?.nativeModelId).toBe('gpt-4o');
    });

    it('checks capabilities accurately', async () => {
      const service = new ModelCatalogService({ registry: mockRegistry });

      expect(await service.checkCapability('openai', 'gpt-4o', 'text_generation')).toBe(true);
      expect(await service.checkCapability('openai', 'gpt-4o', 'tool_calling')).toBe(true);
      expect(await service.checkCapability('openai', 'gpt-4o', 'image_input')).toBe(true);

      expect(await service.checkCapability('openai', 'o1-mini', 'image_input')).toBe(false);
      expect(await service.checkCapability('openai', 'o1-mini', 'tool_calling')).toBe(false);

      expect(await service.checkCapability('openai', 'non-existent', 'text_generation')).toBe(false);
    });

    it('detects structured output support level correctly', async () => {
      const service = new ModelCatalogService({ registry: mockRegistry });

      const level4o = await service.getStructuredOutputLevel('openai', 'gpt-4o');
      expect(level4o).toBe('SCHEMA_CONSTRAINED');

      const levelLlama = await service.getStructuredOutputLevel('openrouter', 'meta-llama/llama-3.1-70b-instruct');
      expect(levelLlama).toBe('JSON_OBJECT');

      const levelUnknown = await service.getStructuredOutputLevel('openai', 'non-existent');
      expect(levelUnknown).toBe('UNKNOWN');
    });

    it('allows registration of operator-configured models', async () => {
      const service = new ModelCatalogService({ registry: mockRegistry });

      const customEntry: ModelCatalogEntry = {
        id: 'openai:ft-gpt-4o-custom',
        providerId: 'openai',
        nativeModelId: 'ft-gpt-4o-custom',
        displayName: 'Custom Fine-Tuned GPT-4o',
        family: 'gpt-4',
        contextWindowTokens: 128000,
        capabilities: {
          textGeneration: { supported: true, provenance: 'OPERATOR_CONFIGURED' },
          structuredOutput: {
            status: 'SUPPORTED',
            level: 'SCHEMA_CONSTRAINED',
            provenance: 'OPERATOR_CONFIGURED',
          },
          streaming: { supported: true, provenance: 'OPERATOR_CONFIGURED' },
          toolCalling: { supported: true, provenance: 'OPERATOR_CONFIGURED' },
          imageInput: { supported: true, provenance: 'OPERATOR_CONFIGURED' },
        },
        availabilityState: 'AVAILABLE',
        provenance: 'OPERATOR_CONFIGURED',
        isRecommended: false,
        lastRefreshedAt: '2026-01-01T00:00:00.000Z',
      };

      service.registerOperatorModel(customEntry);

      const retrieved = await service.getModel('openai', 'ft-gpt-4o-custom');
      expect(retrieved).toBeDefined();
      expect(retrieved?.displayName).toBe('Custom Fine-Tuned GPT-4o');
      expect(retrieved?.provenance).toBe('OPERATOR_CONFIGURED');
    });

    it('refreshes catalog and merges discovered models without wiping existing catalog', async () => {
      const service = new ModelCatalogService({ registry: mockRegistry });
      const initialCount = (await service.listModels()).length;

      const summary = await service.refreshCatalog();
      expect(summary.refreshedCount).toBe(3);
      expect(summary.providerResults.openai.status).toBe('SUCCESS');
      expect(summary.providerResults.openrouter.status).toBe('SUCCESS');
      expect(summary.providerResults.nim.status).toBe('SUCCESS');

      const modelsAfter = await service.listModels();
      expect(modelsAfter.length).toBeGreaterThanOrEqual(initialCount);
    });

    it('handles provider error during refresh resiliently without deleting entries', async () => {
      // Mock OpenAI returning MISSING_CREDENTIAL error
      mockOpenAiAdapter.listModels = vi.fn().mockResolvedValue(
        createErrorResult(
          createProviderError({
            code: 'MISSING_CREDENTIAL',
            message: 'No credentials configured',
            providerId: 'openai',
          }),
          10
        )
      );

      const service = new ModelCatalogService({ registry: mockRegistry });
      const initialGpt4o = await service.getModel('openai', 'gpt-4o');
      expect(initialGpt4o).toBeDefined();

      const summary = await service.refreshCatalog();
      expect(summary.providerResults.openai.status).toBe('ERROR');
      expect(summary.providerResults.openai.error).toContain('No credentials configured');
      expect(summary.providerResults.openrouter.status).toBe('SUCCESS');

      // The pre-existing OpenAI static catalog entry MUST NOT be deleted!
      const gpt4oAfterError = await service.getModel('openai', 'gpt-4o');
      expect(gpt4oAfterError).toBeDefined();
      expect(gpt4oAfterError?.id).toBe('openai:gpt-4o');
    });

    it('calculates freshness and staleness based on TTL', async () => {
      const service = new ModelCatalogService({
        registry: mockRegistry,
        cacheTtlMs: 1000, // 1 second TTL
      });

      const freshness = service.getFreshness();
      expect(freshness.entryCount).toBeGreaterThanOrEqual(8);
      // Bundled baseline has 2026-01-01 timestamp, so it is stale compared to now
      expect(freshness.isStale).toBe(true);
    });
  });
});
