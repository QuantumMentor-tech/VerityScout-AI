import 'server-only';
import type {
  SearchProviderId,
  SearchQueryRequest,
  SearchQueryResponse,
} from '../contracts';

/**
 * VerityScout AI — Search Provider Adapter Contract (`ISearchProvider`)
 * Governed by: ADR-005, DEC-006, and Step 33.
 *
 * Implemented by:
 * - TavilySearchAdapter
 * - ExaSearchAdapter
 * - MockSearchAdapter
 */
export interface ISearchProvider {
  readonly providerId: SearchProviderId;
  search(request: SearchQueryRequest, apiKey: string): Promise<SearchQueryResponse>;
  testConnection(apiKey: string): Promise<{ valid: boolean; latencyMs: number }>;
}

