import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NimProviderAdapter } from '@/server/providers/adapters/nim';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import {
  type NormalizedInferenceRequest,
  createModelReference,
} from '@/server/providers/contracts';
import {
  NIM_MOCK_SUCCESS_RESPONSE,
  NIM_MOCK_FASTAPI_DETAIL_ERROR,
  NIM_MOCK_401_AUTH_ERROR,
} from '../fixtures/mock-responses';

describe('NVIDIA NIM Provider Contract Tests (Step 51 / Step 30)', () => {
  let mockCredentialService: Partial<ProviderCredentialService>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let adapter: NimProviderAdapter;

  const validRequest: NormalizedInferenceRequest = {
    modelRef: createModelReference('nim', 'meta/llama-3.1-70b-instruct'),
    messages: [
      { role: 'system', content: 'You are a factual product extraction model.' },
      { role: 'user', content: 'Extract details for LG C3 OLED.' },
    ],
    temperature: 0.1,
    maxTokens: 256,
  };

  const context = {
    userId: 'user-contract-3',
    correlationId: 'corr-nim-789',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockCredentialService = {
      getDecryptedCredential: vi.fn().mockResolvedValue('nvapi-mock-test-key-123456789'),
    };

    mockFetch = vi.fn();

    adapter = new NimProviderAdapter({
      credentialService: mockCredentialService as ProviderCredentialService,
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 5000,
    });
  });

  describe('Request Construction Contract', () => {
    it('constructs valid HTTP POST to NVIDIA NIM chat completions endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NIM_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.redirect).toBe('manual');

      const headers = calledInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer nvapi-mock-test-key-123456789');
      expect(headers['Content-Type']).toBe('application/json');

      const parsedPayload = JSON.parse(calledInit.body as string);
      expect(parsedPayload.model).toBe('meta/llama-3.1-70b-instruct');
      expect(parsedPayload.temperature).toBe(0.1);
      expect(parsedPayload.max_tokens).toBe(256);
    });
  });

  describe('Response Parsing Contract', () => {
    it('maps NIM OpenAI-compatible chat completion payload into normalized response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NIM_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      const data = result.data;
      expect(data.text).toBe('{"product":"LG C3 65 OLED","price":"1499.99 USD"}');
      expect(data.modelRef.providerId).toBe('nim');
      expect(data.modelRef.modelId).toBe('meta/llama-3.1-70b-instruct');
      expect(data.usage?.promptTokens).toBe(110);
      expect(data.usage?.completionTokens).toBe(35);
      expect(data.usage?.totalTokens).toBe(145);
    });
  });

  describe('Error Translation Contract', () => {
    it('handles FastAPI detail validation error array safely', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NIM_MOCK_FASTAPI_DETAIL_ERROR), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('INVALID_REQUEST');
      expect(result.error.isRetryable).toBe(false);
      expect(result.error.message).toContain('value must be between 0.0 and 2.0');
    });

    it('maps 401 auth error to AUTH_FAILED', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(NIM_MOCK_401_AUTH_ERROR), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('AUTH_FAILED');
      expect(result.error.isRetryable).toBe(false);
    });
  });
});
