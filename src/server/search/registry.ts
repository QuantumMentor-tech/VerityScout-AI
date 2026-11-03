import 'server-only';
import {
  type SearchProviderId,
  SearchProviderError,
  isSearchProviderId,
} from './contracts';
import type { ISearchProvider } from './adapters/search-adapter.interface';
import { TavilySearchAdapter } from './adapters/tavily/tavily-search-adapter';
import { ExaSearchAdapter } from './adapters/exa/exa-search-adapter';
import { MockSearchAdapter } from './adapters/mock/mock-search-adapter';

/**
 * VerityScout AI — Search Provider Registry
 * Governed by: ADR-005, DEC-006, and Step 33.
 *
 * Manages search provider adapters with zero vendor lock-in.
 */
export class SearchProviderRegistry {
  private static instance: SearchProviderRegistry | null = null;
  private readonly adapters = new Map<SearchProviderId, ISearchProvider>();

  private constructor() {
    this.registerDefaultAdapters();
  }

  public static getInstance(): SearchProviderRegistry {
    if (!SearchProviderRegistry.instance) {
      SearchProviderRegistry.instance = new SearchProviderRegistry();
    }
    return SearchProviderRegistry.instance;
  }

  private registerDefaultAdapters(): void {
    this.adapters.set('tavily', new TavilySearchAdapter());
    this.adapters.set('exa', new ExaSearchAdapter());
    this.adapters.set('mock_search', new MockSearchAdapter());
  }

  public getAdapter(providerId: SearchProviderId): ISearchProvider {
    if (!isSearchProviderId(providerId)) {
      throw new SearchProviderError(
        'UNKNOWN_ERROR',
        `Unknown search provider identifier: "${String(providerId)}"`
      );
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new SearchProviderError(
        'PROVIDER_UNAVAILABLE',
        `Search provider "${providerId}" is not registered in the system`,
        { providerId }
      );
    }

    return adapter;
  }

  public registerAdapter(providerId: SearchProviderId, adapter: ISearchProvider): void {
    this.adapters.set(providerId, adapter);
  }

  public reset(): void {
    this.adapters.clear();
    this.registerDefaultAdapters();
  }
}

export function getSearchProviderRegistry(): SearchProviderRegistry {
  return SearchProviderRegistry.getInstance();
}

