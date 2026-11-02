import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiProviderAdapter } from '@/server/providers/adapters/openai/openai.adapter';
import {
  mapNormalizedRequestToOpenAiResponses,
  mapOpenAiResponsesToNormalized,
  mapOpenAiHttpError,
  sanitizeErrorMessage,
} from '@/server/providers/adapters/openai/openai-mapper';
import type {
  OpenAiResponsesResponsePayload,
} from '@/server/providers/adapters/openai/openai.types';
import type { NormalizedInferenceRequest } from '@/server/providers/contracts/inference';
import type { ProviderOperationContext } from '@/server/providers/contracts/adapter';
import type { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { getDefaultProviderRegistry } from '@/server/providers/registry';

describe('Step 28: OpenAI Provider Adapter', () => {
  const mockContext: ProviderOperationContext = {
    userId: '11111111-1111-4111-a111-111111111111',
    correlationId: 'corr-openai-test-123',
  };

  const validRequest: NormalizedInferenceRequest = {
    modelRef: { providerId: 'openai', modelId: 'gpt-4o' },
    messages: [
      { role: 'system', content: 'You are an evidence research assistant.' },
      { role: 'user', content: 'Analyze the safety record of product X.' },
    ],
    temperature: 0.5,
    maxTokens: 800,
    responseFormat: { type: 'json_object' },
    stopSequences: ['[END]'],
  };

  describe('1. Request Mapping Unit Tests', () => {
    it('maps model, messages, temperature, max_output_tokens, and response format', () => {
      const payload = mapNormalizedRequestToOpenAiResponses(validRequest);

      expect(payload.model).toBe('gpt-4o');
      expect(payload.input).toEqual([
        { role: 'system', content: 'You are an evidence research assistant.' },
        { role: 'user', content: 'Analyze the safety record of product X.' },
      ]);
      expect(payload.temperature).toBe(0.5);
      expect(payload.max_output_tokens).toBe(800);
      expect(payload.response_format).toEqual({ type: 'json_object' });
      expect(payload.stop).toEqual(['[END]']);
    });

    it('preserves message ordering and text fidelity', () => {
      const multiMessageRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'openai', modelId: 'gpt-4o-mini' },
        messages: [
          { role: 'system', content: 'Prompt 1' },
          { role: 'user', content: 'Prompt 2' },
          { role: 'assistant', content: 'Prompt 3' },
          { role: 'user', content: 'Prompt 4' },
        ],
      };
      const payload = mapNormalizedRequestToOpenAiResponses(multiMessageRequest);
      expect(payload.input.map((m) => m.content)).toEqual(['Prompt 1', 'Prompt 2', 'Prompt 3', 'Prompt 4']);
    });

    it('rejects unsupported tool role in standard text synthesis', () => {
      const toolRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'openai', modelId: 'gpt-4o' },
        messages: [
          { role: 'tool', content: '{"result":"foo"}' },
        ],
      };
      expect(() => mapNormalizedRequestToOpenAiResponses(toolRequest)).toThrow(/Tool messages are not supported/);
    });
  });

  describe('2. Response Mapping Unit Tests', () => {
    it('extracts completed text and normalizes usage from Responses API payload', () => {
      const rawResponse: OpenAiResponsesResponsePayload = {
        id: 'resp_abc123',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'output_text', text: 'Section 1: Verified evidence. ' },
              { type: 'output_text', text: 'Section 2: Citations listed.' },
            ],
          },
        ],
        usage: {
          input_tokens: 45,
          output_tokens: 88,
          total_tokens: 133,
        },
      };

      const normalized = mapOpenAiResponsesToNormalized(
        rawResponse,
        { providerId: 'openai', modelId: 'gpt-4o' },
        250
      );

      expect(normalized.text).toBe('Section 1: Verified evidence. Section 2: Citations listed.');
      expect(normalized.finishReason).toBe('stop');
      expect(normalized.latencyMs).toBe(250);
      expect(normalized.usage).toEqual({
        promptTokens: 45,
        completionTokens: 88,
        totalTokens: 133,
      });
      expect(normalized.modelRef).toEqual({ providerId: 'openai', modelId: 'gpt-4o' });
    });

    it('handles incomplete status caused by max_output_tokens limit', () => {
      const rawResponse: OpenAiResponsesResponsePayload = {
        id: 'resp_truncated',
        object: 'response',
        status: 'incomplete',
        incomplete_details: {
          reason: 'max_output_tokens',
        },
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Partial generation...' }],
          },
        ],
      };

      const normalized = mapOpenAiResponsesToNormalized(
        rawResponse,
        { providerId: 'openai', modelId: 'gpt-4o' },
        150
      );

      expect(normalized.finishReason).toBe('length');
      expect(normalized.text).toBe('Partial generation...');
      expect(normalized.rawFinishReason).toBe('incomplete:max_output_tokens');
    });

    it('handles refusal content as content_filter finishReason', () => {
      const rawResponse: OpenAiResponsesResponsePayload = {
        id: 'resp_refused',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'refusal',
                refusal: 'I cannot fulfill this request due to safety policies.',
              },
            ],
          },
        ],
      };

      const normalized = mapOpenAiResponsesToNormalized(
        rawResponse,
        { providerId: 'openai', modelId: 'gpt-4o' },
        120
      );

      expect(normalized.finishReason).toBe('content_filter');
      expect(normalized.text).toBe('I cannot fulfill this request due to safety policies.');
      expect(normalized.rawFinishReason).toBe('refusal');
    });

    it('throws when response status is "failed"', () => {
      const rawResponse: OpenAiResponsesResponsePayload = {
        id: 'resp_failed',
        object: 'response',
        status: 'failed',
        error: {
          code: 'server_error',
          message: 'Internal generation worker crashed',
        },
      };

      expect(() =>
        mapOpenAiResponsesToNormalized(rawResponse, { providerId: 'openai', modelId: 'gpt-4o' }, 100)
      ).toThrow(/OpenAI response status is "failed" \(server_error\)/);
    });

    it('safely handles missing usage metadata without fabricating values', () => {
      const rawResponse: OpenAiResponsesResponsePayload = {
        id: 'resp_no_usage',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Evidence output without token stats.' }],
          },
        ],
      };

      const normalized = mapOpenAiResponsesToNormalized(
        rawResponse,
        { providerId: 'openai', modelId: 'gpt-4o' },
        80
      );

      expect(normalized.usage).toBeUndefined();
      expect(normalized.text).toBe('Evidence output without token stats.');
    });
  });

  describe('3. Error Normalization Unit Tests', () => {
    it('normalizes 401 and invalid_api_key to non-retryable AUTH_FAILED', () => {
      const err = mapOpenAiHttpError(401, {
        error: { message: 'Incorrect API key provided: sk-proj-1234567890123456', code: 'invalid_api_key' },
      });
      expect(err.code).toBe('AUTH_FAILED');
      expect(err.isRetryable).toBe(false);
      expect(err.httpStatus).toBe(401);
      // Canary sanitization
      expect(err.message).not.toContain('sk-proj-1234567890123456');
      expect(err.message).toContain('[REDACTED_API_KEY]');
    });

    it('normalizes 403 to non-retryable PERMISSION_DENIED', () => {
      const err = mapOpenAiHttpError(403, {
        error: { message: 'Country or region unsupported' },
      });
      expect(err.code).toBe('PERMISSION_DENIED');
      expect(err.isRetryable).toBe(false);
    });

    it('normalizes 404 and model_not_found to non-retryable MODEL_UNAVAILABLE', () => {
      const err = mapOpenAiHttpError(404, {
        error: { message: 'The model gpt-unknown does not exist', code: 'model_not_found' },
      });
      expect(err.code).toBe('MODEL_UNAVAILABLE');
      expect(err.isRetryable).toBe(false);
    });

    it('normalizes 429 rate limit and insufficient quota to retryable RATE_LIMITED', () => {
      const err1 = mapOpenAiHttpError(429, {
        error: { message: 'Rate limit exceeded for requests per minute', code: 'rate_limit_exceeded' },
      });
      expect(err1.code).toBe('RATE_LIMITED');
      expect(err1.isRetryable).toBe(true);

      const err2 = mapOpenAiHttpError(429, {
        error: { message: 'You exceeded your current quota', code: 'insufficient_quota' },
      });
      expect(err2.code).toBe('RATE_LIMITED');
      expect(err2.isRetryable).toBe(true);
    });

    it('normalizes 500/502/503 server errors to retryable PROVIDER_UNAVAILABLE', () => {
      const err = mapOpenAiHttpError(503, {
        error: { message: 'The server had an error while processing your request' },
      });
      expect(err.code).toBe('PROVIDER_UNAVAILABLE');
      expect(err.isRetryable).toBe(true);
    });

    it('normalizes 400 invalid request to non-retryable INVALID_REQUEST', () => {
      const err = mapOpenAiHttpError(400, {
        error: { message: 'max_output_tokens is too large for this model', code: 'context_length_exceeded' },
      });
      expect(err.code).toBe('INVALID_REQUEST');
      expect(err.isRetryable).toBe(false);
    });
  });

  describe('4. Mocked Integration Tests & Transport Safety', () => {
    let mockCredentialService: ProviderCredentialService;
    let mockFetch: ReturnType<typeof vi.fn>;
    let adapter: OpenAiProviderAdapter;

    beforeEach(() => {
      mockFetch = vi.fn();
      mockCredentialService = {
        getDecryptedCredential: vi.fn(),
      } as unknown as ProviderCredentialService;

      adapter = new OpenAiProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
        baseUrl: 'https://api.openai.com/v1',
      });
    });

    it('dispatches valid POST /responses request with decrypted key and manual redirect', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(
        'sk-proj-synthetic-valid-credential-key-99999'
      );

      const mockResponsesPayload: OpenAiResponsesResponsePayload = {
        id: 'resp_test_001',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Autonomous research synthesis complete.' }],
          },
        ],
        usage: {
          input_tokens: 30,
          output_tokens: 50,
          total_tokens: 80,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponsesPayload,
      });

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.text).toBe('Autonomous research synthesis complete.');
        expect(result.data.finishReason).toBe('stop');
        expect(result.data.usage?.totalTokens).toBe(80);
      }

      // Assert transport parameters
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
      const [url, init] = call!;
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer sk-proj-synthetic-valid-credential-key-99999');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.redirect).toBe('manual');
    });

    it('returns MISSING_CREDENTIAL when user has no stored OpenAI key', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(null);

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_CREDENTIAL');
        expect(result.error.providerId).toBe('openai');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles caller cancellation via AbortSignal', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(
        'sk-proj-synthetic-key-123456789'
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

    it('lists models from GET /v1/models endpoint without paid inference', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValueOnce(
        'sk-proj-synthetic-key-123456789'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o1' }],
        }),
      });

      const result = await adapter.listModels(mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data.map((m) => m.reference.modelId)).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1']);
      }

      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
      const [url, init] = call!;
      expect(url).toBe('https://api.openai.com/v1/models');
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('manual');
    });
  });

  describe('5. Credential Isolation Tests (Multi-Tenant Safety)', () => {
    let mockCredentialService: ProviderCredentialService;
    let mockFetch: ReturnType<typeof vi.fn>;
    let adapter: OpenAiProviderAdapter;

    const userA = 'user-a-1111-uuid';
    const userB = 'user-b-2222-uuid';

    beforeEach(() => {
      mockFetch = vi.fn();
      mockCredentialService = {
        getDecryptedCredential: vi.fn().mockImplementation(async (userId: string) => {
          if (userId === userA) {
            return 'sk-proj-user-a-secret-key-11111111';
          }
          return null; // userB has no key configured
        }),
      } as unknown as ProviderCredentialService;

      adapter = new OpenAiProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
    });

    it('uses only User A credential for User A operations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'resp_a',
          object: 'response',
          status: 'completed',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'User A text' }] }],
        }),
      });

      const result = await adapter.generateText(validRequest, {
        userId: userA,
        correlationId: 'corr-user-a',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![1].headers['Authorization']).toBe(
        'Bearer sk-proj-user-a-secret-key-11111111'
      );
    });

    it('fails closed for User B without falling back to User A key or global key', async () => {
      const result = await adapter.generateText(validRequest, {
        userId: userB,
        correlationId: 'corr-user-b',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_CREDENTIAL');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('6. Secret Leakage & Canary Sanitization Tests', () => {
    const canaryKey = 'sk-proj-canary-secret-never-expose-99999999';

    it('sanitizes canary keys from error messages returned by upstream provider', () => {
      const leakedProviderMessage = `Incorrect API key provided: ${canaryKey}. Revoked or expired.`;
      const sanitized = sanitizeErrorMessage(leakedProviderMessage);

      expect(sanitized).not.toContain(canaryKey);
      expect(sanitized).toBe('Incorrect API key provided: [REDACTED_API_KEY]. Revoked or expired.');
    });

    it('sanitizes canary keys from Bearer auth tokens in raw logs/errors', () => {
      const leakedAuthHeader = `Upstream error with Bearer ${canaryKey} on destination endpoint`;
      const sanitized = sanitizeErrorMessage(leakedAuthHeader);

      expect(sanitized).not.toContain(canaryKey);
      expect(sanitized).toContain('Bearer [REDACTED]');
    });
  });

  describe('7. Central Registry Integration', () => {
    it('registers OpenAiProviderAdapter in the default registry', () => {
      const registry = getDefaultProviderRegistry();
      expect(registry.hasAdapter('openai')).toBe(true);

      const metadata = registry.getProviderMetadata('openai');
      expect(metadata.integrationStatus).toBe('ADAPTER_IMPLEMENTED');
    });
  });
});
