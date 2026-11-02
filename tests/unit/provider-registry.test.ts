import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AiProviderRegistry,
  createProviderRegistry,
  getDefaultProviderRegistry,
  resetDefaultProviderRegistry,
} from '@/server/providers/registry';
import type {
  AiProviderAdapter,
  ProviderOperationContext,
} from '@/server/providers/contracts/adapter';
import type {
  NormalizedInferenceRequest,
  NormalizedInferenceResponse,
} from '@/server/providers/contracts/inference';
import {
  createSuccessResult,
} from '@/server/providers/contracts/operation-result';
import type { ConnectionTestResult } from '@/server/providers/connection-tester';
import type { ConnectionTestFn } from '@/server/providers/registry';

describe('Step 27: AI Provider Registry', () => {
  let mockConnectionTestFn: ConnectionTestFn;
  let registry: AiProviderRegistry;

  const mockContext: ProviderOperationContext = {
    userId: 'user-123',
    correlationId: 'corr-abc',
  };

  beforeEach(() => {
    resetDefaultProviderRegistry();
    mockConnectionTestFn = vi.fn();

    registry = createProviderRegistry({
      connectionTestFn: mockConnectionTestFn,
    });
  });

  describe('Discovery and Metadata Lookup', () => {
    it('lists all 3 canonical providers by default', () => {
      const providers = registry.getKnownProviders();
      expect(providers).toHaveLength(3);
      const ids = providers.map((p) => p.id);
      expect(ids).toContain('openai');
      expect(ids).toContain('openrouter');
      expect(ids).toContain('nim');
    });

    it('returns baseline metadata for valid provider ID', () => {
      const meta = registry.getProviderMetadata('openai');
      expect(meta.id).toBe('openai');
      expect(meta.name).toBe('OpenAI');
      expect(meta.integrationStatus).toBe('CONTRACT_DEFINED');
    });

    it('throws when requesting metadata for an unknown provider ID', () => {
      // @ts-expect-error testing runtime validation of invalid provider
      expect(() => registry.getProviderMetadata('unknown-provider')).toThrow(TypeError);
    });

    it('returns baseline capabilities when no adapter is registered', () => {
      const caps = registry.getProviderCapabilities('openai');
      expect(caps.textInput.status).toBe('SUPPORTED');
      expect(caps.streaming.status).toBe('SUPPORTED');
    });
  });

  describe('Adapter Registration and Lifecycle', () => {
    function createMockAdapter(providerId: 'openai' | 'openrouter' | 'nim'): AiProviderAdapter {
      return {
        id: providerId,
        getMetadata: vi.fn().mockReturnValue(registry.getProviderMetadata(providerId)),
        getCapabilities: vi.fn().mockReturnValue(registry.getProviderCapabilities(providerId)),
        testConnection: vi.fn().mockResolvedValue(
          createSuccessResult<ConnectionTestResult>(
            {
              success: true,
              code: 'SUCCESS',
              message: 'Mock adapter connected',
              testedAt: new Date().toISOString(),
              durationMs: 42,
            },
            42
          )
        ),
        listModels: vi.fn().mockResolvedValue(createSuccessResult([], 10)),
        generateText: vi.fn().mockResolvedValue(
          createSuccessResult<NormalizedInferenceResponse>(
            {
              text: 'Synthesized evidence report',
              finishReason: 'stop',
              modelRef: { providerId, modelId: 'test-model' },
              latencyMs: 120,
              completedAt: new Date().toISOString(),
            },
            120
          )
        ),
      };
    }

    it('registers an adapter and updates its status to ADAPTER_IMPLEMENTED', () => {
      const adapter = createMockAdapter('openai');
      expect(registry.hasAdapter('openai')).toBe(false);

      registry.registerAdapter(adapter);
      expect(registry.hasAdapter('openai')).toBe(true);
      expect(registry.getAdapter('openai')).toBe(adapter);

      const updatedMeta = registry.getProviderMetadata('openai');
      expect(updatedMeta.integrationStatus).toBe('ADAPTER_IMPLEMENTED');
    });

    it('prohibits duplicate adapter registration', () => {
      const adapter = createMockAdapter('openai');
      registry.registerAdapter(adapter);

      const duplicate = createMockAdapter('openai');
      expect(() => registry.registerAdapter(duplicate)).toThrow(
        /Duplicate adapter registration: an adapter for provider "openai" is already registered/
      );
    });

    it('rejects adapter with unrecognized provider ID', () => {
      const bogusAdapter = {
        id: 'unrecognized' as unknown as 'openai',
        getMetadata: vi.fn(),
        getCapabilities: vi.fn(),
        testConnection: vi.fn(),
        listModels: vi.fn(),
        generateText: vi.fn(),
      };
      expect(() => registry.registerAdapter(bogusAdapter)).toThrow(TypeError);
    });
  });

  describe('Connection Test Integration and Step 26 Compatibility', () => {
    it('delegates to Step 26 connection tester when no adapter is registered', async () => {
      vi.mocked(mockConnectionTestFn).mockResolvedValueOnce({
        success: true,
        code: 'SUCCESS',
        message: 'Step 26 probe passed',
        testedAt: new Date().toISOString(),
        durationMs: 90,
      });

      const result = await registry.testConnection('openai', mockContext);
      expect(mockConnectionTestFn).toHaveBeenCalledWith('user-123', 'openai');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('SUCCESS');
        expect(result.data.message).toBe('Step 26 probe passed');
      }
    });

    it('maps Step 26 connection test failures into normalized ProviderError', async () => {
      vi.mocked(mockConnectionTestFn).mockResolvedValueOnce({
        success: false,
        code: 'AUTH_FAILED',
        message: 'Invalid API key provided',
        testedAt: new Date().toISOString(),
        durationMs: 50,
      });

      const result = await registry.testConnection('openrouter', mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_FAILED');
        expect(result.error.providerId).toBe('openrouter');
        expect(result.error.isRetryable).toBe(false);
      }
    });

    it('delegates to registered adapter when one is available', async () => {
      const adapter = {
        id: 'nim' as const,
        getMetadata: vi.fn(),
        getCapabilities: vi.fn(),
        testConnection: vi.fn().mockResolvedValue(
          createSuccessResult<ConnectionTestResult>(
            {
              success: true,
              code: 'SUCCESS',
              message: 'Adapter probe passed',
              testedAt: new Date().toISOString(),
              durationMs: 35,
            },
            35
          )
        ),
        listModels: vi.fn(),
        generateText: vi.fn(),
      };

      registry.registerAdapter(adapter);
      const result = await registry.testConnection('nim', mockContext);

      expect(adapter.testConnection).toHaveBeenCalledWith(mockContext);
      expect(mockConnectionTestFn).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('Model Listing Contract Boundary', () => {
    it('returns UNSUPPORTED_OPERATION when listing models without an adapter', async () => {
      const result = await registry.listModels('openai', mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNSUPPORTED_OPERATION');
        expect(result.error.providerId).toBe('openai');
      }
    });
  });

  describe('Normalized Inference Dispatch Boundary', () => {
    const validRequest: NormalizedInferenceRequest = {
      modelRef: { providerId: 'openai', modelId: 'gpt-4o' },
      messages: [{ role: 'user', content: 'What is the speed of light?' }],
    };

    it('returns UNSUPPORTED_OPERATION when generating text without an implemented adapter', async () => {
      const result = await registry.generateText(validRequest, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNSUPPORTED_OPERATION');
        expect(result.error.providerId).toBe('openai');
        expect(result.error.message).toContain('Inference adapter for provider "openai" is not yet implemented');
      }
    });

    it('returns INVALID_REQUEST when inference request fails contract validation', async () => {
      const invalidRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'openai', modelId: 'gpt-4o' },
        messages: [],
      };

      const result = await registry.generateText(invalidRequest, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_REQUEST');
      }
    });
  });

  describe('Singleton Access', () => {
    it('getDefaultProviderRegistry returns stable singleton instance', () => {
      const first = getDefaultProviderRegistry();
      const second = getDefaultProviderRegistry();
      expect(first).toBe(second);
    });
  });
});
