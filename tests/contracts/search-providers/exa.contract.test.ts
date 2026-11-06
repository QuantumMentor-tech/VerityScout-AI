import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExaSearchAdapter } from '@/server/search/adapters/exa/exa-search-adapter';
import { SearchProviderError, SearchQueryRequest } from '@/server/search/contracts';
import * as securityModule from '@/server/security';
import { EXA_MOCK_SUCCESS_RESPONSE } from '../fixtures/mock-responses';

describe('Exa Search Provider Contract Tests (Step 51 / Step 33)', () => {
  let adapter: ExaSearchAdapter;
  let safeFetchSpy: ReturnType<typeof vi.spyOn>;

  const validRequest: SearchQueryRequest = {
    requestId: 'req-exa-1',
    query: 'apple macbook pro 14 m3 specs',
    searchDepth: 'QUICK',
    maxResults: 3,
    topic: 'general',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new ExaSearchAdapter();
    safeFetchSpy = vi.spyOn(securityModule, 'safeFetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Construction Contract', () => {
    it('constructs valid POST request with x-api-key header and trusted provider policy', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(EXA_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await adapter.search(validRequest, 'exa-mock-key-789');

      expect(safeFetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = safeFetchSpy.mock.calls[0] as [string, any];

      expect(calledUrl).toBe('https://api.exa.ai/search');
      expect(calledOptions.policy).toBe('TRUSTED_PROVIDER');
      expect(calledOptions.method).toBe('POST');
      expect(calledOptions.headers['x-api-key']).toBe('exa-mock-key-789');

      const body = JSON.parse(calledOptions.body);
      expect(body.query).toBe('apple macbook pro 14 m3 specs');
      expect(body.numResults).toBe(3);
    });

    it('rejects execution when API key is missing', async () => {
      await expect(adapter.search(validRequest, '')).rejects.toThrow(SearchProviderError);
      expect(safeFetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Response Mapping Contract', () => {
    it('maps Exa response text and score into common SearchCandidate schema', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(EXA_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const response = await adapter.search(validRequest, 'exa-mock-key-789');

      expect(response.provider).toBe('exa');
      expect(response.results).toHaveLength(1);

      const first = response.results[0]!;
      expect(first.title).toBe('MacBook Pro 14-inch M3 - Apple');
      expect(first.url).toBe('https://www.apple.com/macbook-pro-14-and-16/');
      expect(first.snippet).toContain('Apple MacBook Pro 14 with M3 chip');
      expect(first.relevanceScore).toBe(0.96);
    });
  });
});
