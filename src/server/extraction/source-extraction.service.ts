import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NormalizedSearchResult } from '@/server/search';
import {
  type ExtractionRequest,
  type ExtractedDocument,
  type ExtractionOptions,
  type ExtractionBatchSummary,
  type ExtractionProviderId,
  SourceAccessState,
  ExtractionState,
  ExtractionError,
} from './contracts';
import { getExtractionProviderRegistry } from './registry';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { logger } from '@/lib/logging/logger';

export class SourceExtractionService {
  private readonly credentialService: ProviderCredentialService;

  constructor(credentialService?: ProviderCredentialService) {
    this.credentialService = credentialService ?? new ProviderCredentialService();
  }

  /**
   * Extracts content from a single validated web source with optional Two-Tier fallback.
   */
  async extractSource(
    userId: string,
    request: ExtractionRequest,
    options?: ExtractionOptions
  ): Promise<ExtractedDocument> {
    const providerId: ExtractionProviderId = options?.providerId ?? 'direct_safe_fetch';
    const registry = getExtractionProviderRegistry();
    const adapter = registry.getAdapter(providerId);

    // Resolve API key if managed cloud provider is requested
    let apiKey = options?.explicitApiKey;
    if (providerId === 'firecrawl' && !apiKey) {
      apiKey = (await this.credentialService.getDecryptedCredential(userId, 'firecrawl')) ?? undefined;
    }

    const doc = await adapter.extract(request, apiKey);

    // Optional Two-Tier Strategy:
    // If Tier 1 encountered a bot challenge or empty shell, and caller explicitly enabled Tier 2 fallback
    const shouldAttemptTier2Fallback =
      providerId === 'direct_safe_fetch' &&
      options?.allowTier2Fallback === true &&
      (doc.accessState === SourceAccessState.BLOCKED_BOT_CHALLENGE ||
        doc.extractionState === ExtractionState.EMPTY_BODY);

    if (shouldAttemptTier2Fallback) {
      try {
        const firecrawlKey = options?.explicitApiKey ||
          (await this.credentialService.getDecryptedCredential(userId, 'firecrawl')) ||
          undefined;

        if (firecrawlKey) {
          const tier2Adapter = registry.getAdapter('firecrawl');
          const tier2Doc = await tier2Adapter.extract(request, firecrawlKey);

          if (tier2Doc.extractionState === ExtractionState.SUCCESS) {
            return {
              ...tier2Doc,
              warnings: [
                ...tier2Doc.warnings,
                'Tier 1 direct fetch encountered bot challenge or empty shell; successfully extracted via Tier 2 managed cloud fallback.',
              ],
            };
          }
        }
      } catch (tier2Err) {
        logger.info('EXTRACTION_TIER2_FALLBACK_FAILED', 'Tier 2 cloud fallback failed; retaining Tier 1 blocked status', {
          url: request.url,
          error: tier2Err instanceof Error ? tier2Err.message : String(tier2Err),
        });
      }
    }

    return doc;
  }

  /**
   * Extracts content from a bounded batch of search results or URLs (max 10 pages per run).
   */
  async extractBatch(
    userId: string,
    inputs: readonly (ExtractionRequest | NormalizedSearchResult)[],
    options?: ExtractionOptions
  ): Promise<ExtractionBatchSummary> {
    const startTime = Date.now();
    const maxUrls = Math.min(options?.maxUrls ?? 10, 10); // Hard cap: 10 pages (ADR-005, SEC-035)
    const concurrency = Math.min(options?.concurrency ?? 2, 3); // Bounded concurrency (1 to 3)

    const boundedInputs = inputs.slice(0, maxUrls);
    const documents: ExtractedDocument[] = [];

    let totalSuccessful = 0;
    let totalFailed = 0;

    for (let i = 0; i < boundedInputs.length; i += concurrency) {
      if (options?.signal?.aborted) {
        break;
      }

      const chunk = boundedInputs.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async (item) => {
        if (options?.signal?.aborted) {
          throw new ExtractionError('CANCELLED', 'Batch extraction cancelled by caller');
        }

        // Convert NormalizedSearchResult to ExtractionRequest if needed
        const isSearchResult = 'originalUrl' in item && 'urlValidation' in item;
        let req: ExtractionRequest;

        if (isSearchResult) {
          const searchCand = item as NormalizedSearchResult;
          if (!searchCand.isFetchable || !searchCand.urlValidation.isValid) {
            // Do NOT attempt connection to SSRF-prohibited or invalid URL
            totalFailed++;
            const domain = searchCand.urlValidation.isValid
              ? searchCand.urlValidation.hostname
              : 'unknown';
            const validationError = !searchCand.urlValidation.isValid
              ? searchCand.urlValidation.error
              : 'Destination marked unexecutable';

            return {
              id: randomUUID(),
              provider: options?.providerId ?? 'direct_safe_fetch',
              requestedUrl: searchCand.originalUrl,
              finalUrl: searchCand.originalUrl,
              domain,
              title: searchCand.title,
              markdownContent: '',
              textExcerpt: null,
              contentHash: null,
              author: searchCand.author,
              publisher: null,
              publishedDate: searchCand.publishedDate,
              language: null,
              contentType: null,
              httpStatusCode: 0,
              accessState: SourceAccessState.SSRF_PROHIBITED,
              extractionState: ExtractionState.SKIPPED,
              warnings: [`Source URL flagged unsafe by Step 32 security boundary: ${validationError}`],
              retrievedAt: new Date().toISOString(),
              usage: { bytesReceived: 0, latencyMs: 0 },
            };
          }

          req = {
            url: searchCand.originalUrl,
            maxBodyBytes: options?.maxBodyBytes ?? 5 * 1024 * 1024,
            timeoutMs: options?.timeoutMs ?? 15000,
            requireJsRendering: false,
            requestId: searchCand.id,
            searchCandidate: searchCand,
            signal: options?.signal,
          };
        } else {
          req = item as ExtractionRequest;
        }

        try {
          const doc = await this.extractSource(userId, req, options);
          if (doc.extractionState === ExtractionState.SUCCESS) {
            totalSuccessful++;
          } else {
            totalFailed++;
          }
          return doc;
        } catch (err) {
          totalFailed++;
          return {
            id: randomUUID(),
            provider: options?.providerId ?? 'direct_safe_fetch',
            requestedUrl: req.url,
            finalUrl: req.url,
            domain: 'unknown',
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
            warnings: [`Extraction failed: ${err instanceof Error ? err.message : String(err)}`],
            retrievedAt: new Date().toISOString(),
            usage: { bytesReceived: 0, latencyMs: 0 },
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      documents.push(...chunkResults);
    }

    const durationMs = Date.now() - startTime;

    logger.info('EXTRACTION_BATCH_COMPLETED', 'Source extraction batch finished', {
      totalRequested: boundedInputs.length,
      totalSuccessful,
      totalFailed,
      durationMs,
    });

    return {
      totalRequested: boundedInputs.length,
      totalSuccessful,
      totalFailed,
      documents,
      durationMs,
    };
  }
}
