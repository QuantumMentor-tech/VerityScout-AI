import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TavilySearchAdapter } from '@/server/search/adapters/tavily/tavily-search-adapter';
import { SearchProviderError, SearchQueryRequest } from '@/server/search/contracts';
import * as securityModule from '@/server/security';
import {
  TAVILY_MOCK_SUCCESS_RESPONSE,
  TAVILY_MOCK_EMPTY_RESPONSE,
  TAVILY_MOCK_401_ERROR,
} from '../fixtures/mock-responses';

describe('Tavily Search Provider Contract Tests (Step 51 / Step 33)', () => {
  let adapter: TavilySearchAdapter;
  let safeFetchSpy: ReturnType<typeof vi.spyOn>;

  const validRequest: SearchQueryRequest = {
    requestId: 'req-tavily-1',
    query: 'lg c3 65 inch oled tv specs price',
    searchDepth: 'DEEP',
    maxResults: 5,
    includeDomains: ['bestbuy.com', 'rtings.com'],
    topic: 'general',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new TavilySearchAdapter();
    safeFetchSpy = vi.spyOn(securityModule, 'safeFetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Construction Contract', () => {
    it('constructs valid POST request with TRUSTED_PROVIDER policy and bearer auth', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(TAVILY_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await adapter.search(validRequest, 'tvly-mock-test-key-123');

      expect(safeFetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = safeFetchSpy.mock.calls[0] as [string, any];

      expect(calledUrl).toBe('https://api.tavily.com/search');
      expect(calledOptions.policy).toBe('TRUSTED_PROVIDER');
      expect(calledOptions.method).toBe('POST');
      expect(calledOptions.headers['Authorization']).toBe('Bearer tvly-mock-test-key-123');
      expect(calledOptions.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(calledOptions.body);
      expect(body.query).toBe('lg c3 65 inch oled tv specs price');
      expect(body.search_depth).toBe('advanced'); // DEEP maps to 'advanced'
      expect(body.max_results).toBe(5);
      expect(body.include_domains).toEqual(['bestbuy.com', 'rtings.com']);
    });

    it('rejects execution when API key is missing or empty', async () => {
      await expect(adapter.search(validRequest, '')).rejects.toThrow(SearchProviderError);
      expect(safeFetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Response Mapping Contract', () => {
    it('maps Tavily results into common SearchCandidate schema with normalized scores', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(TAVILY_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const response = await adapter.search(validRequest, 'tvly-mock-test-key-123');

      expect(response.provider).toBe('tavily');
      expect(response.results).toHaveLength(2);

      const first = response.results[0]!;
      expect(first.title).toBe('LG C3 65" Class OLED evo 4K TV - Best Buy');
      expect(first.url).toBe('https://www.bestbuy.com/site/lg-65-c3-oled/6535928.p');
      expect(first.snippet).toContain('In stock for $1,499.99');
      expect(first.relevanceScore).toBe(0.94);
      expect(first.publishedDate).toBe('2026-10-15');
    });

    it('handles empty search results list safely', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(TAVILY_MOCK_EMPTY_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const response = await adapter.search(validRequest, 'tvly-mock-test-key-123');

      expect(response.results).toHaveLength(0);
      expect(response.query).toBe(validRequest.query);
    });
  });

  describe('Error Handling Contract', () => {
    it('translates HTTP 401 invalid API key to SearchProviderError', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(TAVILY_MOCK_401_ERROR), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(
        adapter.search(validRequest, 'bad-tavily-key')
      ).rejects.toThrow(SearchProviderError);
    });

    it('handles malformed non-JSON response gracefully', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response('<html>Bad Gateway</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      );

      await expect(
        adapter.search(validRequest, 'tvly-mock-test-key-123')
      ).rejects.toThrow(SearchProviderError);
    });
  });
});
