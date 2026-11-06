import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectSafeFetchExtractor } from '@/server/extraction/adapters/direct/direct-safe-fetch-extractor';
import {
  ExtractionError,
  ExtractionRequest,
  SourceAccessState,
  ExtractionState,
} from '@/server/extraction/contracts';
import * as securityModule from '@/server/security';
import type { SafeFetchResponse } from '@/server/security';

function createExtractionRequest(url: string, overrides?: Partial<ExtractionRequest>): ExtractionRequest {
  return {
    url,
    maxBodyBytes: 5 * 1024 * 1024,
    timeoutMs: 15000,
    requireJsRendering: false,
    requestId: 'req-extract-direct-1',
    ...overrides,
  };
}

function createMockSafeResponse(
  body: string,
  options?: {
    status?: number;
    contentType?: string;
    url?: string;
  }
): SafeFetchResponse {
  const status = options?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    url: options?.url ?? 'https://www.sony.com/electronics/headband-headphones/wh-1000xm5',
    headers: {
      'content-type': options?.contentType ?? 'text/html; charset=utf-8',
    },
    redirectChain: [],
    text: async () => body,
    json: async () => JSON.parse(body),
    arrayBuffer: async () => Buffer.from(body).buffer,
  };
}

describe('Direct Safe-Fetch Extraction Provider Contract Tests (Step 51 / Step 34)', () => {
  let extractor: DirectSafeFetchExtractor;
  let safeFetchSpy: ReturnType<typeof vi.spyOn>;

  const validHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Sony WH-1000XM5 Noise Cancelling Headphones</title>
        <meta name="description" content="Industry leading wireless noise cancellation headphones.">
      </head>
      <body>
        <main>
          <h1>Sony WH-1000XM5</h1>
          <p>The Sony WH-1000XM5 wireless headphones feature up to 30 hours of battery life with noise canceling on.</p>
          <p>Priced at $399.99 MSRP.</p>
        </main>
      </body>
    </html>
  `;

  beforeEach(() => {
    vi.restoreAllMocks();
    extractor = new DirectSafeFetchExtractor();
    safeFetchSpy = vi.spyOn(securityModule, 'safeFetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Construction and Security Boundary Contract', () => {
    it('executes safeFetch with PUBLIC_RESEARCH_SOURCE policy and correct headers', async () => {
      safeFetchSpy.mockResolvedValueOnce(createMockSafeResponse(validHtml));

      const request = createExtractionRequest(
        'https://www.sony.com/electronics/headband-headphones/wh-1000xm5',
        { maxBodyBytes: 1048576, timeoutMs: 10000 }
      );

      const doc = await extractor.extract(request);

      expect(safeFetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = safeFetchSpy.mock.calls[0] as [string, any];

      expect(calledUrl).toBe('https://www.sony.com/electronics/headband-headphones/wh-1000xm5');
      expect(calledOptions.policy).toBe('PUBLIC_RESEARCH_SOURCE');
      expect(calledOptions.method).toBe('GET');
      expect(calledOptions.maxResponseBytes).toBe(1048576);
      expect(calledOptions.responseTimeoutMs).toBe(10000);
      expect(calledOptions.headers.Accept).toContain('text/html');

      expect(doc.provider).toBe('direct_safe_fetch');
      expect(doc.domain).toBe('www.sony.com');
      expect(doc.title).toBe('Sony WH-1000XM5 Noise Cancelling Headphones');
      expect(doc.markdownContent).toContain('Sony WH-1000XM5');
      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.SUCCESS);
    });

    it('blocks SSRF private IP and loopback destinations before issuing any fetch', async () => {
      const privateUrls = [
        'http://127.0.0.1:8080/internal-status',
        'http://localhost:3000/api/keys',
        'http://169.254.169.254/latest/meta-data/',
        'http://10.0.0.1/admin',
        'http://192.168.1.1/router',
      ];

      for (const url of privateUrls) {
        const doc = await extractor.extract(createExtractionRequest(url));
        expect(safeFetchSpy).not.toHaveBeenCalled();
        expect(doc.accessState).toBe(SourceAccessState.SSRF_PROHIBITED);
        expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
        expect(doc.warnings[0]).toContain('SSRF security boundary');
      }
    });
  });

  describe('Response Content Parsing Contract', () => {
    it('parses HTML and produces clean markdown with contentHash and textExcerpt', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        createMockSafeResponse(validHtml, {
          url: 'https://example.com/product/1',
        })
      );

      const doc = await extractor.extract(
        createExtractionRequest('https://example.com/product/1')
      );

      expect(doc.markdownContent).toContain('# Sony WH-1000XM5');
      expect(doc.contentHash).toBeDefined();
      expect(typeof doc.contentHash).toBe('string');
      expect(doc.contentHash?.length).toBe(64);
      expect(doc.textExcerpt).toContain('Sony WH-1000XM5');
    });

    it('handles plain text responses by enclosing in markdown code blocks', async () => {
      const plainText = 'Specification Sheet: Model XYZ-100\nVoltage: 120V\nWattage: 65W';

      safeFetchSpy.mockResolvedValueOnce(
        createMockSafeResponse(plainText, {
          url: 'https://example.com/specs.txt',
          contentType: 'text/plain; charset=utf-8',
        })
      );

      const doc = await extractor.extract(
        createExtractionRequest('https://example.com/specs.txt')
      );

      expect(doc.markdownContent).toContain('```text\nSpecification Sheet: Model XYZ-100');
      expect(doc.contentType).toBe('text/plain; charset=utf-8');
      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.SUCCESS);
    });

    it('rejects unsupported binary or non-text content types', async () => {
      safeFetchSpy.mockResolvedValueOnce(
        createMockSafeResponse('binary data...', {
          url: 'https://example.com/manual.pdf',
          contentType: 'application/pdf',
        })
      );

      const doc = await extractor.extract(
        createExtractionRequest('https://example.com/manual.pdf')
      );

      expect(doc.extractionState).toBe(ExtractionState.UNSUPPORTED_CONTENT);
      expect(doc.warnings[0]).toContain('Unsupported document Content-Type: "application/pdf"');
    });

    it('detects anti-bot challenge on HTTP 403 or challenge body', async () => {
      const challengeHtml = '<html><head><title>Just a moment...</title></head><body>Cloudflare Ray ID: 123456</body></html>';

      safeFetchSpy.mockResolvedValueOnce(
        createMockSafeResponse(challengeHtml, {
          status: 403,
          url: 'https://protected.example.com/item',
          contentType: 'text/html',
        })
      );

      const doc = await extractor.extract(
        createExtractionRequest('https://protected.example.com/item')
      );

      expect(doc.accessState).toBe(SourceAccessState.BLOCKED_BOT_CHALLENGE);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
      expect(doc.httpStatusCode).toBe(403);
    });
  });

  describe('SafeHttpError Transport Error Translation Contract', () => {
    it('maps RESPONSE_SIZE_EXCEEDED to ExtractionState.PAYLOAD_TOO_LARGE', async () => {
      safeFetchSpy.mockRejectedValueOnce(
        new securityModule.SafeHttpError('RESPONSE_SIZE_EXCEEDED', 'Response body exceeded 1048576 bytes')
      );

      const doc = await extractor.extract(
        createExtractionRequest('https://example.com/huge-page.html')
      );

      expect(doc.accessState).toBe(SourceAccessState.ACCESSIBLE);
      expect(doc.extractionState).toBe(ExtractionState.PAYLOAD_TOO_LARGE);
      expect(doc.warnings[0]).toContain('Response body exceeded');
    });

    it('maps DNS_RESOLUTION_FAILED to SourceAccessState.DNS_RESOLUTION_FAILED', async () => {
      safeFetchSpy.mockRejectedValueOnce(
        new securityModule.SafeHttpError('DNS_RESOLUTION_FAILED', 'getaddrinfo ENOTFOUND invalid.domain.xyz')
      );

      const doc = await extractor.extract(
        createExtractionRequest('https://invalid.domain.xyz/page')
      );

      expect(doc.accessState).toBe(SourceAccessState.DNS_RESOLUTION_FAILED);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
    });

    it('maps TIMEOUT to SourceAccessState.TIMEOUT', async () => {
      safeFetchSpy.mockRejectedValueOnce(
        new securityModule.SafeHttpError('TIMEOUT', 'Socket read timeout reached')
      );

      const doc = await extractor.extract(
        createExtractionRequest('https://slow.example.com/page')
      );

      expect(doc.accessState).toBe(SourceAccessState.TIMEOUT);
      expect(doc.extractionState).toBe(ExtractionState.SKIPPED);
    });

    it('throws ExtractionError CANCELLED when aborted by caller', async () => {
      safeFetchSpy.mockRejectedValueOnce(
        new securityModule.SafeHttpError('CANCELLED', 'Request aborted')
      );

      await expect(
        extractor.extract(createExtractionRequest('https://example.com/page'))
      ).rejects.toThrow(ExtractionError);
    });
  });
});
