import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateProviderEndpoint,
  testProviderConnection,
  APPROVED_PROVIDER_TEST_ENDPOINTS,
} from '@/server/providers/connection-tester';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';

describe('AI Provider Connection Tester (Step 26 / SEC-011, SEC-012)', () => {
  const userId = '11111111-1111-4111-a111-111111111111';
  let mockCredentialService: ProviderCredentialService;
  let mockConfigRepo: ProviderConfigRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCredentialService = {
      getDecryptedCredential: vi.fn().mockResolvedValue('sk-test-mock-secret-key-12345'),
    } as unknown as ProviderCredentialService;

    mockConfigRepo = {
      updateTestStatus: vi.fn().mockResolvedValue(null),
    } as unknown as ProviderConfigRepository;
  });

  describe('1. SSRF & Destination Allowlist Validation', () => {
    it('PROV-TEST-001: Permits valid official endpoints for openai, openrouter, and nim', () => {
      expect(() =>
        validateProviderEndpoint('openai', APPROVED_PROVIDER_TEST_ENDPOINTS.openai!.url)
      ).not.toThrow();
      expect(() =>
        validateProviderEndpoint('openrouter', APPROVED_PROVIDER_TEST_ENDPOINTS.openrouter!.url)
      ).not.toThrow();
      expect(() =>
        validateProviderEndpoint('nim', APPROVED_PROVIDER_TEST_ENDPOINTS.nim!.url)
      ).not.toThrow();
    });

    it('PROV-TEST-002: Rejects insecure HTTP protocol', () => {
      expect(() =>
        validateProviderEndpoint('openai', 'http://api.openai.com/v1/models')
      ).toThrow(/must use secure HTTPS protocol/);
    });

    it('PROV-TEST-003: Blocks arbitrary destination hosts and SSRF bypass attempts', () => {
      expect(() =>
        validateProviderEndpoint('openai', 'https://attacker.com/v1/models')
      ).toThrow(/Forbidden endpoint destination/);

      expect(() =>
        validateProviderEndpoint('openai', 'https://169.254.169.254/latest/meta-data')
      ).toThrow(/Forbidden endpoint destination/);
    });

    it('PROV-TEST-004: Rejects unapproved provider identifier', () => {
      expect(() =>
        validateProviderEndpoint('unsupported-llm', 'https://api.unsupported.com')
      ).toThrow(/No approved test endpoint defined/);
    });
  });

  describe('2. Connection Probe Execution & Header Security', () => {
    it('PROV-TEST-005: Executes lightweight probe against OpenAI with manual redirect and Bearer auth', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      });

      const outcome = await testProviderConnection(userId, 'openai', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.code).toBe('SUCCESS');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/models');
      expect(requestInit.method).toBe('GET');
      expect(requestInit.redirect).toBe('manual'); // SEC-012: Never forward tokens across redirects
      expect((requestInit.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk-test-mock-secret-key-12345'
      );

      // Verify DB status update
      expect(mockConfigRepo.updateTestStatus).toHaveBeenCalledWith(
        userId,
        'openai',
        'SUCCESS',
        expect.any(Date)
      );
    });

    it('PROV-TEST-006: Executes lightweight auth probe against OpenRouter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { label: 'my-key' } }),
      });

      const outcome = await testProviderConnection(userId, 'openrouter', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.code).toBe('SUCCESS');

      const [url, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://openrouter.ai/api/v1/auth/key');
      expect((requestInit.headers as Record<string, string>)['HTTP-Referer']).toBe(
        'https://verityscout.local'
      );
    });

    it('PROV-TEST-007: Executes lightweight probe against NVIDIA NIM', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: [] }),
      });

      const outcome = await testProviderConnection(userId, 'nim', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.code).toBe('SUCCESS');
      expect(mockFetch.mock.calls[0]?.[0]).toBe('https://integrate.api.nvidia.com/v1/models');
    });
  });

  describe('3. Error Normalization and Non-Disclosure', () => {
    it('PROV-TEST-008: Correctly handles 401 Unauthorized as AUTH_FAILED without credential exposure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
      });

      const outcome = await testProviderConnection(userId, 'openai', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('AUTH_FAILED');
      expect(outcome.message).toContain('Authentication rejected');
      expect(outcome.message).not.toContain('sk-test');

      expect(mockConfigRepo.updateTestStatus).toHaveBeenCalledWith(
        userId,
        'openai',
        'FAILED',
        expect.any(Date)
      );
    });

    it('PROV-TEST-009: Correctly handles 403 Forbidden as PERMISSION_DENIED', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
      });

      const outcome = await testProviderConnection(userId, 'openai', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('PERMISSION_DENIED');
      expect(outcome.message).toContain('Permission denied');
    });

    it('PROV-TEST-010: Correctly handles 429 Rate Limit as RATE_LIMITED', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 429,
        ok: false,
      });

      const outcome = await testProviderConnection(userId, 'openrouter', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('RATE_LIMITED');
      expect(outcome.message).toContain('rate limit');
    });

    it('PROV-TEST-011: Handles AbortError timeout with safe TIMEOUT code', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const mockFetch = vi.fn().mockRejectedValue(abortError);

      const outcome = await testProviderConnection(userId, 'nim', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('TIMEOUT');
      expect(outcome.message).toContain('timed out after 5 seconds');
    });

    it('PROV-TEST-012: Handles missing credential gracefully without dispatching network request', async () => {
      mockCredentialService.getDecryptedCredential = vi.fn().mockResolvedValue(null);
      const mockFetch = vi.fn();

      const outcome = await testProviderConnection(userId, 'openai', {
        credentialService: mockCredentialService,
        configRepo: mockConfigRepo,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('AUTH_FAILED');
      expect(outcome.message).toContain('No API credential configured');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
