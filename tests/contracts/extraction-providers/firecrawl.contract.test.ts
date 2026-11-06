import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FirecrawlExtractionAdapter } from '@/server/extraction/adapters/firecrawl/firecrawl-extraction-adapter';
import {
  ExtractionError,
  ExtractionRequest,
  SourceAccessState,
  ExtractionState,
} from '@/server/extraction/contracts';
import * as securityModule from '@/server/security';
import { FIRECRAWL_MOCK_SUCCESS_RESPONSE } from '../fixtures/mock-responses';

function createExtractionRequest(url: string, overrides?: Partial<ExtractionRequest>): ExtractionRequest {
  return {
    url,
    maxBodyBytes: 5 * 1024 * 1024,
    timeoutMs: 15000,
    requireJsRendering: false,
    requestId: 'req-extract-firecrawl-1',
    ...overrides,
  };
}

describe('Firecrawl Extraction Provider Contract Tests (Step 51 / Step 34)', () => {
  let adapter: FirecrawlExtractionAdapter;
  let safeFetchSpy: ReturnType<typeof vi.spyOn>;

  const validRequest = createExtractionRequest('https://frame.work/products/laptop-13-gen-intel');

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = new FirecrawlExtractionAdapter();
    safeFetchSpy = vi.spyOn(securityModule, 'safeFetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Construction Contract', () => {
    it('constructs valid POST request with TRUSTED_PROVIDER policy and bearer auth', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(FIRECRAWL_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const doc = await adapter.extract(validRequest, 'fc-mock-test-key-456');

      expect(safeFetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = safeFetchSpy.mock.calls[0] as [string, any];

      expect(calledUrl).toBe('https://api.firecrawl.dev/v1/scrape');
      expect(calledOptions.policy).toBe('TRUSTED_PROVIDER');
      expect(calledOptions.method).toBe('POST');
      expect(calledOptions.headers['Authorization']).toBe('Bearer fc-mock-test-key-456');
      expect(calledOptions.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(calledOptions.body);
      expect(body.url).toBe('https://frame.work/products/laptop-13-gen-intel');
      expect(body.formats).toEqual(['markdown']);
      expect(body.onlyMainContent).toBe(true);

      expect(doc.provider).toBe('firecrawl');
      expect(doc.markdownContent).toContain('Framework Laptop 13');
    });

    it('rejects execution when API key is missing or empty', async () => {
      await expect(adapter.extract(validRequest, '')).rejects.toThrow(ExtractionError);
      await expect(adapter.extract(validRequest, undefined)).rejects.toThrow(
        /Firecrawl API key is missing/
      );
      expect(safeFetchSpy).not.toHaveBeenCalled();
    });

    it('intercepts SSRF-prohibited target URLs before calling upstream Firecrawl', async () => {
      const privateRequest = createExtractionRequest('http://169.254.169.254/latest/meta-data/');

      const result = await adapter.extract(privateRequest, 'fc-test-key');

      expect(safeFetchSpy).not.toHaveBeenCalled();
      expect(result.accessState).toBe(SourceAccessState.SSRF_PROHIBITED);
      expect(result.extractionState).toBe(ExtractionState.SKIPPED);
      expect(result.warnings[0]).toContain('SSRF security boundary');
    });
  });

  describe('Response Mapping Contract', () => {
    it('maps successful Firecrawl scrape into ExtractedDocument schema', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(FIRECRAWL_MOCK_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const doc = await adapter.extract(validRequest, 'fc-mock-test-key-456');

      expect(doc.id).toBeDefined();
      expect(doc.provider).toBe('firecrawl');
      expect(doc.domain).toBe('frame.work');
      expect(doc.title).toBe('Framework | Laptop 13 (Intel 13th Gen)');
      expect(doc.markdownContent).toContain('Modular, upgradeable laptop');
      expect(doc.contentHash).toBeDefined();
      expect(typeof doc.contentHash).toBe('string');
      expect(doc.contentHash?.length).toBe(64);
      expect(doc.textExcerpt).toContain('Framework Laptop 13');
      expect(doc.httpStatusCode).toBe(200);
      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.SUCCESS);
      expect(doc.usage.bytesReceived).toBeGreaterThan(0);
    });

    it('maps anti-bot challenge response (reported statusCode 403) to BLOCKED_BOT_CHALLENGE', async () => {
      const blockedResponse = {
        success: false,
        data: {
          markdown: '',
          metadata: {
            title: 'Cloudflare Verification',
            statusCode: 403,
          },
        },
        error: 'Target URL returned 403 Forbidden',
      };

      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(blockedResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const doc = await adapter.extract(validRequest, 'fc-mock-test-key-456');

      expect(doc.accessState).toBe(SourceAccessState.BLOCKED_BOT_CHALLENGE);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
      expect(doc.httpStatusCode).toBe(403);
    });

    it('maps empty markdown scrape to EMPTY_BODY state', async () => {
      const emptyDocResponse = {
        success: true,
        data: {
          markdown: '   ',
          metadata: {
            title: 'Empty Page',
            statusCode: 200,
          },
        },
      };

      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(emptyDocResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const doc = await adapter.extract(validRequest, 'fc-mock-test-key-456');

      expect(doc.extractionState).toBe(ExtractionState.EMPTY_BODY);
      expect(doc.contentHash).toBeNull();
      expect(doc.textExcerpt).toBeNull();
    });
  });

  describe('Error Translation Contract', () => {
    it('throws AUTHENTICATION_REQUIRED on 401 Unauthorized from Firecrawl service', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized: invalid API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(adapter.extract(validRequest, 'bad-key')).rejects.toThrow(
        /Firecrawl API key is invalid, inactive, or unauthorized/
      );
    });

    it('returns SourceAccessState.HTTP_ERROR when Firecrawl service returns 500 error', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        new Response('Internal Server Error in Firecrawl worker', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        })
      );

      const doc = await adapter.extract(validRequest, 'fc-key');

      expect(doc.accessState).toBe(SourceAccessState.HTTP_ERROR);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
      expect(doc.httpStatusCode).toBe(500);
      expect(doc.warnings[0]).toContain('Firecrawl scrape service returned HTTP 500');
    });

    it('handles network timeout via SafeHttpError TIMEOUT', async () => {
      safeFetchSpy.mockRejectedValueOnce(
        new securityModule.SafeHttpError('TIMEOUT', 'Connection timed out')
      );

      const doc = await adapter.extract(validRequest, 'fc-key');

      expect(doc.accessState).toBe(SourceAccessState.TIMEOUT);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
      expect(doc.warnings[0]).toContain('timed out');
    });

    it('propagates cancellation via SafeHttpError CANCELLED', async () => {
      safeFetchSpy.mockRejectedValueOnce(
        new securityModule.SafeHttpError('CANCELLED', 'Request aborted')
      );

      await expect(adapter.extract(validRequest, 'fc-key')).rejects.toThrow(
        /cancelled by caller/
      );
    });
  });
});
