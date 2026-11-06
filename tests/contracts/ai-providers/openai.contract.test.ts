import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiProviderAdapter } from '@/server/providers/adapters/openai';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import {
  type NormalizedInferenceRequest,
  createModelReference,
} from '@/server/providers/contracts';
import {
  OPENAI_MOCK_SUCCESS_RESPONSE,
  OPENAI_MOCK_REFUSAL_RESPONSE,
  OPENAI_MOCK_401_AUTH_ERROR,
  OPENAI_MOCK_429_RATE_LIMIT_ERROR,
  OPENAI_MOCK_404_MODEL_ERROR,
} from '../fixtures/mock-responses';

describe('OpenAI Provider Contract Tests (Step 51 / Step 28)', () => {
  let mockCredentialService: Partial<ProviderCredentialService>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let adapter: OpenAiProviderAdapter;

  const validRequest: NormalizedInferenceRequest = {
    modelRef: createModelReference('openai', 'gpt-4o'),
    messages: [
      { role: 'system', content: 'You are an evidence extraction assistant.' },
      { role: 'user', content: 'Extract specs for Framework Laptop 13.' },
    ],
    temperature: 0.2,
    maxTokens: 500,
    responseFormat: {
      type: 'json_schema',
      schemaName: 'extracted_specs',
      schema: {
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      },
    },
  };

  const context = {
    userId: 'user-contract-1',
    correlationId: 'corr-openai-123',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockCredentialService = {
      getDecryptedCredential: vi.fn().mockResolvedValue('test-openai-key-mock-12345'),
    };

    mockFetch = vi.fn();

    adapter = new OpenAiProviderAdapter({
      credentialService: mockCredentialService as ProviderCredentialService,
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 5000,
    });
  });

  describe('Request Construction Contract', () => {
    it('constructs valid HTTP POST to OpenAI Responses endpoint with strict headers', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENAI_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://api.openai.com/v1/responses');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.redirect).toBe('manual');

      const headers = calledInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-openai-key-mock-12345');
      expect(headers['Content-Type']).toBe('application/json');

      const parsedPayload = JSON.parse(calledInit.body as string);
      expect(parsedPayload.model).toBe('gpt-4o');
      expect(parsedPayload.input).toEqual([
        { role: 'system', content: 'You are an evidence extraction assistant.' },
        { role: 'user', content: 'Extract specs for Framework Laptop 13.' },
      ]);
      expect(parsedPayload.temperature).toBe(0.2);
      expect(parsedPayload.max_output_tokens).toBe(500);
      expect(parsedPayload.response_format?.type).toBe('json_object');
    });

    it('rejects requests targeting a mismatched provider ID before making HTTP calls', async () => {
      const mismatchedRequest: NormalizedInferenceRequest = {
        ...validRequest,
        modelRef: createModelReference('openrouter', 'anthropic/claude-3.5-sonnet'),
      };

      const result = await adapter.generateText(mismatchedRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('INVALID_REQUEST');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Response Parsing Contract', () => {
    it('maps official OpenAI Responses output_text and token usage into normalized response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENAI_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      const data = result.data;
      expect(data.text).toBe('{"result":"Framework Laptop 13 features Intel Core i7-1370P processor."}');
      expect(data.modelRef.providerId).toBe('openai');
      expect(data.modelRef.modelId).toBe('gpt-4o');
      expect(data.finishReason).toBe('stop');
      expect(data.usage?.promptTokens).toBe(120);
      expect(data.usage?.completionTokens).toBe(45);
      expect(data.usage?.totalTokens).toBe(165);
    });

    it('handles official OpenAI refusal response without failing silently', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENAI_MOCK_REFUSAL_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      const data = result.data;
      expect(data.finishReason).toBe('content_filter');
      expect(data.rawFinishReason).toBe('refusal');
      expect(data.text).toBe('I cannot assist with this request due to safety policies.');
    });
  });

  describe('Error Normalization & Security Contract', () => {
    it('maps HTTP 401 invalid key to non-retryable AUTH_FAILED and masks credential', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENAI_MOCK_401_AUTH_ERROR), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('AUTH_FAILED');
      expect(result.error.isRetryable).toBe(false);
      expect(result.error.httpStatus).toBe(401);
      expect(result.error.message).not.toContain('test-openai-key-mock');
    });

    it('maps HTTP 404 model not found to non-retryable MODEL_UNAVAILABLE', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENAI_MOCK_404_MODEL_ERROR), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('MODEL_UNAVAILABLE');
      expect(result.error.isRetryable).toBe(false);
    });

    it('maps HTTP 429 rate limit to retryable RATE_LIMITED', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENAI_MOCK_429_RATE_LIMIT_ERROR), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.isRetryable).toBe(true);
    });

    it('maps HTTP 500 upstream server error to retryable PROVIDER_UNAVAILABLE', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Internal server error', type: 'api_error' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('PROVIDER_UNAVAILABLE');
      expect(result.error.isRetryable).toBe(true);
    });
  });

  describe('Cancellation Contract', () => {
    it('aborts fetch request when context.abortSignal fires', async () => {
      const abortController = new AbortController();

      mockFetch.mockImplementationOnce((_url, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const cancelPromise = adapter.generateText(validRequest, {
        ...context,
        abortSignal: abortController.signal,
      });

      abortController.abort();

      const result = await cancelPromise;
      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('CANCELLED');
    });
  });

  describe('listModels Contract', () => {
    it('normalizes OpenAI /v1/models response into ModelDefinition list', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o1-preview' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await adapter.listModels(context);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data).toHaveLength(3);
      expect(result.data[0]?.reference.modelId).toBe('gpt-4o');
      expect(result.data[0]?.reference.providerId).toBe('openai');
    });
  });
});
