import 'server-only';
import { randomUUID } from 'node:crypto';
import { safeFetch, validateUrl, SafeHttpError } from '@/server/security';
import {
  type ExtractionRequest,
  type ExtractedDocument,
  SourceAccessState,
  ExtractionState,
  ExtractionError,
} from '../../contracts';
import type { IExtractionProvider } from '../extraction-adapter.interface';
import { parseHtmlContent } from '../../html-parser';
import { logger } from '@/lib/logging/logger';

/**
 * VerityScout AI — Tier 1 Direct Safe-Fetch Extractor
 * Governed by: ADR-005, DEC-006, and Step 34.
 *
 * In-house, zero-cost static document extractor utilizing:
 * 1. Step 32 safeFetch (pre-fetch DNS validation, SSRF blocking, socket pinning, redirect controls).
 * 2. In-memory JSDOM HTML parser with scripts and remote subresources strictly disabled.
 * 3. Boilerplate stripping, bot challenge detection, and clean Markdown generation.
 */
export class DirectSafeFetchExtractor implements IExtractionProvider {
  public readonly providerId = 'direct_safe_fetch' as const;

  async extract(request: ExtractionRequest): Promise<ExtractedDocument> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // 1. Validate Target URL through Step 32 Security Policy
    const validation = validateUrl(request.url, 'PUBLIC_RESEARCH_SOURCE');
    if (!validation.isValid) {
      let domain = 'unknown';
      try {
        domain = new URL(request.url).hostname;
      } catch {
        // Ignore URL parsing error
      }

      return {
        id: randomUUID(),
        provider: this.providerId,
        requestedUrl: request.url,
        finalUrl: request.url,
        domain,
        title: null,
        markdownContent: '',
        textExcerpt: null,
        contentHash: null,
        author: null,
        publisher: null,
        publishedDate: null,
        language: null,
        contentType: null,
        httpStatusCode: 0,
        accessState: SourceAccessState.SSRF_PROHIBITED,
        extractionState: ExtractionState.SKIPPED,
        warnings: [`URL rejected by SSRF security boundary: ${validation.error}`],
        retrievedAt: new Date().toISOString(),
        usage: { bytesReceived: 0, latencyMs: Date.now() - startTime },
      };
    }

    try {
      // 2. Dispatch Outbound HTTP Request via Step 32 Safe Transport
      const response = await safeFetch(validation.canonicalUrl, {
        policy: 'PUBLIC_RESEARCH_SOURCE',
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
        maxResponseBytes: request.maxBodyBytes,
        responseTimeoutMs: request.timeoutMs,
        signal: request.signal,
      });

      const finalUrl = response.url || validation.canonicalUrl;
      const rawContentType = (response.headers['content-type'] || '').toLowerCase();
      const statusCode = response.status;
      const latencyMs = Date.now() - startTime;

      // 3. Handle Access Restrictions & HTTP Errors
      if (statusCode === 401 || statusCode === 403) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          // Ignore text reading error on blocked page
        }

        const isChallenge = /cloudflare|just a moment|captcha|datadome|challenge|access denied/i.test(errorBody);

        return {
          id: randomUUID(),
          provider: this.providerId,
          requestedUrl: request.url,
          finalUrl,
          domain: validation.hostname,
          title: null,
          markdownContent: '',
          textExcerpt: null,
          contentHash: null,
          author: null,
          publisher: null,
          publishedDate: null,
          language: null,
          contentType: rawContentType || null,
          httpStatusCode: statusCode,
          accessState: isChallenge ? SourceAccessState.BLOCKED_BOT_CHALLENGE : SourceAccessState.HTTP_ERROR,
          extractionState: ExtractionState.SKIPPED,
          warnings: [`Upstream server returned HTTP ${statusCode} ${isChallenge ? '(Bot Challenge)' : '(Access Denied)'}`],
          retrievedAt: new Date().toISOString(),
          usage: { bytesReceived: errorBody.length, latencyMs },
        };
      }

      if (!response.ok) {
        return {
          id: randomUUID(),
          provider: this.providerId,
          requestedUrl: request.url,
          finalUrl,
          domain: validation.hostname,
          title: null,
          markdownContent: '',
          textExcerpt: null,
          contentHash: null,
          author: null,
          publisher: null,
          publishedDate: null,
          language: null,
          contentType: rawContentType || null,
          httpStatusCode: statusCode,
          accessState: SourceAccessState.HTTP_ERROR,
          extractionState: ExtractionState.SKIPPED,
          warnings: [`Upstream server returned error status HTTP ${statusCode} ${response.statusText}`],
          retrievedAt: new Date().toISOString(),
          usage: { bytesReceived: 0, latencyMs },
        };
      }

      // 4. Validate Content-Type
      const isHtml = rawContentType.includes('text/html') || rawContentType.includes('application/xhtml+xml');
      const isPlainText = rawContentType.includes('text/plain');

      if (!isHtml && !isPlainText && rawContentType.length > 0) {
        return {
          id: randomUUID(),
          provider: this.providerId,
          requestedUrl: request.url,
          finalUrl,
          domain: validation.hostname,
          title: null,
          markdownContent: '',
          textExcerpt: null,
          contentHash: null,
          author: null,
          publisher: null,
          publishedDate: null,
          language: null,
          contentType: rawContentType,
          httpStatusCode: statusCode,
          accessState: SourceAccessState.ACCESSIBLE,
          extractionState: ExtractionState.UNSUPPORTED_CONTENT,
          warnings: [`Unsupported document Content-Type: "${rawContentType}". Only HTML and plain text are supported.`],
          retrievedAt: new Date().toISOString(),
          usage: { bytesReceived: 0, latencyMs },
        };
      }

      const bodyText = await response.text();

      // 5. Parse Content Safely
      let parsedResult;
      if (isPlainText) {
        parsedResult = {
          title: null,
          markdownContent: `\`\`\`text\n${bodyText.slice(0, 100000)}\n\`\`\``,
          textExcerpt: bodyText.slice(0, 800).trim(),
          contentHash: null,
          author: null,
          publisher: null,
          publishedDate: null,
          language: null,
          isBotChallenge: false,
          isEmpty: bodyText.trim().length === 0,
          warnings: [],
        };
      } else {
        parsedResult = parseHtmlContent(bodyText, finalUrl);
      }

      // 6. Map Outcomes Honestly
      let accessState: SourceAccessState = SourceAccessState.ACCESSIBLE;
      let extractionState: ExtractionState = ExtractionState.SUCCESS;

      if (parsedResult.isBotChallenge) {
        accessState = SourceAccessState.BLOCKED_BOT_CHALLENGE;
        extractionState = ExtractionState.SKIPPED;
      } else if (parsedResult.isEmpty) {
        extractionState = ExtractionState.EMPTY_BODY;
      }

      return {
        id: randomUUID(),
        provider: this.providerId,
        requestedUrl: request.url,
        finalUrl,
        domain: validation.hostname,
        title: parsedResult.title ?? request.searchCandidate?.title ?? null,
        markdownContent: parsedResult.markdownContent,
        textExcerpt: parsedResult.textExcerpt,
        contentHash: parsedResult.contentHash,
        author: parsedResult.author ?? request.searchCandidate?.author ?? null,
        publisher: parsedResult.publisher ?? null,
        publishedDate: parsedResult.publishedDate ?? request.searchCandidate?.publishedDate ?? null,
        language: parsedResult.language ?? null,
        contentType: rawContentType || 'text/html',
        httpStatusCode: statusCode,
        accessState,
        extractionState,
        warnings: [...warnings, ...parsedResult.warnings],
        retrievedAt: new Date().toISOString(),
        usage: { bytesReceived: bodyText.length, latencyMs },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof SafeHttpError) {
        if (error.code === 'CANCELLED') {
          throw new ExtractionError('CANCELLED', 'Extraction cancelled by caller', {
            providerId: this.providerId,
            cause: error,
          });
        }

        let accessState: SourceAccessState = SourceAccessState.HTTP_ERROR;
        let extractionState: ExtractionState = ExtractionState.SKIPPED;

        if (error.code === 'TIMEOUT') {
          accessState = SourceAccessState.TIMEOUT;
        } else if (error.code === 'DNS_RESOLUTION_FAILED') {
          accessState = SourceAccessState.DNS_RESOLUTION_FAILED;
        } else if (error.code === 'PROHIBITED_DESTINATION' || error.code === 'INVALID_URL') {
          accessState = SourceAccessState.SSRF_PROHIBITED;
        } else if (error.code === 'RESPONSE_SIZE_EXCEEDED') {
          accessState = SourceAccessState.ACCESSIBLE;
          extractionState = ExtractionState.PAYLOAD_TOO_LARGE;
        }

        return {
          id: randomUUID(),
          provider: this.providerId,
          requestedUrl: request.url,
          finalUrl: request.url,
          domain: validation.hostname,
          title: null,
          markdownContent: '',
          textExcerpt: null,
          contentHash: null,
          author: null,
          publisher: null,
          publishedDate: null,
          language: null,
          contentType: null,
          httpStatusCode: error.statusCode ?? 0,
          accessState,
          extractionState,
          warnings: [`Network transport error: ${error.message}`],
          retrievedAt: new Date().toISOString(),
          usage: { bytesReceived: 0, latencyMs },
        };
      }

      logger.warn('EXTRACTION_DIRECT_UNEXPECTED_ERROR', 'Unexpected error during direct HTTP extraction', {
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        id: randomUUID(),
        provider: this.providerId,
        requestedUrl: request.url,
        finalUrl: request.url,
        domain: validation.hostname,
        title: null,
        markdownContent: '',
        textExcerpt: null,
        contentHash: null,
        author: null,
        publisher: null,
        publishedDate: null,
        language: null,
        contentType: null,
        httpStatusCode: 0,
        accessState: SourceAccessState.HTTP_ERROR,
        extractionState: ExtractionState.PARSING_FAILED,
        warnings: [`Unexpected extraction failure: ${error instanceof Error ? error.message : String(error)}`],
        retrievedAt: new Date().toISOString(),
        usage: { bytesReceived: 0, latencyMs },
      };
    }
  }
}
