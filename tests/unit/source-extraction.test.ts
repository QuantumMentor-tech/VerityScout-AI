import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseHtmlContent,
  DirectSafeFetchExtractor,
  FirecrawlExtractionAdapter,
  MockExtractionAdapter,
  ExtractionProviderRegistry,
  SourceExtractionService,
  SourceAccessState,
  ExtractionState,
  type ExtractionRequest,
} from '@/server/extraction';
import type { NormalizedSearchResult } from '@/server/search';
import * as securityModule from '@/server/security';

describe('Step 34: Source Extraction Adapter, Safe Content Retrieval & Content Normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. HTML Parsing & Main-Content Normalization (html-parser.ts)', () => {
    it('extracts main article content and strips navigation, footer, scripts, and cookie banners', () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>GeForce RTX 4070 Super In-Depth Review</title>
          <meta property="og:title" content="GeForce RTX 4070 Super In-Depth Review" />
          <meta name="author" content="Tech Lab Specialist" />
          <meta property="og:site_name" content="Hardware Authority" />
          <meta property="article:published_time" content="2024-01-16T14:00:00Z" />
          <style>body { font-family: sans-serif; }</style>
          <script>window.__EVIL_SCRIPT__ = true;</script>
        </head>
        <body>
          <header>
            <nav role="navigation">
              <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/gpus">GPUs</a></li>
              </ul>
            </nav>
          </header>
          <div class="cookie-banner">
            <p>We use cookies. Click accept.</p>
            <button>Accept</button>
          </div>
          <main>
            <article>
              <h1>NVIDIA GeForce RTX 4070 Super Review</h1>
              <p>The RTX 4070 Super is a mid-generation refresh featuring 7168 CUDA cores and 12GB of GDDR6X memory.</p>
              <h2>Gaming Benchmarks at 1440p</h2>
              <p>In Cyberpunk 2077 with Ray Tracing enabled, the card achieves an average of 72 FPS.</p>
              <ul>
                <li>Power Consumption: 220W TGP</li>
                <li>DisplayPort: 3x DisplayPort 1.4a</li>
                <li>MSRP: $599 USD</li>
              </ul>
              <blockquote>Recommended for 1440p high-refresh-rate gaming.</blockquote>
            </article>
          </main>
          <div class="ad advertisement">
            <p>Buy gaming chairs now!</p>
          </div>
          <footer>
            <p>&copy; 2024 Hardware Authority. All rights reserved.</p>
          </footer>
        </body>
        </html>
      `;

      const result = parseHtmlContent(html, 'https://example-tech.com/review/rtx-4070-super');

      expect(result.title).toBe('GeForce RTX 4070 Super In-Depth Review');
      expect(result.author).toBe('Tech Lab Specialist');
      expect(result.publisher).toBe('Hardware Authority');
      expect(result.publishedDate).toBe('2024-01-16T14:00:00.000Z');
      expect(result.language).toBe('en');
      expect(result.isBotChallenge).toBe(false);
      expect(result.isEmpty).toBe(false);

      // Boilerplate must be stripped
      expect(result.markdownContent).not.toContain('We use cookies');
      expect(result.markdownContent).not.toContain('Home');
      expect(result.markdownContent).not.toContain('Buy gaming chairs');
      expect(result.markdownContent).not.toContain('All rights reserved');
      expect(result.markdownContent).not.toContain('window.__EVIL_SCRIPT__');

      // Substantive content formatted as markdown
      expect(result.markdownContent).toContain('# NVIDIA GeForce RTX 4070 Super Review');
      expect(result.markdownContent).toContain('## Gaming Benchmarks at 1440p');
      expect(result.markdownContent).toContain('7168 CUDA cores');
      expect(result.markdownContent).toContain('- Power Consumption: 220W TGP');
      expect(result.markdownContent).toContain('> Recommended for 1440p high-refresh-rate gaming.');

      // Check content hash and text excerpt
      expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.textExcerpt).toContain('RTX 4070 Super');
    });

    it('formats HTML tables into clean Markdown tables', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <main>
            <h1>GPU Comparison</h1>
            <table>
              <tr>
                <th>Model</th>
                <th>VRAM</th>
                <th>Price</th>
              </tr>
              <tr>
                <td>RTX 4070</td>
                <td>12GB</td>
                <td>$549</td>
              </tr>
              <tr>
                <td>RTX 4070 Super</td>
                <td>12GB</td>
                <td>$599</td>
              </tr>
            </table>
          </main>
        </body>
        </html>
      `;

      const result = parseHtmlContent(html, 'https://example.com/gpu-table');
      expect(result.markdownContent).toContain('| Model | VRAM | Price |');
      expect(result.markdownContent).toContain('| --- | --- | --- |');
      expect(result.markdownContent).toContain('| RTX 4070 Super | 12GB | $599 |');
    });

    it('detects Cloudflare and bot challenge blocking signatures truthfully', () => {
      const challengeHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Attention Required! | Cloudflare</title></head>
        <body>
          <h1>Please enable JavaScript and cookies to continue</h1>
          <p>Checking your browser before accessing the website. Just a moment...</p>
          <div id="cf-browser-verification"></div>
        </body>
        </html>
      `;

      const result = parseHtmlContent(challengeHtml, 'https://protected-retailer.com/item/1');
      expect(result.isBotChallenge).toBe(true);
      expect(result.title).toContain('Bot Challenge');
      expect(result.textExcerpt).toContain('bot challenge');
      expect(result.markdownContent).toBe('');
    });

    it('handles empty bodies honestly without fabricating content', () => {
      const result = parseHtmlContent('   ', 'https://empty-page.com');
      expect(result.isEmpty).toBe(true);
      expect(result.markdownContent).toBe('');
      expect(result.contentHash).toBeNull();
      expect(result.textExcerpt).toBeNull();
    });

    it('preserves null metadata when page lacks author or published date', () => {
      const html = `
        <html>
        <head><title>Simple Page Without Metadata</title></head>
        <body><main><p>Content without author.</p></main></body>
        </html>
      `;

      const result = parseHtmlContent(html, 'https://simple.com');
      expect(result.title).toBe('Simple Page Without Metadata');
      expect(result.author).toBeNull();
      expect(result.publishedDate).toBeNull();
      expect(result.publisher).toBeNull();
    });
  });

  describe('2. Script Execution & Remote Resource Invariants', () => {
    it('strictly prevents executing embedded page scripts during extraction', () => {
      // Injected malicious script attempting to set a global variable
      const maliciousHtml = `
        <html>
        <head>
          <script>
            (globalThis as any).__MALICIOUS_XSS_TRIGGERED__ = true;
          </script>
        </head>
        <body onload="globalThis.__ONLOAD_TRIGGERED__ = true">
          <main>
            <p>Normal text</p>
            <img src="http://127.0.0.1:9999/probe" onerror="globalThis.__ONERROR_TRIGGERED__ = true" />
          </main>
        </body>
        </html>
      `;

      const result = parseHtmlContent(maliciousHtml, 'https://untrusted-site.com');

      expect((globalThis as Record<string, unknown>).__MALICIOUS_XSS_TRIGGERED__).toBeUndefined();
      expect((globalThis as Record<string, unknown>).__ONLOAD_TRIGGERED__).toBeUndefined();
      expect((globalThis as Record<string, unknown>).__ONERROR_TRIGGERED__).toBeUndefined();

      expect(result.markdownContent).toContain('Normal text');
      expect(result.markdownContent).not.toContain('<script>');
      expect(result.markdownContent).not.toContain('<img');
    });
  });

  describe('3. Tier 1 Direct Safe-Fetch Extractor (Step 32 Safe Transport Integration)', () => {
    const extractor = new DirectSafeFetchExtractor();

    it('rejects loopback and private destinations via Step 32 SSRF controls before connecting', async () => {
      const req: ExtractionRequest = {
        url: 'http://127.0.0.1:80/admin/secrets',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: false,
        requestId: 'req-ssrf-1',
      };

      const doc = await extractor.extract(req);

      expect(doc.accessState).toBe(SourceAccessState.SSRF_PROHIBITED);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
      expect(doc.httpStatusCode).toBe(0);
      expect(doc.warnings[0]).toContain('SSRF security boundary');
    });

    it('rejects cloud metadata IP (169.254.169.254) before connecting', async () => {
      const req: ExtractionRequest = {
        url: 'http://169.254.169.254/latest/meta-data/',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: false,
        requestId: 'req-ssrf-2',
      };

      const doc = await extractor.extract(req);

      expect(doc.accessState).toBe(SourceAccessState.SSRF_PROHIBITED);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
    });

    it('successfully extracts public HTML document using safeFetch', async () => {
      vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://public-retailer.com/gpu/rtx-4070-super',
        headers: { 'content-type': 'text/html; charset=utf-8' },
        redirectChain: [],
        text: async () => `
          <html>
            <head><title>GeForce RTX 4070 Super 12GB New</title></head>
            <body>
              <main>
                <h1>RTX 4070 Super 12GB</h1>
                <p>Price: $599.99 in stock.</p>
              </main>
            </body>
          </html>
        `,
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({} as unknown as T),
      });

      const req: ExtractionRequest = {
        url: 'https://public-retailer.com/gpu/rtx-4070-super',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: false,
        requestId: 'req-success-1',
      };

      const doc = await extractor.extract(req);

      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.SUCCESS);
      expect(doc.title).toBe('GeForce RTX 4070 Super 12GB New');
      expect(doc.markdownContent).toContain('Price: $599.99 in stock.');
      expect(doc.contentHash).toBeDefined();
    });

    it('handles HTTP 403 bot challenge access restrictions truthfully', async () => {
      vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        url: 'https://protected.com/item',
        headers: { 'content-type': 'text/html' },
        redirectChain: [],
        text: async () => '<html><title>Just a moment...</title><body>Cloudflare challenge</body></html>',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({} as unknown as T),
      });

      const req: ExtractionRequest = {
        url: 'https://protected.com/item',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: false,
        requestId: 'req-block-1',
      };

      const doc = await extractor.extract(req);

      expect(doc.accessState).toBe(SourceAccessState.BLOCKED_BOT_CHALLENGE);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
      expect(doc.httpStatusCode).toBe(403);
    });

    it('flags unsupported binary content types like image/png without running HTML parser', async () => {
      vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://example.com/image.png',
        headers: { 'content-type': 'image/png' },
        redirectChain: [],
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({} as unknown as T),
      });

      const req: ExtractionRequest = {
        url: 'https://example.com/image.png',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: false,
        requestId: 'req-img-1',
      };

      const doc = await extractor.extract(req);

      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.UNSUPPORTED_CONTENT);
      expect(doc.warnings[0]).toContain('Unsupported document Content-Type');
    });
  });

  describe('4. Tier 2 Managed Cloud Extractor (Firecrawl Adapter)', () => {
    const adapter = new FirecrawlExtractionAdapter();

    it('rejects execution when Firecrawl API key is missing', async () => {
      const req: ExtractionRequest = {
        url: 'https://example.com/page',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: true,
        requestId: 'req-fc-1',
      };

      await expect(adapter.extract(req, '')).rejects.toThrow(/Firecrawl API key is missing/);
    });

    it('maps request to official POST https://api.firecrawl.dev/v1/scrape with Authorization header', async () => {
      const mockSafeFetch = vi.spyOn(securityModule, 'safeFetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.firecrawl.dev/v1/scrape',
        headers: {},
        redirectChain: [],
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async <T>() => ({
          success: true,
          data: {
            markdown: '# Dynamic React SPA Product Page\n\nPrice: $589.99',
            metadata: {
              title: 'Dynamic React Product',
              language: 'en',
              sourceURL: 'https://spa-retailer.com/item/1',
              statusCode: 200,
            },
          },
        } as unknown as T),
      });

      const req: ExtractionRequest = {
        url: 'https://spa-retailer.com/item/1',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: true,
        requestId: 'req-fc-2',
      };

      const doc = await adapter.extract(req, 'fc-synthetic-test-key-12345');

      expect(mockSafeFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockSafeFetch.mock.calls[0]!;

      expect(url).toBe('https://api.firecrawl.dev/v1/scrape');
      expect(init?.headers?.Authorization).toBe('Bearer fc-synthetic-test-key-12345');

      const body = JSON.parse(init?.body as string);
      expect(body.url).toBe('https://spa-retailer.com/item/1');
      expect(body.formats).toEqual(['markdown']);
      expect(body.onlyMainContent).toBe(true);

      expect(doc.provider).toBe('firecrawl');
      expect(doc.title).toBe('Dynamic React Product');
      expect(doc.markdownContent).toContain('Price: $589.99');
      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.SUCCESS);
    });
  });

  describe('5. Bounded Batch Extraction & Two-Tier Strategy', () => {
    it('enforces maximum 10 URLs ceiling per extraction batch (SEC-035)', async () => {
      const mockExtractor = new MockExtractionAdapter();
      const extractSpy = vi.spyOn(mockExtractor, 'extract');

      const registry = ExtractionProviderRegistry.getInstance();
      registry.registerAdapter('mock_extract', mockExtractor);

      const service = new SourceExtractionService();

      // Submit 15 URLs
      const requests: ExtractionRequest[] = Array.from({ length: 15 }, (_, i) => ({
        url: `https://example.com/page-${i + 1}`,
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: false,
        requestId: `req-${i + 1}`,
      }));

      const summary = await service.extractBatch('user-123', requests, {
        providerId: 'mock_extract',
        maxUrls: 20, // Caller attempts to exceed limit
      });

      // Must be capped at 10
      expect(summary.totalRequested).toBe(10);
      expect(summary.documents).toHaveLength(10);
      expect(extractSpy).toHaveBeenCalledTimes(10);
    });

    it('rejects candidate URLs flagged unsafe by Step 33 urlValidation without initiating network calls', async () => {
      const mockExtractor = new MockExtractionAdapter();
      const extractSpy = vi.spyOn(mockExtractor, 'extract');

      const registry = ExtractionProviderRegistry.getInstance();
      registry.registerAdapter('mock_extract', mockExtractor);

      const service = new SourceExtractionService();

      const candidateList: NormalizedSearchResult[] = [
        {
          id: 'cand-valid',
          provider: 'tavily',
          queryVariantId: 'q-1',
          originalUrl: 'https://valid-public.com/gpu',
          title: 'Valid GPU',
          snippet: 'Excerpt',
          publishedDate: '2024-01-01',
          author: null,
          relevanceScore: 0.9,
          providerResultId: '1',
          urlValidation: {
            isValid: true,
            canonicalUrl: 'https://valid-public.com/gpu',
            hostname: 'valid-public.com',
            protocol: 'https:',
            port: 443,
            isIpLiteral: false,
            parsedUrl: new URL('https://valid-public.com/gpu'),
          },
          isFetchable: true,
          discoveredAt: new Date().toISOString(),
        },
        {
          id: 'cand-loopback',
          provider: 'tavily',
          queryVariantId: 'q-1',
          originalUrl: 'http://127.0.0.1/admin',
          title: 'Loopback Exploit',
          snippet: 'Internal',
          publishedDate: null,
          author: null,
          relevanceScore: 0.8,
          providerResultId: '2',
          urlValidation: {
            isValid: false,
            code: 'PROHIBITED_IP_DESTINATION',
            error: 'Loopback IP prohibited',
          },
          isFetchable: false,
          discoveredAt: new Date().toISOString(),
        },
      ];

      const summary = await service.extractBatch('user-123', candidateList, {
        providerId: 'mock_extract',
      });

      expect(summary.totalRequested).toBe(2);
      expect(summary.totalSuccessful).toBe(1);
      expect(summary.totalFailed).toBe(1);

      // Only the valid candidate should trigger the extractor
      expect(extractSpy).toHaveBeenCalledTimes(1);

      const unsafeDoc = summary.documents.find((d) => d.requestedUrl.includes('127.0.0.1'));
      expect(unsafeDoc?.accessState).toBe(SourceAccessState.SSRF_PROHIBITED);
      expect(unsafeDoc?.extractionState).toBe(ExtractionState.SKIPPED);
    });

    it('executes Two-Tier fallback to Firecrawl when Tier 1 encounters bot challenge and fallback is authorized', async () => {
      // Mock Tier 1 returning BLOCKED_BOT_CHALLENGE
      const tier1Mock = new MockExtractionAdapter({
        accessState: SourceAccessState.BLOCKED_BOT_CHALLENGE,
        extractionState: ExtractionState.SKIPPED,
        httpStatusCode: 403,
      });

      // Mock Tier 2 returning SUCCESS
      const tier2Mock = new MockExtractionAdapter({
        accessState: SourceAccessState.ACCESSIBLE,
        extractionState: ExtractionState.SUCCESS,
        markdownContent: '# Recovered by Tier 2 Headless Cloud Scraper\n\nPrice: $599.99',
        httpStatusCode: 200,
      });

      const registry = ExtractionProviderRegistry.getInstance();
      registry.registerAdapter('direct_safe_fetch', tier1Mock);
      registry.registerAdapter('firecrawl', tier2Mock);

      const service = new SourceExtractionService();

      const req: ExtractionRequest = {
        url: 'https://protected-ecom.com/product/123',
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 15000,
        requireJsRendering: false,
        requestId: 'req-fallback-1',
      };

      const doc = await service.extractSource('user-123', req, {
        providerId: 'direct_safe_fetch',
        allowTier2Fallback: true,
        explicitApiKey: 'fc-synthetic-key',
      });

      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.SUCCESS);
      expect(doc.markdownContent).toContain('Recovered by Tier 2');
      expect(doc.warnings[0]).toContain('Tier 1 direct fetch encountered bot challenge');
    });
  });
});

