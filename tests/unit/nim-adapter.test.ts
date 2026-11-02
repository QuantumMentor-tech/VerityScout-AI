import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NimProviderAdapter } from '@/server/providers/adapters/nim/nim.adapter';
import {
  mapNormalizedRequestToNim,
  mapNimResponseToNormalized,
  mapNimHttpError,
  sanitizeErrorMessage,
} from '@/server/providers/adapters/nim/nim-mapper';
import type {
  NimChatResponsePayload,
} from '@/server/providers/adapters/nim/nim.types';
import type { NormalizedInferenceRequest } from '@/server/providers/contracts/inference';
import type { ProviderOperationContext } from '@/server/providers/contracts/adapter';
import type { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { getDefaultProviderRegistry } from '@/server/providers/registry';

describe('Step 30: NVIDIA NIM Provider Adapter', () => {
  const mockContext: ProviderOperationContext = {
    userId: '22222222-2222-4222-a222-222222222222',
    correlationId: 'corr-nim-test-789',
  };

  const validRequest: NormalizedInferenceRequest = {
    modelRef: { providerId: 'nim', modelId: 'meta/llama-3.1-70b-instruct' },
    messages: [
      { role: 'system', content: 'You are an autonomous evidence verification assistant.' },
      { role: 'user', content: 'Verify claims regarding battery energy density.' },
    ],
    temperature: 0.2,
    maxTokens: 1024,
    responseFormat: { type: 'json_object' },
    stopSequences: ['[CITATIONS_END]'],
  };

  describe('1. Model Identifier & Request Mapping Unit Tests', () => {
    it('preserves publisher-qualified model IDs without stripping prefixes', () => {
      const payload = mapNormalizedRequestToNim(validRequest);
      expect(payload.model).toBe('meta/llama-3.1-70b-instruct');
    });

    it('preserves other publisher prefixes like nvidia or mistralai', () => {
      const nemotronRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'nim', modelId: 'nvidia/nemotron-4-340b-instruct' },
        messages: [{ role: 'user', content: 'Analyze findings.' }],
      };
      const payload = mapNormalizedRequestToNim(nemotronRequest);
      expect(payload.model).toBe('nvidia/nemotron-4-340b-instruct');
    });

    it('maps messages, temperature, max_tokens, and response_format accurately', () => {
      const payload = mapNormalizedRequestToNim(validRequest);

      expect(payload.messages).toEqual([
        { role: 'system', content: 'You are an autonomous evidence verification assistant.' },
        { role: 'user', content: 'Verify claims regarding battery energy density.' },
      ]);
      expect(payload.temperature).toBe(0.2);
      expect(payload.max_tokens).toBe(1024);
      expect(payload.response_format).toEqual({ type: 'json_object' });
      expect(payload.stop).toEqual(['[CITATIONS_END]']);
    });

    it('rejects unsupported tool role in text generation', () => {
      const toolRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'nim', modelId: 'meta/llama-3.1-70b-instruct' },
        messages: [{ role: 'tool', content: '{"status":"ok"}' }],
      };
      expect(() => mapNormalizedRequestToNim(toolRequest)).toThrow(/Tool messages are not supported/);
    });

    it('rejects empty or whitespace model references', () => {
      const emptyModelRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'nim', modelId: '   ' },
        messages: [{ role: 'user', content: 'Test prompt' }],
      };
      expect(() => mapNormalizedRequestToNim(emptyModelRequest)).toThrow(/model reference cannot be empty/);
    });
  });

  describe('2. Response Normalization Unit Tests', () => {
    it('normalizes successful chat completions output, usage, and finish reason', () => {
      const rawResponse: NimChatResponsePayload = {
        id: 'chatcmpl-nim-123456',
        model: 'meta/llama-3.1-70b-instruct',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Verified energy density findings supported by peer-reviewed evidence.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 120,
          total_tokens: 170,
        },
      };

      const normalized = mapNimResponseToNormalized(
        rawResponse,
        { providerId: 'nim', modelId: 'meta/llama-3.1-70b-instruct' },
        450
      );

      expect(normalized.text).toBe('Verified energy density findings supported by peer-reviewed evidence.');
      expect(normalized.finishReason).toBe('stop');
      expect(normalized.rawFinishReason).toBe('stop');
      expect(normalized.usage).toEqual({
        promptTokens: 50,
        completionTokens: 120,
        totalTokens: 170,
      });
      expect(normalized.latencyMs).toBe(450);
      expect(normalized.modelRef).toEqual({ providerId: 'nim', modelId: 'meta/llama-3.1-70b-instruct' });
    });

    it('handles finish_reason variations (length, content_filter, unknown)', () => {
      const lengthResponse: NimChatResponsePayload = {
        id: 'chatcmpl-len-1',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Truncated output...' },
            finish_reason: 'length',
          },
        ],
      };
      const res1 = mapNimResponseToNormalized(lengthResponse, validRequest.modelRef, 200);
      expect(res1.finishReason).toBe('length');

      const filterResponse: NimChatResponsePayload = {
        id: 'chatcmpl-filt-1',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: null, refusal: 'Policy violation' },
            finish_reason: 'content_filter',
          },
        ],
      };
      const res2 = mapNimResponseToNormalized(filterResponse, validRequest.modelRef, 200);
      expect(res2.finishReason).toBe('content_filter');
      expect(res2.text).toBe('Policy violation');

      const unknownResponse: NimChatResponsePayload = {
        id: 'chatcmpl-unk-1',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Custom termination' },
            finish_reason: 'custom_status',
          },
        ],
      };
      const res3 = mapNimResponseToNormalized(unknownResponse, validRequest.modelRef, 200);
      expect(res3.finishReason).toBe('unknown');
    });

    it('handles missing or partial usage metadata without fabricating counts', () => {
      const noUsageResponse: NimChatResponsePayload = {
        id: 'chatcmpl-no-usage',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Valid response with omitted usage' },
            finish_reason: 'stop',
          },
        ],
      };

      const normalized = mapNimResponseToNormalized(noUsageResponse, validRequest.modelRef, 150);
      expect(normalized.text).toBe('Valid response with omitted usage');
      expect(normalized.usage).toBeUndefined();
    });

    it('throws when payload has empty or missing choices', () => {
      const emptyChoices: NimChatResponsePayload = {
        id: 'chatcmpl-bad',
        choices: [],
      };
      expect(() => mapNimResponseToNormalized(emptyChoices, validRequest.modelRef, 100)).toThrow(
        /empty or missing choices array/
      );
    });
  });

  describe('3. Error Normalization Unit Tests', () => {
    it('normalizes HTTP 401 Unauthorized to AUTH_FAILED (non-retryable)', () => {
      const error = mapNimHttpError(
        401,
        { error: { message: 'Invalid API key or token: nvapi-secret-1234567890ab' } },
        'corr-401'
      );
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.httpStatus).toBe(401);
      expect(error.isRetryable).toBe(false);
      expect(error.correlationId).toBe('corr-401');
      expect(error.message).not.toContain('nvapi-secret-1234567890ab');
      expect(error.message).toContain('[REDACTED_API_KEY]');
    });

    it('normalizes HTTP 403 Forbidden to PERMISSION_DENIED (non-retryable)', () => {
      const error = mapNimHttpError(
        403,
        { detail: 'Permission denied: Account does not have access to model' },
        'corr-403'
      );
      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.httpStatus).toBe(403);
      expect(error.isRetryable).toBe(false);
    });

    it('normalizes HTTP 404 to MODEL_UNAVAILABLE (non-retryable)', () => {
      const error = mapNimHttpError(
        404,
        { detail: 'Model meta/llama-3.1-70b-instruct not found' },
        'corr-404'
      );
      expect(error.code).toBe('MODEL_UNAVAILABLE');
      expect(error.httpStatus).toBe(404);
      expect(error.isRetryable).toBe(false);
    });

    it('normalizes HTTP 429 to RATE_LIMITED (retryable)', () => {
      const error = mapNimHttpError(
        429,
        { error: { message: 'Rate limit exceeded for endpoint' } },
        'corr-429'
      );
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.httpStatus).toBe(429);
      expect(error.isRetryable).toBe(true);
    });

    it('normalizes HTTP 500/503 to PROVIDER_UNAVAILABLE (retryable)', () => {
      const error500 = mapNimHttpError(500, { message: 'Internal Server Error' }, 'corr-500');
      expect(error500.code).toBe('PROVIDER_UNAVAILABLE');
      expect(error500.isRetryable).toBe(true);

      const error503 = mapNimHttpError(503, { detail: 'Service temporarily unavailable' }, 'corr-503');
      expect(error503.code).toBe('PROVIDER_UNAVAILABLE');
      expect(error503.isRetryable).toBe(true);
    });

    it('normalizes HTTP 400 Bad Request to INVALID_REQUEST (non-retryable)', () => {
      const error = mapNimHttpError(
        400,
        { error: { message: 'Invalid parameter: temperature must be between 0 and 1' } },
        'corr-400'
      );
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.httpStatus).toBe(400);
      expect(error.isRetryable).toBe(false);
    });

    it('handles detail array error formats from FastAPI/NIM endpoints', () => {
      const error = mapNimHttpError(
        422,
        { detail: [{ loc: ['body', 'temperature'], msg: 'value is not a valid float' }] },
        'corr-422'
      );
      expect(error.message).toContain('value is not a valid float');
    });
  });

  describe('4. Secret Sanitization & Canary Scrubbing Unit Tests', () => {
    it('redacts nvapi- API keys thoroughly', () => {
      const dirty = 'Error communicating with nvapi-abcdef1234567890xyz and token nvapi-9999888877776666';
      const clean = sanitizeErrorMessage(dirty);
      expect(clean).not.toContain('nvapi-abcdef1234567890xyz');
      expect(clean).not.toContain('nvapi-9999888877776666');
      expect(clean).toBe('Error communicating with [REDACTED_API_KEY] and token [REDACTED_API_KEY]');
    });

    it('redacts Bearer authorization headers', () => {
      const dirty = 'Authorization failed for Bearer nvapi-sec-123456789012';
      const clean = sanitizeErrorMessage(dirty);
      expect(clean).not.toContain('nvapi-sec-123456789012');
      expect(clean).toContain('Bearer [REDACTED]');
    });

    it('redacts sk- and sk-or- keys if present in upstream messages', () => {
      const dirty = 'Cross-provider error sk-proj-123456789012 and sk-or-v1-abcdef1234567890';
      const clean = sanitizeErrorMessage(dirty);
      expect(clean).not.toContain('sk-proj-123456789012');
      expect(clean).not.toContain('sk-or-v1-abcdef1234567890');
      expect(clean).toBe('Cross-provider error [REDACTED_API_KEY] and [REDACTED_API_KEY]');
    });
  });

  describe('5. Mocked Integration Tests (generateText, listModels, testConnection)', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let mockCredentialService: ProviderCredentialService;

    beforeEach(() => {
      mockFetch = vi.fn();
      mockCredentialService = {
        getDecryptedCredential: vi.fn(),
      } as unknown as ProviderCredentialService;
    });

    it('executes successful text generation via POST /v1/chat/completions', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValue(
        'nvapi-test-canary-secret-123456'
      );

      const fakeResponsePayload: NimChatResponsePayload = {
        id: 'chatcmpl-test-001',
        model: 'meta/llama-3.1-70b-instruct',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Synthesis complete with 4 citations.' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 45, completion_tokens: 90, total_tokens: 135 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => fakeResponsePayload,
      } as Response);

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.text).toBe('Synthesis complete with 4 citations.');
      expect(result.data.finishReason).toBe('stop');
      expect(result.data.usage?.totalTokens).toBe(135);

      // Verify request payload & headers
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
      const [url, init] = call!;
      expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer nvapi-test-canary-secret-123456',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
      expect(init?.redirect).toBe('manual');

      const body = JSON.parse(init?.body as string);
      expect(body.model).toBe('meta/llama-3.1-70b-instruct');
      expect(body.messages).toHaveLength(2);
      expect(body.temperature).toBe(0.2);
    });

    it('fails closed when credential is missing without making any network call', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValue(null);

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('MISSING_CREDENTIAL');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects mismatched provider ID with INVALID_REQUEST', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValue('nvapi-key');

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const mismatchedRequest: NormalizedInferenceRequest = {
        modelRef: { providerId: 'openai', modelId: 'gpt-4o' },
        messages: [{ role: 'user', content: 'test' }],
      };

      const result = await adapter.generateText(mismatchedRequest, mockContext);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('INVALID_REQUEST');
      expect(result.error.message).toContain('Expected "nim"');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('normalizes HTTP 401 error response from provider', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValue('nvapi-bad-key');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized: Invalid API key' } }),
      } as Response);

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_FAILED');
      expect(result.error.httpStatus).toBe(401);
      expect(result.error.isRetryable).toBe(false);
    });

    it('handles timeout when provider exceeds bounded threshold', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValue('nvapi-timeout-key');

      mockFetch.mockImplementationOnce((_url, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
        timeoutMs: 50,
      });

      const result = await adapter.generateText(validRequest, mockContext);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('TIMEOUT');
    });

    it('handles caller cancellation via external AbortSignal', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValue('nvapi-key');

      const externalController = new AbortController();
      externalController.abort(new Error('User cancelled'));

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await adapter.generateText(validRequest, {
        ...mockContext,
        abortSignal: externalController.signal,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('CANCELLED');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('lists models successfully via GET /v1/models', async () => {
      vi.mocked(mockCredentialService.getDecryptedCredential).mockResolvedValue('nvapi-valid-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
            { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron-4 340B' },
          ],
        }),
      } as Response);

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await adapter.listModels(mockContext);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.reference).toEqual({ providerId: 'nim', modelId: 'meta/llama-3.1-70b-instruct' });
      expect(result.data[1]?.reference).toEqual({ providerId: 'nim', modelId: 'nvidia/nemotron-4-340b-instruct' });
    });
  });

  describe('6. Multi-Tenant Credential Isolation Tests', () => {
    it('isolates credentials strictly by caller userId', async () => {
      const userAId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
      const userBId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

      const mockCredentialService = {
        getDecryptedCredential: vi.fn().mockImplementation((userId: string, providerId: string) => {
          if (providerId !== 'nim') return Promise.resolve(null);
          if (userId === userAId) return Promise.resolve('nvapi-user-a-key');
          if (userId === userBId) return Promise.resolve('nvapi-user-b-key');
          return Promise.resolve(null);
        }),
      } as unknown as ProviderCredentialService;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-res',
          choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        }),
      });

      const adapter = new NimProviderAdapter({
        credentialService: mockCredentialService,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // User A call
      await adapter.generateText(validRequest, { userId: userAId, correlationId: 'corr-user-a' });
      const callA = mockFetch.mock.calls[0];
      expect(callA).toBeDefined();
      const [, initA] = callA!;
      expect(initA?.headers).toMatchObject({ Authorization: 'Bearer nvapi-user-a-key' });

      // User B call
      await adapter.generateText(validRequest, { userId: userBId, correlationId: 'corr-user-b' });
      const callB = mockFetch.mock.calls[1];
      expect(callB).toBeDefined();
      const [, initB] = callB!;
      expect(initB?.headers).toMatchObject({ Authorization: 'Bearer nvapi-user-b-key' });

      // Unknown user without key fails closed without using user A or B key
      const unauthResult = await adapter.generateText(validRequest, { userId: 'unknown-user', correlationId: 'corr-unknown' });
      expect(unauthResult.success).toBe(false);
      if (!unauthResult.success) {
        expect(unauthResult.error.code).toBe('MISSING_CREDENTIAL');
      }
      expect(mockFetch).toHaveBeenCalledTimes(2); // No 3rd fetch dispatched
    });
  });

  describe('7. Central Provider Registry Integration Tests', () => {
    it('verifies that getDefaultProviderRegistry() registers all three adapters: openai, openrouter, and nim', () => {
      const registry = getDefaultProviderRegistry();
      expect(registry.hasAdapter('openai')).toBe(true);
      expect(registry.hasAdapter('openrouter')).toBe(true);
      expect(registry.hasAdapter('nim')).toBe(true);

      const metadata = registry.getProviderMetadata('nim');
      expect(metadata.id).toBe('nim');
      expect(metadata.name).toBe('NVIDIA NIM');
      expect(metadata.integrationStatus).toBe('ADAPTER_IMPLEMENTED');
    });

    it('dispatches generateText to NimProviderAdapter through registry', async () => {
      const registry = getDefaultProviderRegistry();
      const nimAdapter = registry.getAdapter('nim');
      expect(nimAdapter).toBeDefined();

      // Spy on generateText
      const generateSpy = vi.spyOn(nimAdapter!, 'generateText').mockResolvedValueOnce({
        success: true,
        data: {
          text: 'Registry dispatched successfully to NVIDIA NIM',
          finishReason: 'stop',
          modelRef: validRequest.modelRef,
          rawFinishReason: 'stop',
          latencyMs: 120,
          completedAt: new Date().toISOString(),
        },
        latencyMs: 120,
      });

      const result = await registry.generateText(validRequest, mockContext);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.text).toBe('Registry dispatched successfully to NVIDIA NIM');
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });
  });
});
