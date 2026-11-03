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

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

interface TavilyRawResultItem {
  readonly title?: string | undefined;
  readonly url?: string | undefined;
  readonly content?: string | undefined;
  readonly score?: number | undefined;
  readonly published_date?: string | undefined;
}

interface TavilyRawResponse {
  readonly query?: string | undefined;
  readonly results?: readonly TavilyRawResultItem[] | undefined;
  readonly response_time?: number | undefined;
  readonly message?: string | undefined;
  readonly detail?: string | undefined;
}

/**
 * VerityScout AI — Tavily Search Provider Adapter
 * Governed by: ADR-005, DEC-006, and Step 33.
 *
 * Sourced from official Tavily documentation:
 * - Search API reference: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * - Credits: Basic = 1 credit, Advanced = 2 credits
 */
export class TavilySearchAdapter implements ISearchProvider {
  public readonly providerId = 'tavily' as const;

  async search(request: SearchQueryRequest, apiKey: string): Promise<SearchQueryResponse> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new SearchProviderError(
        'CREDENTIAL_MISSING',
        'Tavily API key is missing or empty',
        { providerId: this.providerId }
      );
    }

    const startTime = Date.now();
    const searchDepth = request.searchDepth === 'DEEP' ? 'advanced' : 'basic';

    const payload: Record<string, unknown> = {
      query: request.query,
      search_depth: searchDepth,
      topic: request.topic ?? 'general',
      max_results: request.maxResults,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    };

    if (request.includeDomains && request.includeDomains.length > 0) {
      payload.include_domains = request.includeDomains;
    }
    if (request.excludeDomains && request.excludeDomains.length > 0) {
      payload.exclude_domains = request.excludeDomains;
    }

    try {
      const response = await safeFetch(TAVILY_SEARCH_URL, {
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
        let errorBodyText = '';
        try {
          errorBodyText = await response.text();
        } catch {
          // Ignore stream reading error
        }

        this.handleHttpError(response.status, errorBodyText);
      }

      let parsedBody: TavilyRawResponse;
      try {
        parsedBody = (await response.json()) as TavilyRawResponse;
      } catch (err) {
        throw new SearchProviderError(
          'RESPONSE_VALIDATION_FAILED',
          'Failed to parse JSON response from Tavily search endpoint',
          { providerId: this.providerId, cause: err }
        );
      }

      if (!parsedBody || typeof parsedBody !== 'object' || !Array.isArray(parsedBody.results)) {
        throw new SearchProviderError(
          'RESPONSE_VALIDATION_FAILED',
          'Tavily response missing required "results" array',
          { providerId: this.providerId }
        );
      }

      const candidates: SearchCandidate[] = [];
      for (const item of parsedBody.results) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.url !== 'string' || item.url.trim().length === 0) continue;

        const rawScore = typeof item.score === 'number' && !isNaN(item.score) ? item.score : null;
        const normalizedScore = rawScore !== null ? Math.min(1.0, Math.max(0.0, rawScore)) : null;

        const rawDate = typeof item.published_date === 'string' && item.published_date.trim().length > 0
          ? item.published_date.trim()
          : null;

        candidates.push({
          title: typeof item.title === 'string' && item.title.trim().length > 0
            ? item.title.trim()
            : 'Untitled Web Page',
          url: item.url.trim(),
          snippet: typeof item.content === 'string' && item.content.trim().length > 0
            ? item.content.trim()
            : null,
          publishedDate: rawDate,
          author: null,
          relevanceScore: normalizedScore,
          providerResultId: null,
          queryVariantId: request.queryVariantId,
        });
      }

      const creditsConsumed = searchDepth === 'advanced' ? 2 : 1;

      return {
        provider: this.providerId,
        query: request.query,
        results: candidates,
        responseId: null,
        usage: {
          searchCreditsConsumed: creditsConsumed,
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
            'Tavily search request timed out',
            { providerId: this.providerId, cause: error }
          );
        }
        if (error.code === 'CANCELLED') {
          throw new SearchProviderError(
            'CANCELLED',
            'Tavily search request was cancelled by caller',
            { providerId: this.providerId, cause: error }
          );
        }
        throw new SearchProviderError(
          'TRANSPORT_ERROR',
          `Network transport failed connecting to Tavily: ${error.message}`,
          { providerId: this.providerId, cause: error }
        );
      }

      logger.warn('SEARCH_TAVILY_UNKNOWN_ERROR', 'Unexpected error executing Tavily search', {
        providerId: this.providerId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new SearchProviderError(
        'UNKNOWN_ERROR',
        `Unexpected error during Tavily search: ${error instanceof Error ? error.message : String(error)}`,
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
        `Tavily connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        { providerId: this.providerId, cause: error }
      );
    }
  }

  private handleHttpError(statusCode: number, responseBody: string): never {
    const lowerBody = responseBody.toLowerCase();

    if (statusCode === 401 || statusCode === 403) {
      throw new SearchProviderError(
        'AUTHENTICATION_FAILED',
        'Tavily API key is invalid, unauthorized, or inactive',
        { providerId: this.providerId, statusCode }
      );
    }

    if (statusCode === 429) {
      if (lowerBody.includes('credit') || lowerBody.includes('quota') || lowerBody.includes('exhausted')) {
        throw new SearchProviderError(
          'CREDITS_EXHAUSTED',
          'Tavily search account balance or monthly credit quota has been exhausted',
          { providerId: this.providerId, statusCode }
        );
      }
      throw new SearchProviderError(
        'RATE_LIMITED',
        'Tavily search rate limit exceeded; please back off and retry',
        { providerId: this.providerId, statusCode }
      );
    }

    if (statusCode === 400) {
      throw new SearchProviderError(
        'INVALID_PLAN',
        `Tavily rejected search parameters (HTTP 400): ${responseBody.slice(0, 200)}`,
        { providerId: this.providerId, statusCode }
      );
    }

    if (statusCode >= 500) {
      throw new SearchProviderError(
        'PROVIDER_UNAVAILABLE',
        `Tavily search service error (HTTP ${statusCode})`,
        { providerId: this.providerId, statusCode }
      );
    }

    throw new SearchProviderError(
      'TRANSPORT_ERROR',
      `Tavily returned unexpected HTTP status ${statusCode}`,
      { providerId: this.providerId, statusCode }
    );
  }
}

