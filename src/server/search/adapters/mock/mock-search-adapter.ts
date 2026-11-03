import 'server-only';
import {
  type SearchQueryRequest,
  type SearchQueryResponse,
  type SearchCandidate,
  SearchProviderError,
  type SearchProviderErrorCode,
} from '../../contracts';
import type { ISearchProvider } from '../search-adapter.interface';

export interface MockSearchBehavior {
  readonly candidates?: readonly SearchCandidate[] | undefined;
  readonly shouldFailWithCode?: SearchProviderErrorCode | undefined;
  readonly errorMessage?: string | undefined;
  readonly simulateDelayMs?: number | undefined;
  readonly creditsConsumed?: number | undefined;
}

/**
 * VerityScout AI — Mock Search Provider Adapter
 * Governed by: ADR-005, DEC-006, and Step 33.
 *
 * Dedicated test double for offline unit, integration, and CI testing.
 * Guarantees zero live external API spend and zero external network access.
 */
export class MockSearchAdapter implements ISearchProvider {
  public readonly providerId = 'mock_search' as const;
  private behavior: MockSearchBehavior;

  constructor(initialBehavior?: MockSearchBehavior) {
    this.behavior = initialBehavior ?? {};
  }

  setBehavior(behavior: MockSearchBehavior): void {
    this.behavior = behavior;
  }

  async search(request: SearchQueryRequest, apiKey: string): Promise<SearchQueryResponse> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new SearchProviderError(
        'CREDENTIAL_MISSING',
        'Mock search API key is missing or empty',
        { providerId: this.providerId }
      );
    }

    if (request.signal?.aborted) {
      throw new SearchProviderError(
        'CANCELLED',
        'Search operation cancelled by caller',
        { providerId: this.providerId }
      );
    }

    if (this.behavior.simulateDelayMs && this.behavior.simulateDelayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.behavior.simulateDelayMs);
        if (request.signal) {
          request.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(
              new SearchProviderError('CANCELLED', 'Search operation cancelled during delay', {
                providerId: this.providerId,
              })
            );
          });
        }
      });
    }

    if (this.behavior.shouldFailWithCode) {
      throw new SearchProviderError(
        this.behavior.shouldFailWithCode,
        this.behavior.errorMessage ?? `Mock simulated failure: ${this.behavior.shouldFailWithCode}`,
        { providerId: this.providerId }
      );
    }

    const defaultCandidates: readonly SearchCandidate[] = [
      {
        title: 'RTX 4070 Super 12GB Review & Specifications',
        url: 'https://example-hardware.com/reviews/rtx-4070-super',
        snippet: 'The RTX 4070 Super delivers exceptional 1440p gaming performance starting at $599 MSRP.',
        publishedDate: '2024-01-17T09:00:00Z',
        author: 'Hardware Editorial Team',
        relevanceScore: 0.94,
        providerResultId: 'mock-cand-1',
        queryVariantId: request.queryVariantId,
      },
      {
        title: 'GeForce RTX 4070 Super Graphics Cards — In Stock at Retailer',
        url: 'https://example-retailer.com/products/gpu/rtx-4070-super',
        snippet: 'Buy GeForce RTX 4070 Super 12GB graphics cards with 3x DisplayPort and 1x HDMI 2.1a.',
        publishedDate: '2024-02-01T14:30:00Z',
        author: null,
        relevanceScore: 0.89,
        providerResultId: 'mock-cand-2',
        queryVariantId: request.queryVariantId,
      },
    ];

    const sourceCandidates = this.behavior.candidates ?? defaultCandidates;
    const cappedCandidates = sourceCandidates.slice(0, request.maxResults);

    return {
      provider: this.providerId,
      query: request.query,
      results: cappedCandidates,
      responseId: `mock-resp-${Date.now()}`,
      usage: {
        searchCreditsConsumed: this.behavior.creditsConsumed ?? 1,
        latencyMs: 15,
      },
    };
  }

  async testConnection(apiKey: string): Promise<{ valid: boolean; latencyMs: number }> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new SearchProviderError(
        'CREDENTIAL_MISSING',
        'Mock search API key is missing or empty',
        { providerId: this.providerId }
      );
    }
    if (this.behavior.shouldFailWithCode) {
      throw new SearchProviderError(
        this.behavior.shouldFailWithCode,
        this.behavior.errorMessage ?? 'Mock connection test failure',
        { providerId: this.providerId }
      );
    }
    return { valid: true, latencyMs: 5 };
  }
}

