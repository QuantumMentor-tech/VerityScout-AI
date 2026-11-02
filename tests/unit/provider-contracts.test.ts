import { describe, it, expect } from 'vitest';
import {
  AI_PROVIDER_IDS,
  isAiProviderId,
  assertValidProviderId,
} from '@/server/providers/contracts/provider-id';
import {
  declareCapability,
} from '@/server/providers/contracts/capabilities';
import {
  BASELINE_PROVIDER_METADATA,
} from '@/server/providers/contracts/metadata';
import {
  createModelReference,
  formatModelReference,
  parseModelReference,
} from '@/server/providers/contracts/model';
import {
  validateInferenceRequest,
  type NormalizedInferenceRequest,
} from '@/server/providers/contracts/inference';
import {
  createSuccessResult,
  createErrorResult,
  createProviderError,
  isRetryableErrorCode,
} from '@/server/providers/contracts/operation-result';

describe('Step 27: Common AI Provider Contracts', () => {
  describe('Provider Identifiers', () => {
    it('defines exactly the approved canonical provider set', () => {
      expect(AI_PROVIDER_IDS).toEqual(['openai', 'openrouter', 'nim']);
    });

    it('identifies valid canonical provider IDs', () => {
      expect(isAiProviderId('openai')).toBe(true);
      expect(isAiProviderId('openrouter')).toBe(true);
      expect(isAiProviderId('nim')).toBe(true);
    });

    it('rejects unapproved or malformed provider IDs', () => {
      expect(isAiProviderId('anthropic')).toBe(false);
      expect(isAiProviderId('cohere')).toBe(false);
      expect(isAiProviderId('')).toBe(false);
      expect(isAiProviderId(null)).toBe(false);
      expect(isAiProviderId(123)).toBe(false);
    });

    it('assertValidProviderId throws on invalid IDs and passes on valid ones', () => {
      expect(() => assertValidProviderId('openai')).not.toThrow();
      expect(() => assertValidProviderId('openrouter')).not.toThrow();
      expect(() => assertValidProviderId('nim')).not.toThrow();

      expect(() => assertValidProviderId('bogus')).toThrow(TypeError);
      expect(() => assertValidProviderId('bogus')).toThrow(/Approved canonical providers are: openai, openrouter, nim/);
    });
  });

  describe('Capability Declarations', () => {
    it('creates trinary capability declarations with provenance', () => {
      const supported = declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', {
        sourceReference: 'https://platform.openai.com/docs',
      });
      expect(supported.status).toBe('SUPPORTED');
      expect(supported.provenance).toBe('OFFICIAL_DOCUMENTATION');
      expect(supported.sourceReference).toBe('https://platform.openai.com/docs');

      const unsupported = declareCapability('UNSUPPORTED', 'CONTRACT_DEFINED', {
        notes: 'Audio not supported in MVP',
      });
      expect(unsupported.status).toBe('UNSUPPORTED');
      expect(unsupported.notes).toBe('Audio not supported in MVP');

      const unknown = declareCapability('UNKNOWN', 'CONTRACT_DEFINED');
      expect(unknown.status).toBe('UNKNOWN');
      expect(unknown.verifiedAt).toBeUndefined();
    });

    it('never promotes unknown capability to supported implicitly', () => {
      const cap = declareCapability('UNKNOWN', 'CONTRACT_DEFINED');
      expect(cap.status).not.toBe('SUPPORTED');
    });
  });

  describe('Provider Metadata', () => {
    it('provides baseline metadata for all three canonical providers', () => {
      for (const id of AI_PROVIDER_IDS) {
        const meta = BASELINE_PROVIDER_METADATA[id];
        expect(meta).toBeDefined();
        expect(meta.id).toBe(id);
        expect(meta.integrationStatus).toBe('CONTRACT_DEFINED');
        expect(meta.supportedOperations).toContain('CONNECTION_TEST');
        expect(meta.supportedOperations).toContain('GENERATE_TEXT');
        expect(meta.allowedHosts.length).toBeGreaterThan(0);
        expect(meta.defaultEndpoint).toMatch(/^https:\/\//);
      }
    });

    it('metadata contains zero secrets or credential values', () => {
      for (const id of AI_PROVIDER_IDS) {
        const meta = BASELINE_PROVIDER_METADATA[id];
        const json = JSON.stringify(meta);
        expect(meta).not.toHaveProperty('apiKey');
        expect(meta).not.toHaveProperty('credential');
        expect(meta).not.toHaveProperty('secret');
        // Real API keys are forbidden, documentation placeholders are allowed
        expect(json).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
        expect(json).not.toMatch(/nvapi-[a-zA-Z0-9]{20,}/);
        expect(json).not.toContain('Bearer ');
      }
    });
  });

  describe('Model References', () => {
    it('creates, formats, and parses valid model references', () => {
      const ref = createModelReference('openai', 'gpt-4o');
      expect(ref.providerId).toBe('openai');
      expect(ref.modelId).toBe('gpt-4o');

      const formatted = formatModelReference(ref);
      expect(formatted).toBe('openai:gpt-4o');

      const parsed = parseModelReference('openai:gpt-4o');
      expect(parsed).toEqual(ref);
    });

    it('rejects empty or malformed model references', () => {
      expect(() => createModelReference('openai', '')).toThrow(/empty or whitespace/);
      expect(() => parseModelReference('invalid-format')).toThrow(/Expected format "providerId:modelId"/);
      expect(() => parseModelReference('unapproved:model-1')).toThrow(/Unknown provider ID/);
    });
  });

  describe('Normalized Inference Request Validation', () => {
    const validRequest: NormalizedInferenceRequest = {
      modelRef: { providerId: 'openai', modelId: 'gpt-4o' },
      messages: [
        { role: 'system', content: 'You are a research assistant.' },
        { role: 'user', content: 'Analyze this claim.' },
      ],
      temperature: 0.7,
      maxTokens: 1000,
    };

    it('validates a compliant inference request', () => {
      expect(() => validateInferenceRequest(validRequest)).not.toThrow();
    });

    it('rejects request with empty messages array', () => {
      expect(() =>
        validateInferenceRequest({ ...validRequest, messages: [] })
      ).toThrow(/must contain at least one message/);
    });

    it('rejects request with empty message content', () => {
      expect(() =>
        validateInferenceRequest({
          ...validRequest,
          messages: [{ role: 'user', content: '   ' }],
        })
      ).toThrow(/empty or non-string content/);
    });

    it('rejects invalid temperature bounds', () => {
      expect(() =>
        validateInferenceRequest({ ...validRequest, temperature: -0.1 })
      ).toThrow(/Temperature must be between 0.0 and 2.0/);

      expect(() =>
        validateInferenceRequest({ ...validRequest, temperature: 2.5 })
      ).toThrow(/Temperature must be between 0.0 and 2.0/);
    });

    it('rejects non-positive maxTokens', () => {
      expect(() =>
        validateInferenceRequest({ ...validRequest, maxTokens: 0 })
      ).toThrow(/positive integer/);

      expect(() =>
        validateInferenceRequest({ ...validRequest, maxTokens: -50 })
      ).toThrow(/positive integer/);
    });
  });

  describe('Normalized Operation Results and Error Classification', () => {
    it('creates structured success results', () => {
      const result = createSuccessResult({ answer: 42 }, 150);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ answer: 42 });
        expect(result.latencyMs).toBe(150);
      }
    });

    it('creates structured error results with sanitized error details', () => {
      const error = createProviderError({
        code: 'AUTH_FAILED',
        message: 'Invalid API key credentials',
        providerId: 'openai',
        httpStatus: 401,
        correlationId: 'req-123',
      });
      const result = createErrorResult(error, 75);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_FAILED');
        expect(result.error.providerId).toBe('openai');
        expect(result.error.isRetryable).toBe(false);
        expect(result.error.httpStatus).toBe(401);
        expect(result.latencyMs).toBe(75);
      }
    });

    it('accurately identifies retryable error codes', () => {
      expect(isRetryableErrorCode('RATE_LIMITED')).toBe(true);
      expect(isRetryableErrorCode('TIMEOUT')).toBe(true);
      expect(isRetryableErrorCode('PROVIDER_UNAVAILABLE')).toBe(true);
      expect(isRetryableErrorCode('NETWORK_ERROR')).toBe(true);

      expect(isRetryableErrorCode('AUTH_FAILED')).toBe(false);
      expect(isRetryableErrorCode('PERMISSION_DENIED')).toBe(false);
      expect(isRetryableErrorCode('INVALID_REQUEST')).toBe(false);
      expect(isRetryableErrorCode('UNSUPPORTED_OPERATION')).toBe(false);
    });
  });
});
