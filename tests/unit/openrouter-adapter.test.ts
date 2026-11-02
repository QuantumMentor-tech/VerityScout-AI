import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProviderAdapter } from '@/server/providers/adapters/openrouter/openrouter.adapter';
import {
  mapNormalizedRequestToOpenRouter,
  mapOpenRouterResponseToNormalized,
  mapOpenRouterHttpError,
  sanitizeErrorMessage,
} from '@/server/providers/adapters/openrouter/openrouter-mapper';
import type {
  OpenRouterChatResponsePayload,
} from '@/server/providers/adapters/openrouter/openrouter.types';
import type { NormalizedInferenceRequest } from '@/server/providers/contracts/inference';
import type { ProviderOperationContext } from '@/server/providers/contracts/adapter';
import type { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { getDefaultProviderRegistry } from '@/server/providers/registry';

describe('Step 29: OpenRouter Provider Adapter', () => {
  const mockContext: ProviderOperationContext = {
    userId: '11111111-1111-4111-a111-111111111111',
    correlationId: 'corr-openrouter-test-456',
  };

  const validRequest: NormalizedInferenceRequest = {
    modelRef: { providerId: 'openrouter', modelId: 'anthropic/claude-3.5-sonnet' },
    messages: [
      { role: 'system', content: 'You are an autonomous evidence verification assistant.' },
      { role: 'user', content: 'Verify claims regarding battery energy density.' },
    ],
    temperature: 0.3,
    maxTokens: 1200,
    responseFormat: { type: 'json_object' },
    stopSequences: ['[CITATIONS_END]'],
  };

  describe('1. Model Identifier & Request Mapping Unit Tests', () => {
    it('preserves publisher-qualified model IDs without stripping prefixes', () => {
      const payload = mapNormalizedRequestToOpenRouter(validRequest);
      expect(payload.model).toBe('anthropic/claude-3.5-sonnet');
    });

    it('preserves other publisher prefixes like meta-llama or mistralai', () => {
      const llamaRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'openrouter', modelId: 'meta-llama/llama-3.3-70b-instruct' },
        messages: [{ role: 'user', content: 'Summarize findings.' }],
      };
      const payload = mapNormalizedRequestToOpenRouter(llamaRequest);
      expect(payload.model).toBe('meta-llama/llama-3.3-70b-instruct');
    });

    it('maps messages, temperature, max_tokens, and response_format accurately', () => {
      const payload = mapNormalizedRequestToOpenRouter(validRequest);

      expect(payload.messages).toEqual([
        { role: 'system', content: 'You are an autonomous evidence verification assistant.' },
        { role: 'user', content: 'Verify claims regarding battery energy density.' },
      ]);
      expect(payload.temperature).toBe(0.3);
      expect(payload.max_tokens).toBe(1200);
      expect(payload.response_format).toEqual({ type: 'json_object' });
      expect(payload.stop).toEqual(['[CITATIONS_END]']);
    });

    it('rejects unsupported tool role in text generation', () => {
      const toolRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'openrouter', modelId: 'anthropic/claude-3.5-sonnet' },
        messages: [{ role: 'tool', content: '{"status":"ok"}' }],
      };
      expect(() => mapNormalizedRequestToOpenRouter(toolRequest)).toThrow(/Tool messages are not supported/);
    });

    it('rejects empty or whitespace model references', () => {
      const emptyModelRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'openrouter', modelId: '   ' },
        messages: [{ role: 'user', content: 'Test prompt' }],
      };
      expect(() => mapNormalizedRequestToOpenRouter(emptyModelRequest)).toThrow(/model reference cannot be empty/);
    });
  });

  describe('2. Response Normalization Unit Tests', () => {
    it('normalizes successful chat completions output, usage, and finish reason', () => {
      const rawResponse: OpenRouterChatResponsePayload = {
        id: 'gen-or-123456',
        provider: 'Anthropic',
        model: 'anthropic/claude-3.5-sonnet',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Verified energy density findings supported by 3 primary papers.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 65,
          completion_tokens: 140,
          total_tokens: 205,
        },
      };

      const normalized = mapOpenRouterResponseToNormalized(
        rawResponse,
        { providerId: 'openrouter', modelId: 'anthropic/claude-3.5-sonnet' },
        185
      );

      expect(normalized.text).toBe('Verified energy density findings supported by 3 primary papers.');
      expect(normalized.finishReason).toBe('stop');
      expect(normalized.latencyMs).toBe(185);
      expect(normalized.usage).toEqual({
        promptTokens: 65,
        completionTokens: 140,
        totalTokens: 205,
      });
      expect(normalized.rawFinishReason).toBe('stop;upstream:Anthropic');
    });

    it('normalizes refusal content into content_filter finishReason', () => {
      const rawResponse: OpenRouterChatResponsePayload = {
        id: 'gen-or-refused',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              refusal: 'I cannot provide instructions for restricted chemical synthesis.',
            },
            finish_reason: 'content_filter',
          },
        ],
      };

      const normalized = mapOpenRouterResponseToNormalized(
        rawResponse,
        { providerId: 'openrouter', modelId: 'meta-llama/llama-3.3-70b-instruct' },
        110
      );

      expect(normalized.finishReason).toBe('content_filter');
      expect(normalized.text).toBe('I cannot provide instructions for restricted chemical synthesis.');
    });

    it('safely handles missing usage metadata without inventing tokens', () => {
      const rawResponse: OpenRouterChatResponsePayload = {
        id: 'gen-or-no-usage',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Output without usage telemetry.',
            },
            finish_reason: 'stop',
          },
        ],
      };

      const normalized = mapOpenRouterResponseToNormalized(
        rawResponse,
        { providerId: 'openrouter', modelId: 'mistralai/mixtral-8x7b-instruct' },
        75
      );

      expect(normalized.usage).toBeUndefined();
      expect(normalized.text).toBe('Output without usage telemetry.');
    });

    it('throws when choices array is empty or missing', () => {
      const emptyChoices: OpenRouterChatResponsePayload = {
        id: 'gen-or-empty',
        choices: [],
      };

      expect(() =>
        mapOpenRouterResponseToNormalized(
          emptyChoices,
          { providerId: 'openrouter', modelId: 'anthropic/claude-3.5-sonnet' },
          50
        )
      ).toThrow(/empty or missing choices array/);
    });
  });

  describe('3. Error Normalization Unit Tests (Credit vs Rate Limit Distinctions)', () => {
    it('normalizes HTTP 402 / insufficient credits distinctly as non-retryable INSUFFICIENT_CREDITS', () => {
      const err = mapOpenRouterHttpError(402, {
        error: {
          message: 'User has insufficient credits to complete this request',
          code: 402,
          metadata: { error_type: 'insufficient_credits', provider_name: 'OpenRouter' },
        },
      });

      expect(err.code).toBe('INSUFFICIENT_CREDITS');
      expect(err.isRetryable).toBe(false);
      expect(err.httpStatus).toBe(402);
      expect(err.internalDiagnosticCode).toBe('insufficient_credits');
    });

    it('normalizes exhausted key spending limits as non-retryable INSUFFICIENT_CREDITS', () => {
      const err = mapOpenRouterHttpError(402, {
        error: {
          message: 'Key spending limit reached',
          code: 'key_limit_reached',
          metadata: { error_type: 'key_limit_reached' },
        },
      });

      expect(err.code).toBe('INSUFFICIENT_CREDITS');
      expect(err.isRetryable).toBe(false);
    });

    it('normalizes HTTP 429 platform rate limits as retryable RATE_LIMITED', () => {
      const err = mapOpenRouterHttpError(429, {
        error: {
          message: 'Rate limit exceeded: 60 requests per minute',
          code: 429,
        },
      });

      expect(err.code).toBe('RATE_LIMITED');
      expect(err.isRetryable).toBe(true);
      expect(err.internalDiagnosticCode).toBe('platform_rate_limit');
    });

    it('normalizes upstream provider capacity rate limits as retryable RATE_LIMITED with provider diagnostic', () => {
      const err = mapOpenRouterHttpError(429, {
        error: {
          message: 'Provider returned 429: Too Many Requests',
          code: 429,
          metadata: { error_type: 'provider_rate_limit', provider_name: 'Anthropic' },
        },
      });

      expect(err.code).toBe('RATE_LIMITED');
      expect(err.isRetryable).toBe(true);
      expect(err.internalDiagnosticCode).toBe('upstream:Anthropic');
    });

    it('normalizes HTTP 401 invalid key to non-retryable AUTH_FAILED', () => {
      const err = mapOpenRouterHttpError(401, {
        error: { message: 'Invalid API key provided: sk-or-v1-abcdef1234567890', code: 401 },
      });

      expect(err.code).toBe('AUTH_FAILED');
      expect(err.isRetryable).toBe(false);
      expect(err.message).not.toContain('sk-or-v1-abcdef1234567890');
      expect(err.message).toContain('[REDACTED_API_KEY]');
    });

    it('normalizes HTTP 404 model not found to non-retryable MODEL_UNAVAILABLE', () => {
      const err = mapOpenRouterHttpError(404, {
        error: { message: 'Model not found: nonexistent/model-xyz', code: 404 },
      });

      expect(err.code).toBe('MODEL_UNAVAILABLE');
      expect(err.isRetryable).toBe(false);
    });

    it('normalizes HTTP 5xx server/gateway errors to retryable PROVIDER_UNAVAILABLE', () => {
      const err = mapOpenRouterHttpError(502, {
        error: { message: 'Bad Gateway from upstream host', metadata: { provider_name: 'Together' } },
      });

      expect(err.code).toBe('PROVIDER_UNAVAILABLE');
      expect(err.isRetryable).toBe(true);
      expect(err.internalDiagnosticCode).toBe('upstream_failure:Together');
    });
  });

  describe('4. Mocked Integration Tests & Transport Safety', () => {
    let mockCredentialService: ProviderCredentialService;
    let mockFetch: ReturnType<typeof vi.fn>;
    let adapter: OpenRouterProviderAdapter;

    beforeEach(() => {
      mockFetch = vi.fn();
      mockCredentialService = {
        getDecryptedCredential: vi.fn(),
      } as unknown as ProviderCredentialService;

      adapter = new OpenRouterProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
        baseUrl: 'https://openrouter.ai/api/v1',
        siteUrl: 'https://verityscout.local',
        siteTitle: 'VerityScout AI',
      });
    });

    it('dispatches valid POST /chat/completions request with attribution headers and manual redirect', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(
        'sk-or-v1-synthetic-valid-credential-key-11111'
      );

      const mockResponse: OpenRouterChatResponsePayload = {
        id: 'gen-or-test-001',
        provider: 'Anthropic',
        model: 'anthropic/claude-3.5-sonnet',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Autonomous research synthesis from OpenRouter.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 95,
          total_tokens: 135,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.text).toBe('Autonomous research synthesis from OpenRouter.');
        expect(result.data.finishReason).toBe('stop');
        expect(result.data.usage?.totalTokens).toBe(135);
      }

      // Assert transport parameters
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
      const [url, init] = call!;
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer sk-or-v1-synthetic-valid-credential-key-11111');
      expect(init.headers['HTTP-Referer']).toBe('https://verityscout.local');
      expect(init.headers['X-Title']).toBe('VerityScout AI');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.redirect).toBe('manual');
    });

    it('returns MISSING_CREDENTIAL when user has no configured OpenRouter key', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(null);

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_CREDENTIAL');
        expect(result.error.providerId).toBe('openrouter');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles caller cancellation via AbortSignal', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(
        'sk-or-v1-synthetic-key-999'
      );

      const controller = new AbortController();
      controller.abort(); // already aborted

      const result = await adapter.generateText(validRequest, {
        ...mockContext,
        abortSignal: controller.signal,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CANCELLED');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('lists models from GET /models endpoint without triggering inference', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(
        'sk-or-v1-synthetic-key-999'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
          ],
        }),
      });

      const result = await adapter.listModels(mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data.map((m) => m.reference.modelId)).toEqual([
          'anthropic/claude-3.5-sonnet',
          'meta-llama/llama-3.3-70b-instruct',
        ]);
      }

      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
      const [url, init] = call!;
      expect(url).toBe('https://openrouter.ai/api/v1/models');
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('manual');
    });
  });

  describe('5. Credential Isolation Tests (Multi-Tenant Safety)', () => {
    let mockCredentialService: ProviderCredentialService;
    let mockFetch: ReturnType<typeof vi.fn>;
    let adapter: OpenRouterProviderAdapter;

    const userA = 'user-a-openrouter-uuid';
    const userB = 'user-b-openrouter-uuid';

    beforeEach(() => {
      mockFetch = vi.fn();
      mockCredentialService = {
        getDecryptedCredential: vi.fn().mockImplementation(async (userId: string) => {
          if (userId === userA) {
            return 'sk-or-v1-user-a-secret-key-11111111';
          }
          return null; // userB has no key
        }),
      } as unknown as ProviderCredentialService;

      adapter = new OpenRouterProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
    });

    it('uses only User A credential for User A operations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'gen-or-user-a',
          choices: [{ index: 0, message: { role: 'assistant', content: 'User A text' }, finish_reason: 'stop' }],
        }),
      });

      const result = await adapter.generateText(validRequest, {
        userId: userA,
        correlationId: 'corr-openrouter-a',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![1].headers['Authorization']).toBe(
        'Bearer sk-or-v1-user-a-secret-key-11111111'
      );
    });

    it('fails closed for User B without falling back to User A key or global key', async () => {
      const result = await adapter.generateText(validRequest, {
        userId: userB,
        correlationId: 'corr-openrouter-b',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_CREDENTIAL');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('6. Secret Leakage & Canary Sanitization Tests', () => {
    const canaryKey = 'sk-or-v1-canary-secret-never-expose-88888888';

    it('sanitizes OpenRouter canary keys from upstream error messages', () => {
      const leakedMessage = `Authorization failed for key: ${canaryKey}. Revoked by user.`;
      const sanitized = sanitizeErrorMessage(leakedMessage);

      expect(sanitized).not.toContain(canaryKey);
      expect(sanitized).toBe('Authorization failed for key: [REDACTED_API_KEY]. Revoked by user.');
    });

    it('sanitizes Bearer auth tokens in raw strings', () => {
      const rawLog = `Upstream error with Bearer ${canaryKey} while connecting`;
      const sanitized = sanitizeErrorMessage(rawLog);

      expect(sanitized).not.toContain(canaryKey);
      expect(sanitized).toBe('Upstream error with Bearer [REDACTED] while connecting');
    });
  });

  describe('7. Central Registry Integration', () => {
    it('registers OpenRouterProviderAdapter alongside OpenAiProviderAdapter in the default registry', () => {
      const registry = getDefaultProviderRegistry();
      expect(registry.hasAdapter('openrouter')).toBe(true);
      expect(registry.hasAdapter('openai')).toBe(true);

      const metadata = registry.getProviderMetadata('openrouter');
      expect(metadata.integrationStatus).toBe('ADAPTER_IMPLEMENTED');
    });
  });
});
