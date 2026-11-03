import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { safeFetch, validateUrl, SafeHttpError } from '@/server/security';
import {
  type ExtractionRequest,
  type ExtractedDocument,
  SourceAccessState,
  ExtractionState,
  ExtractionError,
} from '../../contracts';
import type { IExtractionProvider } from '../extraction-adapter.interface';
import { logger } from '@/lib/logging/logger';

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v1/scrape';

interface FirecrawlRawMetadata {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly language?: string | undefined;
  readonly sourceURL?: string | undefined;
  readonly statusCode?: number | undefined;
  readonly error?: string | undefined;
}

interface FirecrawlRawResponse {
  readonly success?: boolean | undefined;
  readonly data?: {
    readonly markdown?: string | undefined;
    readonly metadata?: FirecrawlRawMetadata | undefined;
  } | undefined;
  readonly error?: string | undefined;
}

/**
 * VerityScout AI — Tier 2 Managed Cloud Extractor (Firecrawl)
 * Governed by: ADR-005, DEC-006, and Step 34.
 *
 * Invoked as managed fallback for JavaScript-rendered SPAs and dynamic client DOMs.
 * Sourced from official Firecrawl documentation: https://docs.firecrawl.dev/
 */
export class FirecrawlExtractionAdapter implements IExtractionProvider {
  public readonly providerId = 'firecrawl' as const;

  async extract(request: ExtractionRequest, apiKey?: string): Promise<ExtractedDocument> {
    const startTime = Date.now();

    if (!apiKey || apiKey.trim().length === 0) {
      throw new ExtractionError(
        'CREDENTIAL_MISSING',
        'Firecrawl API key is missing. Please configure Firecrawl credentials in Settings.',
        { providerId: this.providerId }
      );
    }

    // 1. Validate Target URL via Step 32 Public Research Policy Before Sending Remotely
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

    const payload = {
      url: validation.canonicalUrl,
      formats: ['markdown'],
      onlyMainContent: true,
    };

    try {
      const response = await safeFetch(FIRECRAWL_SCRAPE_URL, {
        policy: 'TRUSTED_PROVIDER',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          // Ignore
        }

        if (response.status === 401 || response.status === 403) {
          throw new ExtractionError(
            'AUTHENTICATION_REQUIRED',
            'Firecrawl API key is invalid, inactive, or unauthorized',
            { providerId: this.providerId, statusCode: response.status }
          );
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
          contentType: 'application/json',
          httpStatusCode: response.status,
          accessState: SourceAccessState.HTTP_ERROR,
          extractionState: ExtractionState.SKIPPED,
          warnings: [`Firecrawl scrape service returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`],
          retrievedAt: new Date().toISOString(),
          usage: { bytesReceived: 0, latencyMs },
        };
      }

      let parsed: FirecrawlRawResponse;
      try {
        parsed = (await response.json()) as FirecrawlRawResponse;
      } catch (err) {
        throw new ExtractionError(
          'PARSING_FAILED',
          'Failed to parse JSON response from Firecrawl scrape endpoint',
          { providerId: this.providerId, cause: err }
        );
      }

      const markdownContent = parsed.data?.markdown?.trim() || '';
      const meta = parsed.data?.metadata;
      const isEmpty = markdownContent.length === 0;

      let contentHash: string | null = null;
      let textExcerpt: string | null = null;

      if (!isEmpty) {
        contentHash = createHash('sha256').update(markdownContent).digest('hex');
        textExcerpt = markdownContent.slice(0, 800).replace(/\s+/g, ' ').trim();
      }

      const reportedStatusCode = meta?.statusCode ?? 200;
      let accessState = SourceAccessState.ACCESSIBLE;
      let extractionState = ExtractionState.SUCCESS;

      if (reportedStatusCode === 403 || reportedStatusCode === 401) {
        accessState = SourceAccessState.BLOCKED_BOT_CHALLENGE;
        extractionState = ExtractionState.SKIPPED;
      } else if (reportedStatusCode >= 400) {
        accessState = SourceAccessState.HTTP_ERROR;
        extractionState = ExtractionState.SKIPPED;
      } else if (isEmpty) {
        extractionState = ExtractionState.EMPTY_BODY;
      }

      return {
        id: randomUUID(),
        provider: this.providerId,
        requestedUrl: request.url,
        finalUrl: meta?.sourceURL || validation.canonicalUrl,
        domain: validation.hostname,
        title: meta?.title || request.searchCandidate?.title || null,
        markdownContent,
        textExcerpt,
        contentHash,
        author: request.searchCandidate?.author || null,
        publisher: null,
        publishedDate: request.searchCandidate?.publishedDate || null,
        language: meta?.language || null,
        contentType: 'text/markdown',
        httpStatusCode: reportedStatusCode,
        accessState,
        extractionState,
        warnings: parsed.error ? [parsed.error] : [],
        retrievedAt: new Date().toISOString(),
        usage: { bytesReceived: markdownContent.length, latencyMs },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof ExtractionError) throw error;

      if (error instanceof SafeHttpError) {
        if (error.code === 'CANCELLED') {
          throw new ExtractionError('CANCELLED', 'Firecrawl extraction was cancelled by caller', {
            providerId: this.providerId,
            cause: error,
          });
        }
        if (error.code === 'TIMEOUT') {
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
            accessState: SourceAccessState.TIMEOUT,
            extractionState: ExtractionState.SKIPPED,
            warnings: ['Firecrawl API connection timed out'],
            retrievedAt: new Date().toISOString(),
            usage: { bytesReceived: 0, latencyMs },
          };
        }
      }

      logger.warn('EXTRACTION_FIRECRAWL_ERROR', 'Unexpected failure during Firecrawl extraction', {
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExtractionError(
        'PROVIDER_UNAVAILABLE',
        `Firecrawl extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        { providerId: this.providerId, cause: error }
      );
    }
  }
}
