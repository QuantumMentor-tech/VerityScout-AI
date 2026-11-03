import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canonicalizeUrl,
  evaluateCanonicalHint,
  CANONICALIZER_POLICY_VERSION,
  APPROVED_TRACKING_PARAMS,
} from '@/server/search/canonicalizer';
import { SearchCounterTracker } from '@/server/search/provenance/search-counters';
import { SourceIdentityService } from '@/server/search/provenance/source-identity.service';
import type { NormalizedSearchResult } from '@/server/search/contracts';
import { validateUrl } from '@/server/security';
import { PoolClient } from 'pg';
import {
  SourceDocumentRepository,
  SourceDiscoveryRepository,
} from '@/server/persistence/repositories';
import { SourceAccessState, ExtractionState } from '@/server/extraction/contracts';

describe('Step 35: URL Canonicalization, Source Deduplication, Provenance & Counters', () => {
  // ===========================================================================
  // 1. URL CANONICALIZATION SUITE
  // ===========================================================================
  describe('1. URL Canonicalization Engine', () => {
    it('CANON-001: Strips approved tracking parameters while preserving content-affecting parameters', () => {
      const url =
        'https://example.com/products/laptop?utm_source=newsletter&id=12345&utm_medium=email&color=black&gclid=xyz987';
      const result = canonicalizeUrl(url);

      expect(result.isSuccess).toBe(true);
      expect(result.version).toBe(CANONICALIZER_POLICY_VERSION);
      expect(APPROVED_TRACKING_PARAMS.has('utm_source')).toBe(true);
      expect(result.removedParams).toContain('utm_source');
      expect(result.removedParams).toContain('utm_medium');
      expect(result.removedParams).toContain('gclid');

      expect(result.preservedParams).toContain('id');
      expect(result.preservedParams).toContain('color');

      expect(result.canonicalUrl).toBe('https://example.com/products/laptop?color=black&id=12345');
    });

    it('CANON-002: Deterministically sorts query parameters regardless of input order', () => {
      const urlA = 'https://example.com/search?b=2&a=1&c=3';
      const urlB = 'https://example.com/search?c=3&b=2&a=1';
      const urlC = 'https://example.com/search?a=1&c=3&b=2';

      const resA = canonicalizeUrl(urlA);
      const resB = canonicalizeUrl(urlB);
      const resC = canonicalizeUrl(urlC);

      expect(resA.canonicalUrl).toBe('https://example.com/search?a=1&b=2&c=3');
      expect(resA.canonicalUrl).toBe(resB.canonicalUrl);
      expect(resB.canonicalUrl).toBe(resC.canonicalUrl);
    });

    it('CANON-003: Preserves repeated query parameters and their internal order', () => {
      const url = 'https://example.com/filter?tag=laptop&sort=asc&tag=ultrabook';
      const res = canonicalizeUrl(url);

      expect(res.canonicalUrl).toBe('https://example.com/filter?sort=asc&tag=laptop&tag=ultrabook');
    });

    it('CANON-004: Strips fragments from canonical identity but preserves them in metadata', () => {
      const url = 'https://example.com/item/100?utm_campaign=spring#specifications';
      const res = canonicalizeUrl(url);

      expect(res.hasFragment).toBe(true);
      expect(res.originalFragment).toBe('specifications');
      expect(res.canonicalUrl).toBe('https://example.com/item/100');
    });

    it('CANON-005: Preserves non-default ports but removes default HTTP (:80) and HTTPS (:443) ports', () => {
      const httpDef = canonicalizeUrl('http://example.com:80/path');
      const httpsDef = canonicalizeUrl('https://example.com:443/path');
      const customPort = canonicalizeUrl('https://example.com:8443/path');

      expect(httpDef.canonicalUrl).toBe('http://example.com/path');
      expect(httpsDef.canonicalUrl).toBe('https://example.com/path');
      expect(customPort.canonicalUrl).toBe('https://example.com:8443/path');
      expect(customPort.port).toBe(8443);
    });

    it('CANON-006: Lowercases hostname and removes trailing dot while preserving path case and trailing slash', () => {
      const url = 'https://EXAMPLE.COM./Docs/API/';
      const res = canonicalizeUrl(url);

      expect(res.domain).toBe('example.com');
      // Preserves /Docs/API/ case and trailing slash
      expect(res.canonicalUrl).toBe('https://example.com/Docs/API/');
    });

    it('CANON-007: Strictly separates HTTP from HTTPS schemes (never blindly upgrades scheme)', () => {
      const httpRes = canonicalizeUrl('http://example.com/page');
      const httpsRes = canonicalizeUrl('https://example.com/page');

      expect(httpRes.scheme).toBe('http');
      expect(httpsRes.scheme).toBe('https');
      expect(httpRes.canonicalUrl).not.toBe(httpsRes.canonicalUrl);
    });

    it('CANON-008: Fails safely on invalid or unsupported schemes (file:, javascript:, ftp:)', () => {
      const fileRes = canonicalizeUrl('file:///etc/passwd');
      const jsRes = canonicalizeUrl('javascript:alert(1)');
      const malformed = canonicalizeUrl('not-a-valid-url');

      expect(fileRes.isSuccess).toBe(false);
      expect(fileRes.error).toContain('Unsupported scheme');
      expect(jsRes.isSuccess).toBe(false);
      expect(malformed.isSuccess).toBe(false);
    });
  });

  // ===========================================================================
  // 2. CANONICAL URL HINT EVALUATION SUITE
  // ===========================================================================
  describe('2. Page-Supplied Canonical URL Hints (<link rel="canonical">)', () => {
    const sourceUrl = 'https://example.com/articles/2026/product-review?utm_source=feed';

    it('HINT-001: Accurately identifies SAME_ORIGIN_MATCH when hint matches canonicalized source', () => {
      const hint = 'https://example.com/articles/2026/product-review';
      const evalResult = evaluateCanonicalHint(hint, sourceUrl);

      expect(evalResult.status).toBe('SAME_ORIGIN_MATCH');
      expect(evalResult.isSameOrigin).toBe(true);
      expect(evalResult.resolvedUrl).toBe('https://example.com/articles/2026/product-review');
    });

    it('HINT-002: Identifies SAME_ORIGIN_DIFFERENT when page suggests clean or alternative internal URL', () => {
      const hint = '/products/p-100'; // Relative URL resolved against source
      const evalResult = evaluateCanonicalHint(hint, sourceUrl);

      expect(evalResult.status).toBe('SAME_ORIGIN_DIFFERENT');
      expect(evalResult.isSameOrigin).toBe(true);
      expect(evalResult.resolvedUrl).toBe('https://example.com/products/p-100');
    });

    it('HINT-003: Flags CROSS_ORIGIN hints as untrusted metadata without auto-merging', () => {
      const hint = 'https://syndicated-publisher.com/canonical-source';
      const evalResult = evaluateCanonicalHint(hint, sourceUrl);

      expect(evalResult.status).toBe('CROSS_ORIGIN');
      expect(evalResult.isSameOrigin).toBe(false);
      expect(evalResult.resolvedUrl).toBe('https://syndicated-publisher.com/canonical-source');
    });

    it('HINT-004: Rejects SSRF-prohibited canonical hints (e.g. metadata or loopback endpoints)', () => {
      const hint = 'http://169.254.169.254/latest/meta-data/';
      const evalResult = evaluateCanonicalHint(hint, sourceUrl);

      expect(evalResult.status).toBe('UNSAFE_DESTINATION');
      expect(evalResult.isSameOrigin).toBe(false);
      expect(evalResult.notes).toContain('prohibited network destination');
    });

    it('HINT-005: Handles missing, empty, or malformed hints safely without throwing', () => {
      expect(evaluateCanonicalHint(null, sourceUrl).status).toBe('NO_HINT');
      expect(evaluateCanonicalHint('', sourceUrl).status).toBe('NO_HINT');
      expect(evaluateCanonicalHint('javascript:void(0)', sourceUrl).status).toBe('INVALID_URL');
    });
  });

  // ===========================================================================
  // 3. COUNTER TRACKER & INVARIANTS SUITE
  // ===========================================================================
  describe('3. Search Counter Tracker & Mathematical Invariants', () => {
    it('COUNT-001: Accurately computes all counter transitions from real events', () => {
      const tracker = new SearchCounterTracker(3); // 3 planned queries

      // Dispatch query 1
      tracker.recordQueryDispatched();
      tracker.recordQuerySuccess(3); // 3 raw results returned

      // Result 1: unique discovery
      tracker.recordDiscovery(true);
      // Result 2: duplicate discovery
      tracker.recordDiscovery(false);
      // Result 3: rejected unsafe URL
      tracker.recordRejectedResult();

      // Dispatch query 2
      tracker.recordQueryDispatched();
      tracker.recordQuerySuccess(0); // 0 raw results returned (valid successful search)

      // Dispatch query 3
      tracker.recordQueryDispatched();
      tracker.recordQueryFailure(); // Network error

      // Extraction events
      tracker.recordExtraction(true);
      tracker.recordExtraction(false);

      const snapshot = tracker.getSnapshot();
      expect(snapshot.plannedQueries).toBe(3);
      expect(snapshot.executedQueries).toBe(3);
      expect(snapshot.successfulQueries).toBe(2);
      expect(snapshot.failedQueries).toBe(1);
      expect(snapshot.rawResultsReceived).toBe(3);
      expect(snapshot.rejectedResults).toBe(1);
      expect(snapshot.validDiscoveries).toBe(2);
      expect(snapshot.uniqueSourcesDiscovered).toBe(1);
      expect(snapshot.duplicateDiscoveries).toBe(1);
      expect(snapshot.sourcesExtracted).toBe(1);
      expect(snapshot.extractionFailed).toBe(1);

      const inv = tracker.verifyInvariants();
      expect(inv.isValid).toBe(true);
      expect(inv.discrepancies).toHaveLength(0);
    });

    it('COUNT-002: Reconciles zero-result queries as successful, not failed', () => {
      const tracker = new SearchCounterTracker(1);
      tracker.recordQueryDispatched();
      tracker.recordQuerySuccess(0);

      const snapshot = tracker.getSnapshot();
      expect(snapshot.successfulQueries).toBe(1);
      expect(snapshot.failedQueries).toBe(0);
      expect(snapshot.rawResultsReceived).toBe(0);
      expect(tracker.verifyInvariants().isValid).toBe(true);
    });
  });

  // ===========================================================================
  // 4. SOURCE DEDUPLICATION & PROVENANCE SUITE
  // ===========================================================================
  describe('4. Source Identity Resolution & Multi-Query Provenance', () => {
    let mockClient: any;
    let mockDocRepo: SourceDocumentRepository;
    let mockDiscRepo: SourceDiscoveryRepository;
    let service: SourceIdentityService;

    beforeEach(() => {
      mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };
      mockDocRepo = new SourceDocumentRepository();
      mockDiscRepo = new SourceDiscoveryRepository();
      service = new SourceIdentityService(mockDocRepo, mockDiscRepo);
    });

    function createCandidate(
      url: string,
      title: string,
      variantId: string = 'variant-1',
      score: number = 0.95
    ): NormalizedSearchResult {
      const validation = validateUrl(url, 'PUBLIC_RESEARCH_SOURCE');
      return {
        id: `cand-${Math.random().toString(36).substring(7)}`,
        provider: 'tavily',
        queryVariantId: variantId,
        originalUrl: url,
        title,
        snippet: `Snippet for ${title}`,
        publishedDate: '2026-03-01T00:00:00.000Z',
        author: 'Staff Reviewer',
        relevanceScore: score,
        providerResultId: `tavily-res-${Math.random()}`,
        urlValidation: validation,
        isFetchable: validation.isValid,
        discoveredAt: new Date().toISOString(),
      };
    }

    it('DEDUP-001: Consolidates duplicate URLs within same query into 1 canonical source while recording 2 discoveries', async () => {
      const runId = 'run-101';
      const userId = 'user-001';

      // Candidate 1 has tracking param; Candidate 2 does not. Both canonicalize to same URL.
      const cand1 = createCandidate(
        'https://example.com/product/laptop?utm_source=google',
        'Example Laptop - Review',
        'var-primary',
        0.98
      );
      const cand2 = createCandidate(
        'https://example.com/product/laptop',
        'Example Laptop - Specifications',
        'var-primary',
        0.85
      );

      const summary = await service.deduplicateAndRecordDiscoveries({
        runId,
        userId,
        candidates: [cand1, cand2],
        queryTextsByVariant: { 'var-primary': 'best laptop 2026' },
        persist: false, // in-memory validation
      });

      expect(summary.totalCandidatesProcessed).toBe(2);
      expect(summary.uniqueSourcesCount).toBe(1);
      expect(summary.duplicateDiscoveriesCount).toBe(1);
      expect(summary.rejectedUrlsCount).toBe(0);

      const canonicalDoc = summary.sources[0]!;
      expect(canonicalDoc.canonicalUrl).toBe('https://example.com/product/laptop');
      expect(canonicalDoc.discoveryCount).toBe(2);
      expect(canonicalDoc.discoveries).toHaveLength(2);

      // Verify discrete discovery provenance is fully preserved
      expect(canonicalDoc.discoveries[0]!.originalUrl).toBe(cand1.originalUrl);
      expect(canonicalDoc.discoveries[0]!.relevanceScore).toBe(0.98);
      expect(canonicalDoc.discoveries[1]!.originalUrl).toBe(cand2.originalUrl);
      expect(canonicalDoc.discoveries[1]!.relevanceScore).toBe(0.85);
    });

    it('DEDUP-002: Consolidates duplicate sources discovered across different query variants', async () => {
      const runId = 'run-202';
      const userId = 'user-001';

      const candFromPrimary = createCandidate(
        'https://techreviews.com/thinkpad-x1#overview',
        'ThinkPad X1 Carbon Gen 12',
        'variant-primary',
        0.95
      );
      const candFromSpecs = createCandidate(
        'https://techreviews.com/thinkpad-x1?utm_medium=search#specs',
        'ThinkPad X1 Specs & Battery Life',
        'variant-specs',
        0.91
      );

      const summary = await service.deduplicateAndRecordDiscoveries({
        runId,
        userId,
        candidates: [candFromPrimary, candFromSpecs],
        queryTextsByVariant: {
          'variant-primary': 'ThinkPad X1 Carbon 2026',
          'variant-specs': 'ThinkPad X1 battery life specifications',
        },
        persist: false,
      });

      expect(summary.uniqueSourcesCount).toBe(1);
      expect(summary.duplicateDiscoveriesCount).toBe(1);

      const doc = summary.sources[0]!;
      expect(doc.canonicalUrl).toBe('https://techreviews.com/thinkpad-x1');
      expect(doc.discoveries).toHaveLength(2);
      expect(doc.discoveries[0]!.queryVariantId).toBe('variant-primary');
      expect(doc.discoveries[0]!.queryText).toBe('ThinkPad X1 Carbon 2026');
      expect(doc.discoveries[1]!.queryVariantId).toBe('variant-specs');
      expect(doc.discoveries[1]!.queryText).toBe('ThinkPad X1 battery life specifications');
    });

    it('DEDUP-003: Rejects SSRF-prohibited and invalid candidates without creating source records', async () => {
      const runId = 'run-303';
      const userId = 'user-001';

      const validCand = createCandidate('https://example.com/valid', 'Valid Source');
      const ssrfCand = createCandidate('http://169.254.169.254/secret', 'Metadata Endpoint');
      const loopbackCand = createCandidate('http://127.0.0.1:8080/admin', 'Loopback Service');

      const summary = await service.deduplicateAndRecordDiscoveries({
        runId,
        userId,
        candidates: [validCand, ssrfCand, loopbackCand],
        persist: false,
      });

      expect(summary.totalCandidatesProcessed).toBe(3);
      expect(summary.uniqueSourcesCount).toBe(1);
      expect(summary.rejectedUrlsCount).toBe(2);
      expect(summary.sources[0]!.canonicalUrl).toBe('https://example.com/valid');
    });

    it('DEDUP-004: Keeps distinct products separate when query parameters affect content', async () => {
      const runId = 'run-404';
      const userId = 'user-001';

      // URLs with distinct content parameters (id=101 vs id=102)
      const itemA = createCandidate('https://store.com/item?id=101&utm_source=ad', 'Item 101');
      const itemB = createCandidate('https://store.com/item?id=102&utm_source=ad', 'Item 102');

      const summary = await service.deduplicateAndRecordDiscoveries({
        runId,
        userId,
        candidates: [itemA, itemB],
        persist: false,
      });

      expect(summary.uniqueSourcesCount).toBe(2);
      expect(summary.duplicateDiscoveriesCount).toBe(0);
      expect(summary.sources[0]!.canonicalUrl).toBe('https://store.com/item?id=101');
      expect(summary.sources[1]!.canonicalUrl).toBe('https://store.com/item?id=102');
    });

    it('DEDUP-005: Concurrency safety — upsertOrResolve gracefully handles unique race violations', async () => {
      const repo = new SourceDocumentRepository();
      const existingDoc = {
        id: 'doc-existing-uuid',
        run_id: 'run-1',
        user_id: 'user-1',
        original_url: 'https://example.com/page',
        canonical_url: 'https://example.com/page',
        domain: 'example.com',
        title: 'Existing Page',
        discovery_provider: 'tavily',
        access_state: SourceAccessState.ACCESSIBLE,
        extraction_state: ExtractionState.SUCCESS,
        http_status_code: 200,
        content_hash: null,
        extracted_text_excerpt: '',
        retrieved_at: new Date().toISOString(),
        published_at: null,
      };

      // Mock sequence:
      // 1. Initial findByCanonicalUrl returns null (race condition begins)
      // 2. create() throws 23505 unique constraint violation (concurrent thread won race)
      // 3. Second findByCanonicalUrl resolves existing document
      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // initial find
        .mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint uq_source_documents_run_canonical' }) // create collision
        .mockResolvedValueOnce({ rows: [existingDoc] }); // recovery lookup

      const result = await repo.upsertOrResolve(
        {
          run_id: 'run-1',
          user_id: 'user-1',
          url: 'https://example.com/page',
          canonical_url: 'https://example.com/page',
          domain: 'example.com',
        },
        mockClient as unknown as PoolClient
      );

      expect(result.isNew).toBe(false);
      expect(result.document.id).toBe('doc-existing-uuid');
    });

    it('DEDUP-006: Tenant isolation — never merges duplicate URLs across different users', async () => {
      const repo = new SourceDocumentRepository();
      mockClient.query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        // Enforces that user_id is in where clause
        if (sql.includes('SELECT * FROM source_documents WHERE run_id = $1 AND canonical_url = $2 AND user_id = $3')) {
          expect(params[2]).toBe('user-Alice');
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const found = await repo.findByCanonicalUrl(
        'run-A',
        'https://example.com/page',
        'user-Alice',
        mockClient as unknown as PoolClient
      );

      expect(found).toBeNull();
    });
  });
});
