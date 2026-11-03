import 'server-only';
import { z } from 'zod';
import type { UrlValidationResult } from '@/server/security';

/**
 * VerityScout AI — Search Provider & Execution Contracts
 * Governed by: Step 33 (Search Provider Adapter, Bounded Search Execution, and Source Result Normalization)
 *
 * Traceability:
 * - Requirements: UR-005, UR-006, NFR-005, NFR-007, NFR-009
 * - Acceptance Criteria: AC-005 (Multi-Source Web Search Orchestration), AC-006 (Page Normalization Foundation)
 * - ADRs: ADR-005 (Pluggable Search & Two-Tier Extraction), DEC-006
 */

export const SEARCH_PROVIDER_IDS = ['tavily', 'exa', 'mock_search'] as const;
export type SearchProviderId = (typeof SEARCH_PROVIDER_IDS)[number];

export function isSearchProviderId(val: unknown): val is SearchProviderId {
  return typeof val === 'string' && (SEARCH_PROVIDER_IDS as readonly string[]).includes(val);
}

export const SearchDepthSchema = z.enum(['QUICK', 'BALANCED', 'DEEP']);
export type SearchDepth = z.infer<typeof SearchDepthSchema>;

export const SearchTopicSchema = z.enum(['general', 'news']);
export type SearchTopic = z.infer<typeof SearchTopicSchema>;

/**
 * Internal search query request dispatched to an ISearchProvider adapter.
 */
export const SearchQueryRequestSchema = z.object({
  query: z.string().min(1).max(500),
  maxResults: z.number().int().min(1).max(20).default(5),
  includeDomains: z.array(z.string().min(1)).readonly().optional(),
  excludeDomains: z.array(z.string().min(1)).readonly().optional(),
  searchDepth: SearchDepthSchema.default('QUICK'),
  topic: SearchTopicSchema.default('general'),
  requestId: z.string().min(1),
  queryVariantId: z.string().optional(),
});
export type SearchQueryRequest = z.infer<typeof SearchQueryRequestSchema> & {
  readonly signal?: AbortSignal | undefined;
};

/**
 * Raw candidate returned by a search provider before normalization and URL classification.
 */
export interface SearchCandidate {
  readonly title: string;
  readonly url: string;
  readonly snippet: string | null;
  readonly publishedDate: string | null;
  readonly author: string | null;
  readonly relevanceScore: number | null;
  readonly providerResultId: string | null;
  readonly queryVariantId?: string | undefined;
}

/**
 * Response structure returned by an ISearchProvider adapter.
 */
export interface SearchQueryResponse {
  readonly provider: SearchProviderId;
  readonly query: string;
  readonly results: readonly SearchCandidate[];
  readonly responseId: string | null;
  readonly usage: {
    readonly searchCreditsConsumed: number;
    readonly latencyMs: number;
  };
}

/**
 * Provider-independent normalized search result.
 * Includes URL safety validation from Step 32 without claiming the source has been fetched or verified.
 */
export interface NormalizedSearchResult {
  readonly id: string;
  readonly provider: SearchProviderId;
  readonly queryVariantId: string | null;
  readonly originalUrl: string;
  readonly title: string;
  readonly snippet: string | null;
  readonly publishedDate: string | null;
  readonly author: string | null;
  readonly relevanceScore: number | null;
  readonly providerResultId: string | null;
  readonly urlValidation: UrlValidationResult;
  readonly isFetchable: boolean;
  readonly discoveredAt: string;
}

export type SearchProviderErrorCode =
  | 'INVALID_PLAN'
  | 'PLAN_NOT_READY'
  | 'CREDENTIAL_MISSING'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'CREDITS_EXHAUSTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'RESPONSE_VALIDATION_FAILED'
  | 'TRANSPORT_ERROR'
  | 'UNKNOWN_ERROR';

export class SearchProviderError extends Error {
  public readonly code: SearchProviderErrorCode;
  public readonly providerId?: SearchProviderId | undefined;
  public readonly statusCode?: number | undefined;

  constructor(
    code: SearchProviderErrorCode,
    message: string,
    options?: {
      readonly providerId?: SearchProviderId | undefined;
      readonly statusCode?: number | undefined;
      readonly cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'SearchProviderError';
    this.code = code;
    this.providerId = options?.providerId;
    this.statusCode = options?.statusCode;
  }
}

/**
 * Options for configuring bounded execution in SearchExecutionService.
 */
export interface SearchExecutionOptions {
  readonly providerId?: SearchProviderId | undefined;
  readonly maxQueries?: number | undefined;
  readonly maxResultsPerQuery?: number | undefined;
  readonly maxAggregateResults?: number | undefined;
  readonly concurrency?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly retryCount?: number | undefined;
  readonly explicitApiKey?: string | undefined;
}

/**
 * Summary of a bounded search execution across a validated research plan.
 */
export interface SearchExecutionSummary {
  readonly planId: string;
  readonly providerId: SearchProviderId;
  readonly status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  readonly queriesAttempted: number;
  readonly queriesSucceeded: number;
  readonly queriesFailed: number;
  readonly totalResultsDiscovered: number;
  readonly validSourceCount: number;
  readonly invalidSourceCount: number;
  readonly results: readonly NormalizedSearchResult[];
  readonly errors: ReadonlyArray<{
    readonly queryId?: string | undefined;
    readonly query: string;
    readonly code: SearchProviderErrorCode;
    readonly message: string;
  }>;
  readonly totalCreditsConsumed: number;
  readonly durationMs: number;
}
