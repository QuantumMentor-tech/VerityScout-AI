import 'server-only';
import { z } from 'zod';
import type { SearchProviderId } from '@/server/search/contracts';
import { SourceAccessState, ExtractionState } from '@/server/extraction/contracts';
import type { CanonicalHintEvaluation } from '@/server/search/canonicalizer';

/**
 * VerityScout AI — Search Provenance, Deduplication & Counter Contracts
 * Governed by: Step 35 (URL Canonicalization, Source Deduplication, Provenance Tracking, and Search Result Counters)
 *
 * Epistemological Principles:
 * 1. Two search results may refer to the same underlying source, but their discovery history,
 *    retrieval results, and evidence context are not interchangeable.
 * 2. Canonical URL deduplication establishes a controlled source-identity relationship,
 *    not proof that the content is identical, authoritative, or factual.
 * 3. Discoveries are retained as individual provenance events, linked to a single canonical source document.
 */

export const DiscoveryOutcomeSchema = z.enum([
  'NEW_CANONICAL_SOURCE',
  'DUPLICATE_SOURCE_RESOLVED',
  'REJECTED_UNSAFE_URL',
]);
export type DiscoveryOutcome = z.infer<typeof DiscoveryOutcomeSchema>;

/**
 * Audit record of a single search result discovery event.
 * Represents when and how a specific query variant encountered a URL.
 */
export interface SourceDiscoveryRecord {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly runId: string;
  readonly userId: string;
  readonly queryVariantId: string | null;
  readonly queryText: string;
  readonly discoveryProvider: SearchProviderId;
  readonly providerResultId: string | null;
  readonly originalUrl: string;
  readonly title: string;
  readonly snippet: string | null;
  readonly relevanceScore: number | null;
  readonly discoveredAt: string;
}

/**
 * In-memory representation of a canonical source document with associated discovery provenance.
 */
export interface DeduplicatedSourceDocument {
  readonly id: string;
  readonly runId: string;
  readonly userId: string;
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly domain: string;
  readonly title: string;
  readonly discoveryProvider: SearchProviderId;
  readonly accessState: SourceAccessState;
  readonly extractionState: ExtractionState;
  readonly httpStatusCode: number | null;
  readonly contentHash: string | null;
  readonly discoveryCount: number;
  readonly discoveries: readonly SourceDiscoveryRecord[];
  readonly firstDiscoveredAt: string;
  readonly lastDiscoveredAt: string;
  readonly canonicalHint?: CanonicalHintEvaluation | undefined;
}

/**
 * Derived, verifiable search operation counters.
 * All counters are non-fabricated and derive strictly from recorded events.
 */
export interface SearchOperationCounters {
  /** Number of query variants planned for execution */
  readonly plannedQueries: number;
  /** Number of query operations dispatched to search provider */
  readonly executedQueries: number;
  /** Number of query operations whose provider response passed validation */
  readonly successfulQueries: number;
  /** Number of query operations that failed or timed out */
  readonly failedQueries: number;
  /** Total result items received from provider responses before deduplication */
  readonly rawResultsReceived: number;
  /** Result items rejected due to invalid URL syntax or SSRF policy */
  readonly rejectedResults: number;
  /** Total valid discovery records created */
  readonly validDiscoveries: number;
  /** Discoveries resolved to an already-known canonical source within the run */
  readonly duplicateDiscoveries: number;
  /** Unique canonical sources discovered and registered in the run */
  readonly uniqueSourcesDiscovered: number;
  /** Canonical sources successfully extracted */
  readonly sourcesExtracted: number;
  /** Extraction attempts that failed, timed out, or encountered bot challenge */
  readonly extractionFailed: number;
}

/**
 * Summary of a source deduplication and registration operation.
 */
export interface SourceDeduplicationSummary {
  readonly runId: string;
  readonly userId: string;
  readonly totalCandidatesProcessed: number;
  readonly uniqueSourcesCount: number;
  readonly duplicateDiscoveriesCount: number;
  readonly rejectedUrlsCount: number;
  readonly sources: readonly DeduplicatedSourceDocument[];
  readonly counters: SearchOperationCounters;
  readonly durationMs: number;
}

