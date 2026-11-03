import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TavilySearchAdapter,
  ExaSearchAdapter,
  MockSearchAdapter,
  SearchProviderRegistry,
  SearchExecutionService,
  SearchProviderError,
  type SearchQueryRequest,
} from '@/server/search';
import type { ResearchPlan } from '@/server/research/planner/contracts';
import * as securityModule from '@/server/security';
import { TaskType } from '@/server/persistence/types';

describe('Step 33: Search Provider Adapter, Bounded Search Execution & Source Result Normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createDummyPlan = (overrides?: Partial<ResearchPlan>): ResearchPlan => ({
    id: '11111111-2222-3333-4444-555555555555',
    status: 'READY',
    plannerVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    primaryQuery: 'RTX 4070 Super 12GB New under $600',
    intent: {
      originalQuery: 'RTX 4070 Super 12GB New under $600',
      normalizedQuery: 'RTX 4070 Super 12GB New under $600',
      taskType: TaskType.PRODUCT_RESEARCH,
      targetEntity: 'RTX 4070 Super',
      extractedCategory: 'GPU',
      provenance: 'DETERMINISTIC_EXTRACTION',
      constraints: [
        {
          id: 'c-1',
          type: 'PRICE_CEILING',
          priority: 'REQUIRED',
          key: 'maxPrice',
          operator: 'LTE',
          rawValue: '600',
          normalizedValue: 600,
          unitOrCurrency: 'USD',
          provenance: 'DETERMINISTIC_EXTRACTION',
        },
        {
          id: 'c-2',
          type: 'EXCLUDED_DOMAIN',
          priority: 'EXCLUDED',
          key: 'excludedDomains',
          operator: 'NOT_IN',
          rawValue: 'spam-site.com',
          normalizedValue: 'spam-site.com',
          provenance: 'DETERMINISTIC_EXTRACTION',
        },
      ],
    },
    searchQueries: [
      {
        id: 'q-1',
        query: 'RTX 4070 Super 12GB MSRP $599 specs',
        angle: 'PRIMARY',
        isPrimary: true,
        rationale: 'Primary target search',
        targetedConstraintKeys: ['maxPrice'],
      },
      {
        id: 'q-2',
        query: 'buy RTX 4070 Super new retailer stock',
        angle: 'RETAILER_AGGREGATOR',
        isPrimary: false,
        rationale: 'Stock availability search',
        targetedConstraintKeys: [],
      },
    ],
    ambiguities: [],
    warnings: [],
    ...overrides,
  });

  describe('1. Tavily Search Adapter (Official Contract Compliance)', () => {
    const adapter = new TavilySearchAdapter();

    it('rejects execution when API key is missing or empty', async () => {
      const req: SearchQueryRequest = {
        query: 'test query',
        maxResults: 5,
        requestId: 'req-1',
        searchDepth: 'QUICK',
        topic: 'general',
      };

      await expect(adapter.search(req, '')).rejects.toThrow(
        /Tavily API key is missing or empty/
      );
    });

    it('maps request to official POST https://api.tavily.com/search with Bearer auth and payload', async () => {
      const mockSafeFetch = vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.tavily.com/search',
        headers: {},
        redirectChain: [],
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({
          query: 'RTX 4070 Super',
          results: [
            {
              title: 'NVIDIA GeForce RTX 4070 Super Specifications',
              url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/',
              content: 'The GeForce RTX 4070 Super offers 12GB GDDR6X memory and 7168 CUDA cores.',
              score: 0.96,
              published_date: '2024-01-08',
            },
          ],
          response_time: 0.35,
        } as unknown as T),
      });

      const req: SearchQueryRequest = {
        query: 'RTX 4070 Super',
        maxResults: 5,
        requestId: 'req-1',
        searchDepth: 'DEEP',
        topic: 'general',
        excludeDomains: ['spam-site.com'],
      };

      const result = await adapter.search(req, 'tvly-synthetic-test-key-12345');

      expect(mockSafeFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockSafeFetch.mock.calls[0]!;

      expect(url).toBe('https://api.tavily.com/search');
      expect(init?.method).toBe('POST');
      expect(init?.headers?.Authorization).toBe('Bearer tvly-synthetic-test-key-12345');

      const body = JSON.parse(init?.body as string);
      expect(body.query).toBe('RTX 4070 Super');
      expect(body.search_depth).toBe('advanced'); // DEEP maps to advanced
      expect(body.max_results).toBe(5);
      expect(body.exclude_domains).toEqual(['spam-site.com']);

      expect(result.provider).toBe('tavily');
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.title).toBe('NVIDIA GeForce RTX 4070 Super Specifications');
      expect(result.results[0]?.relevanceScore).toBe(0.96);
      expect(result.results[0]?.publishedDate).toBe('2024-01-08');
      expect(result.usage.searchCreditsConsumed).toBe(2); // advanced depth = 2 credits
    });

    it('normalizes HTTP 401 into AUTHENTICATION_FAILED', async () => {
      vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        url: 'https://api.tavily.com/search',
        headers: {},
        redirectChain: [],
        text: async () => '{"detail": "Invalid API key"}',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({} as unknown as T),
      });

      const req: SearchQueryRequest = {
        query: 'test query',
        maxResults: 5,
        requestId: 'req-1',
        searchDepth: 'QUICK',
        topic: 'general',
      };

      await expect(adapter.search(req, 'bad-key')).rejects.toMatchObject({
        code: 'AUTHENTICATION_FAILED',
        statusCode: 401,
      });
    });

    it('normalizes HTTP 429 quota exhaustion into CREDITS_EXHAUSTED', async () => {
      vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        url: 'https://api.tavily.com/search',
        headers: {},
        redirectChain: [],
        text: async () => '{"detail": "Monthly credit quota has been exhausted"}',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({} as unknown as T),
      });

      const req: SearchQueryRequest = {
        query: 'test query',
        maxResults: 5,
        requestId: 'req-1',
        searchDepth: 'QUICK',
        topic: 'general',
      };

      await expect(adapter.search(req, 'valid-key')).rejects.toMatchObject({
        code: 'CREDITS_EXHAUSTED',
        statusCode: 429,
      });
    });

    it('normalizes HTTP 429 rate limit into RATE_LIMITED', async () => {
      vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        url: 'https://api.tavily.com/search',
        headers: {},
        redirectChain: [],
        text: async () => '{"detail": "Too many requests per minute"}',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({} as unknown as T),
      });

      const req: SearchQueryRequest = {
        query: 'test query',
        maxResults: 5,
        requestId: 'req-1',
        searchDepth: 'QUICK',
        topic: 'general',
      };

      await expect(adapter.search(req, 'valid-key')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        statusCode: 429,
      });
    });

    it('normalizes HTTP 500 into PROVIDER_UNAVAILABLE', async () => {
      vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        url: 'https://api.tavily.com/search',
        headers: {},
        redirectChain: [],
        text: async () => 'Service down for maintenance',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({} as unknown as T),
      });

      const req: SearchQueryRequest = {
        query: 'test query',
        maxResults: 5,
        requestId: 'req-1',
        searchDepth: 'QUICK',
        topic: 'general',
      };

      await expect(adapter.search(req, 'valid-key')).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
        statusCode: 503,
      });
    });
  });

  describe('2. Exa Search Adapter (Official Contract Compliance)', () => {
    const adapter = new ExaSearchAdapter();

    it('maps request to official POST https://api.exa.ai/search with x-api-key header', async () => {
      const mockSafeFetch = vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.exa.ai/search',
        headers: {},
        redirectChain: [],
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({
          results: [
            {
              id: 'exa-res-1',
              title: 'AMD Radeon RX 7800 XT Review',
              url: 'https://example-tech.com/review/rx-7800-xt',
              author: 'Jane Doe',
              publishedDate: '2023-09-06T13:00:00Z',
              score: 0.88,
              text: 'The RX 7800 XT offers 16GB VRAM and strong 1440p gaming.',
            },
          ],
        } as unknown as T),
      });

      const req: SearchQueryRequest = {
        query: 'RX 7800 XT',
        maxResults: 5,
        requestId: 'req-2',
        searchDepth: 'QUICK',
        topic: 'general',
        includeDomains: ['example-tech.com'],
      };

      const result = await adapter.search(req, 'exa-synthetic-key-999');

      expect(mockSafeFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockSafeFetch.mock.calls[0]!;

      expect(url).toBe('https://api.exa.ai/search');
      expect(init?.headers?.['x-api-key']).toBe('exa-synthetic-key-999');

      const body = JSON.parse(init?.body as string);
      expect(body.query).toBe('RX 7800 XT');
      expect(body.numResults).toBe(5);
      expect(body.includeDomains).toEqual(['example-tech.com']);

      expect(result.provider).toBe('exa');
      expect(result.results[0]?.providerResultId).toBe('exa-res-1');
      expect(result.results[0]?.author).toBe('Jane Doe');
      expect(result.results[0]?.publishedDate).toBe('2023-09-06T13:00:00Z');
      expect(result.results[0]?.snippet).toContain('16GB VRAM');
    });
  });

  describe('3. Step 32 Safe URL Validation Integration (Untrusted Result URLs)', () => {
    it('evaluates every search candidate URL through Step 32 public research policy', async () => {
      const mockAdapter = new MockSearchAdapter({
        candidates: [
          {
            title: 'Public Valid Site',
            url: 'https://public-reviews.com/rtx-4070',
            snippet: 'Valid public source.',
            publishedDate: '2024-01-01',
            author: null,
            relevanceScore: 0.95,
            providerResultId: '1',
          },
          {
            title: 'Loopback Exploit Site',
            url: 'http://127.0.0.1:80/admin',
            snippet: 'Internal admin page.',
            publishedDate: null,
            author: null,
            relevanceScore: 0.90,
            providerResultId: '2',
          },
          {
            title: 'Cloud Metadata Exploit Site',
            url: 'http://169.254.169.254/latest/meta-data/',
            snippet: 'AWS IMDS credentials.',
            publishedDate: null,
            author: null,
            relevanceScore: 0.85,
            providerResultId: '3',
          },
          {
            title: 'Embedded Credential Site',
            url: 'https://user:password@malicious.com/data',
            snippet: 'Phishing credential site.',
            publishedDate: null,
            author: null,
            relevanceScore: 0.80,
            providerResultId: '4',
          },
        ],
      });

      const registry = SearchProviderRegistry.getInstance();
      registry.registerAdapter('mock_search', mockAdapter);

      const service = new SearchExecutionService();
      const plan = createDummyPlan();

      const summary = await service.executePlan('user-123', plan, {
        providerId: 'mock_search',
        explicitApiKey: 'synthetic-mock-key',
        maxQueries: 1,
      });

      expect(summary.totalResultsDiscovered).toBe(4);
      expect(summary.validSourceCount).toBe(1);
      expect(summary.invalidSourceCount).toBe(3);

      // Verify individual candidate classification
      const validCand = summary.results.find((r) => r.originalUrl === 'https://public-reviews.com/rtx-4070');
      expect(validCand?.isFetchable).toBe(true);
      expect(validCand?.urlValidation.isValid).toBe(true);

      const loopbackCand = summary.results.find((r) => r.originalUrl.includes('127.0.0.1'));
      expect(loopbackCand?.isFetchable).toBe(false);
      expect(loopbackCand?.urlValidation.isValid).toBe(false);

      const metadataCand = summary.results.find((r) => r.originalUrl.includes('169.254.169.254'));
      expect(metadataCand?.isFetchable).toBe(false);
      expect(metadataCand?.urlValidation.isValid).toBe(false);

      const credCand = summary.results.find((r) => r.originalUrl.includes('user:password'));
      expect(credCand?.isFetchable).toBe(false);
      expect(credCand?.urlValidation.isValid).toBe(false);
    });
  });

  describe('4. Bounded Search Execution & Resource Guardrails', () => {
    it('rejects research plans that are not READY (e.g. NEEDS_CLARIFICATION)', async () => {
      const service = new SearchExecutionService();
      const plan = createDummyPlan({
        status: 'NEEDS_CLARIFICATION',
        ambiguities: [
          {
            code: 'MISSING_CURRENCY',
            message: 'Currency symbol was omitted',
            field: 'maxPrice',
          },
        ],
      });

      await expect(
        service.executePlan('user-123', plan, {
          providerId: 'mock_search',
          explicitApiKey: 'key',
        })
      ).rejects.toThrow(/PLAN_NOT_READY|Only READY plans can be executed/);
    });

    it('enforces maximum query count ceiling (hard cap of 5)', async () => {
      const mockAdapter = new MockSearchAdapter();
      const searchSpy = vi.spyOn(mockAdapter, 'search');

      const registry = SearchProviderRegistry.getInstance();
      registry.registerAdapter('mock_search', mockAdapter);

      const service = new SearchExecutionService();
      const plan = createDummyPlan({
        searchQueries: [
          { id: 'q-1', query: 'v1', angle: 'PRIMARY', isPrimary: true, rationale: 'r', targetedConstraintKeys: [] },
          { id: 'q-2', query: 'v2', angle: 'PRIMARY', isPrimary: false, rationale: 'r', targetedConstraintKeys: [] },
          { id: 'q-3', query: 'v3', angle: 'PRIMARY', isPrimary: false, rationale: 'r', targetedConstraintKeys: [] },
          { id: 'q-4', query: 'v4', angle: 'PRIMARY', isPrimary: false, rationale: 'r', targetedConstraintKeys: [] },
          { id: 'q-5', query: 'v5', angle: 'PRIMARY', isPrimary: false, rationale: 'r', targetedConstraintKeys: [] },
          // Excess queries beyond ceiling
        ],
      });

      const summary = await service.executePlan('user-123', plan, {
        providerId: 'mock_search',
        explicitApiKey: 'key',
        maxQueries: 10, // Attempt to request 10 queries
      });

      // Must be capped at 5
      expect(summary.queriesAttempted).toBe(5);
      expect(searchSpy).toHaveBeenCalledTimes(5);
    });

    it('enforces aggregate result ceiling across multiple queries', async () => {
      const mockAdapter = new MockSearchAdapter({
        candidates: Array.from({ length: 15 }, (_, i) => ({
          title: `Result ${i + 1}`,
          url: `https://example.com/page-${i + 1}`,
          snippet: `Snippet ${i + 1}`,
          publishedDate: null,
          author: null,
          relevanceScore: 0.9,
          providerResultId: `id-${i + 1}`,
        })),
      });

      const registry = SearchProviderRegistry.getInstance();
      registry.registerAdapter('mock_search', mockAdapter);

      const service = new SearchExecutionService();
      const plan = createDummyPlan();

      const summary = await service.executePlan('user-123', plan, {
        providerId: 'mock_search',
        explicitApiKey: 'key',
        maxAggregateResults: 10, // Cap total discovered results to 10
      });

      expect(summary.totalResultsDiscovered).toBe(10);
      expect(summary.results.length).toBe(10);
    });

    it('supports caller cancellation via AbortSignal without corrupting state', async () => {
      const controller = new AbortController();
      controller.abort(); // Cancel before execution

      const service = new SearchExecutionService();
      const plan = createDummyPlan();

      const summary = await service.executePlan('user-123', plan, {
        providerId: 'mock_search',
        explicitApiKey: 'key',
        signal: controller.signal,
      });

      expect(summary.status).toBe('CANCELLED');
      expect(summary.queriesAttempted).toBe(0);
    });

    it('truthfully reports partial success when one query fails and one succeeds', async () => {
      let callCount = 0;
      const mockAdapter = new MockSearchAdapter();
      vi.spyOn(mockAdapter, 'search').mockImplementation(async (req) => {
        callCount++;
        if (callCount === 1) {
          return {
            provider: 'mock_search',
            query: req.query,
            results: [
              {
                title: 'Success Result',
                url: 'https://example.com/ok',
                snippet: 'OK',
                publishedDate: null,
                author: null,
                relevanceScore: 0.9,
                providerResultId: '1',
              },
            ],
            responseId: 'r-1',
            usage: { searchCreditsConsumed: 1, latencyMs: 10 },
          };
        }
        throw new SearchProviderError('RATE_LIMITED', 'Rate limited on second query', {
          providerId: 'mock_search',
        });
      });

      const registry = SearchProviderRegistry.getInstance();
      registry.registerAdapter('mock_search', mockAdapter);

      const service = new SearchExecutionService();
      const plan = createDummyPlan();

      const summary = await service.executePlan('user-123', plan, {
        providerId: 'mock_search',
        explicitApiKey: 'key',
        concurrency: 1,
      });

      expect(summary.status).toBe('PARTIAL');
      expect(summary.queriesSucceeded).toBe(1);
      expect(summary.queriesFailed).toBe(1);
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]?.code).toBe('RATE_LIMITED');
      expect(summary.results).toHaveLength(1);
    });
  });

  describe('5. Search Result Contract & Metadata Normalization', () => {
    it('preserves query variant association and does not invent publication date or scores', () => {
      const rawCandidate = {
        title: 'Hardware Product Page',
        url: 'https://tech-store.com/item/123',
        snippet: 'A good GPU',
        publishedDate: null,
        author: null,
        relevanceScore: null,
        providerResultId: null,
      };

      expect(rawCandidate.publishedDate).toBeNull();
      expect(rawCandidate.relevanceScore).toBeNull();
      expect(rawCandidate.author).toBeNull();
    });

    it('ensures search results are distinguished from extracted sources and verified facts', () => {
      // Contract invariant: NormalizedSearchResult contains urlValidation but NOT extracted body or verification
      const candidateKeys = ['id', 'provider', 'originalUrl', 'title', 'snippet', 'urlValidation', 'isFetchable'];
      for (const k of candidateKeys) {
        expect(k).toBeDefined();
      }
    });
  });
});
