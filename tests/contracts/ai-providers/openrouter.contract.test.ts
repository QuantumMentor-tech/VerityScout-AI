import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProviderAdapter } from '@/server/providers/adapters/openrouter';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import {
  type NormalizedInferenceRequest,
  createModelReference,
} from '@/server/providers/contracts';
import {
  OPENROUTER_MOCK_SUCCESS_RESPONSE,
  OPENROUTER_MOCK_402_CREDIT_ERROR,
  OPENROUTER_MOCK_429_RATE_LIMIT_ERROR,
} from '../fixtures/mock-responses';

describe('OpenRouter Provider Contract Tests (Step 51 / Step 29)', () => {
  let mockCredentialService: Partial<ProviderCredentialService>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let adapter: OpenRouterProviderAdapter;

  const validRequest: NormalizedInferenceRequest = {
    modelRef: createModelReference('openrouter', 'anthropic/claude-3.5-sonnet'),
    messages: [
      { role: 'system', content: 'You are an objective research verification model.' },
      { role: 'user', content: 'Verify battery life specs for Sony WH-1000XM5.' },
    ],
    temperature: 0.0,
    maxTokens: 300,
  };

  const context = {
    userId: 'user-contract-2',
    correlationId: 'corr-openrouter-456',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockCredentialService = {
      getDecryptedCredential: vi.fn().mockResolvedValue('sk-or-v1-mock-test-key-98765'),
    };

    mockFetch = vi.fn();

    adapter = new OpenRouterProviderAdapter({
      credentialService: mockCredentialService as ProviderCredentialService,
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 5000,
    });
  });

  describe('Request Construction Contract', () => {
    it('constructs valid HTTP POST to OpenRouter chat completions with required headers', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENROUTER_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.redirect).toBe('manual');

      const headers = calledInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-or-v1-mock-test-key-98765');
      expect(headers['HTTP-Referer']).toBe('https://verityscout.local');
      expect(headers['X-Title']).toBe('VerityScout AI');
      expect(headers['Content-Type']).toBe('application/json');

      const parsedPayload = JSON.parse(calledInit.body as string);
      expect(parsedPayload.model).toBe('anthropic/claude-3.5-sonnet');
      expect(parsedPayload.messages).toEqual([
        { role: 'system', content: 'You are an objective research verification model.' },
        { role: 'user', content: 'Verify battery life specs for Sony WH-1000XM5.' },
      ]);
      expect(parsedPayload.temperature).toBe(0.0);
      expect(parsedPayload.max_tokens).toBe(300);
    });
  });

  describe('Response Parsing Contract', () => {
    it('maps OpenRouter Chat Completions choices and tokens into normalized response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENROUTER_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      const data = result.data;
      expect(data.text).toBe('{"analysis":"Sony WH-1000XM5 battery life is verified at 30 hours."}');
      expect(data.modelRef.providerId).toBe('openrouter');
      expect(data.modelRef.modelId).toBe('anthropic/claude-3.5-sonnet');
      expect(data.finishReason).toBe('stop');
      expect(data.usage?.promptTokens).toBe(150);
      expect(data.usage?.completionTokens).toBe(60);
      expect(data.usage?.totalTokens).toBe(210);
    });
  });

  describe('Error Translation Contract', () => {
    it('maps HTTP 402 insufficient credits to non-retryable INSUFFICIENT_CREDITS', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENROUTER_MOCK_402_CREDIT_ERROR), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('INSUFFICIENT_CREDITS');
      expect(result.error.isRetryable).toBe(false);
      expect(result.error.httpStatus).toBe(402);
    });

    it('maps HTTP 429 rate limit to retryable RATE_LIMITED', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(OPENROUTER_MOCK_429_RATE_LIMIT_ERROR), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await adapter.generateText(validRequest, context);

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.isRetryable).toBe(true);
      expect(result.error.httpStatus).toBe(429);
    });
  });
});
