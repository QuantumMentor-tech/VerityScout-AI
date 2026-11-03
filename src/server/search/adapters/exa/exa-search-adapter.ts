import 'server-only';
import { safeFetch, SafeHttpError } from '@/server/security';
import {
  type SearchQueryRequest,
  type SearchQueryResponse,
  type SearchCandidate,
  SearchProviderError,
} from '../../contracts';
import type { ISearchProvider } from '../search-adapter.interface';
import { logger } from '@/lib/logging/logger';

const EXA_SEARCH_URL = 'https://api.exa.ai/search';

interface ExaRawResultItem {
  readonly id?: string | undefined;
  readonly url?: string | undefined;
  readonly title?: string | undefined;
  readonly author?: string | undefined;
  readonly publishedDate?: string | undefined;
  readonly text?: string | undefined;
  readonly score?: number | undefined;
}

interface ExaRawResponse {
  readonly results?: readonly ExaRawResultItem[] | undefined;
  readonly autopromptString?: string | undefined;
  readonly message?: string | undefined;
  readonly error?: string | undefined;
}

/**
 * VerityScout AI — Exa Search Provider Adapter
 * Governed by: ADR-005, DEC-006, and Step 33.
 *
 * Sourced from official Exa documentation:
 * - Search API reference: https://exa.ai/docs/reference/search
 * - Uses x-api-key header and POST https://api.exa.ai/search
 */
export class ExaSearchAdapter implements ISearchProvider {
  public readonly providerId = 'exa' as const;

  async search(request: SearchQueryRequest, apiKey: string): Promise<SearchQueryResponse> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new SearchProviderError(
        'CREDENTIAL_MISSING',
        'Exa API key is missing or empty',
        { providerId: this.providerId }
      );
    }

    const startTime = Date.now();

    const payload: Record<string, unknown> = {
      query: request.query,
      type: 'auto',
      numResults: request.maxResults,
      useAutoprompt: false,
      contents: {
        text: true,
      },
    };

    if (request.includeDomains && request.includeDomains.length > 0) {
      payload.includeDomains = request.includeDomains;
    }
    if (request.excludeDomains && request.excludeDomains.length > 0) {
      payload.excludeDomains = request.excludeDomains;
    }

    try {
      const response = await safeFetch(EXA_SEARCH_URL, {
        policy: 'TRUSTED_PROVIDER',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errorBodyText = '';
        try {
          errorBodyText = await response.text();
        } catch {
          // Ignore stream reading error
        }

        this.handleHttpError(response.status, errorBodyText);
      }

      let parsedBody: ExaRawResponse;
      try {
        parsedBody = (await response.json()) as ExaRawResponse;
      } catch (err) {
        throw new SearchProviderError(
          'RESPONSE_VALIDATION_FAILED',
          'Failed to parse JSON response from Exa search endpoint',
          { providerId: this.providerId, cause: err }
        );
      }

      if (!parsedBody || typeof parsedBody !== 'object' || !Array.isArray(parsedBody.results)) {
        throw new SearchProviderError(
          'RESPONSE_VALIDATION_FAILED',
          'Exa response missing required "results" array',
          { providerId: this.providerId }
        );
      }

      const candidates: SearchCandidate[] = [];
      for (const item of parsedBody.results) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.url !== 'string' || item.url.trim().length === 0) continue;

        const rawScore = typeof item.score === 'number' && !isNaN(item.score) ? item.score : null;
        const normalizedScore = rawScore !== null ? Math.min(1.0, Math.max(0.0, rawScore)) : null;

        const rawDate = typeof item.publishedDate === 'string' && item.publishedDate.trim().length > 0
          ? item.publishedDate.trim()
          : null;

        candidates.push({
          title: typeof item.title === 'string' && item.title.trim().length > 0
            ? item.title.trim()
            : 'Untitled Web Page',
          url: item.url.trim(),
          snippet: typeof item.text === 'string' && item.text.trim().length > 0
            ? item.text.trim()
            : null,
          publishedDate: rawDate,
          author: typeof item.author === 'string' && item.author.trim().length > 0
            ? item.author.trim()
            : null,
          relevanceScore: normalizedScore,
          providerResultId: typeof item.id === 'string' ? item.id : null,
          queryVariantId: request.queryVariantId,
        });
      }

      return {
        provider: this.providerId,
        query: request.query,
        results: candidates,
        responseId: null,
        usage: {
          searchCreditsConsumed: 1,
          latencyMs,
        },
      };
    } catch (error) {
      if (error instanceof SearchProviderError) {
        throw error;
      }

      if (error instanceof SafeHttpError) {
        if (error.code === 'TIMEOUT') {
          throw new SearchProviderError(
            'TIMEOUT',
            'Exa search request timed out',
            { providerId: this.providerId, cause: error }
          );
        }
        if (error.code === 'CANCELLED') {
          throw new SearchProviderError(
            'CANCELLED',
            'Exa search request was cancelled by caller',
            { providerId: this.providerId, cause: error }
          );
        }
        throw new SearchProviderError(
          'TRANSPORT_ERROR',
          `Network transport failed connecting to Exa: ${error.message}`,
          { providerId: this.providerId, cause: error }
        );
      }

      logger.warn('SEARCH_EXA_UNKNOWN_ERROR', 'Unexpected error executing Exa search', {
        providerId: this.providerId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new SearchProviderError(
        'UNKNOWN_ERROR',
        `Unexpected error during Exa search: ${error instanceof Error ? error.message : String(error)}`,
        { providerId: this.providerId, cause: error }
      );
    }
  }

  async testConnection(apiKey: string): Promise<{ valid: boolean; latencyMs: number }> {
    const startTime = Date.now();
    try {
      await this.search(
        {
          query: 'ping test connection',
          maxResults: 1,
          requestId: `test-${Date.now()}`,
          searchDepth: 'QUICK',
          topic: 'general',
        },
        apiKey
      );
      return { valid: true, latencyMs: Date.now() - startTime };
    } catch (error) {
      if (error instanceof SearchProviderError) {
        throw error;
      }
      throw new SearchProviderError(
        'UNKNOWN_ERROR',
        `Exa connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        { providerId: this.providerId, cause: error }
      );
    }
  }

  private handleHttpError(statusCode: number, responseBody: string): never {
    const lowerBody = responseBody.toLowerCase();

    if (statusCode === 401 || statusCode === 403) {
      throw new SearchProviderError(
        'AUTHENTICATION_FAILED',
        'Exa API key is invalid, unauthorized, or inactive',
        { providerId: this.providerId, statusCode }
      );
    }

    if (statusCode === 429) {
      if (lowerBody.includes('credit') || lowerBody.includes('balance') || lowerBody.includes('quota')) {
        throw new SearchProviderError(
          'CREDITS_EXHAUSTED',
          'Exa search credit balance or monthly limit has been exhausted',
          { providerId: this.providerId, statusCode }
        );
      }
      throw new SearchProviderError(
        'RATE_LIMITED',
        'Exa search rate limit exceeded; please back off and retry',
        { providerId: this.providerId, statusCode }
      );
    }

    if (statusCode === 400) {
      throw new SearchProviderError(
        'INVALID_PLAN',
        `Exa rejected search parameters (HTTP 400): ${responseBody.slice(0, 200)}`,
        { providerId: this.providerId, statusCode }
      );
    }

    if (statusCode >= 500) {
      throw new SearchProviderError(
        'PROVIDER_UNAVAILABLE',
        `Exa search service error (HTTP ${statusCode})`,
        { providerId: this.providerId, statusCode }
      );
    }

    throw new SearchProviderError(
      'TRANSPORT_ERROR',
      `Exa returned unexpected HTTP status ${statusCode}`,
      { providerId: this.providerId, statusCode }
    );
  }
}

