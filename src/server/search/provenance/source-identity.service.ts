import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { NormalizedSearchResult } from '@/server/search/contracts';
import { canonicalizeUrl, evaluateCanonicalHint } from '@/server/search/canonicalizer';
import {
  type SourceDiscoveryRecord,
  type DeduplicatedSourceDocument,
  type SourceDeduplicationSummary,
} from './contracts';
import { SearchCounterTracker } from './search-counters';
import {
  SourceDocumentRepository,
  SourceDiscoveryRepository,
} from '@/server/persistence/repositories';
import type { TransactionContext } from '@/server/persistence/transaction';
import { SourceAccessState, ExtractionState } from '@/server/persistence/types';
import { logger } from '@/lib/logging/logger';

export interface DeduplicateOptions {
  readonly runId: string;
  readonly userId: string;
  readonly candidates: readonly NormalizedSearchResult[];
  readonly queryTextsByVariant?: Record<string, string> | undefined;
  readonly tx?: TransactionContext | PoolClient | undefined;
  readonly persist?: boolean | undefined;
}

export class SourceIdentityService {
  private readonly sourceDocRepo: SourceDocumentRepository;
  private readonly sourceDiscoveryRepo: SourceDiscoveryRepository;

  constructor(
    sourceDocRepo?: SourceDocumentRepository,
    sourceDiscoveryRepo?: SourceDiscoveryRepository
  ) {
    this.sourceDocRepo = sourceDocRepo ?? new SourceDocumentRepository();
    this.sourceDiscoveryRepo = sourceDiscoveryRepo ?? new SourceDiscoveryRepository();
  }

  /**
   * Deterministically deduplicates search candidates into canonical source documents
   * while recording discrete discovery events for multi-query provenance auditing.
   */
  async deduplicateAndRecordDiscoveries(
    options: DeduplicateOptions
  ): Promise<SourceDeduplicationSummary> {
    const startTime = Date.now();
    const {
      runId,
      userId,
      candidates,
      queryTextsByVariant = {},
      tx,
      persist = true,
    } = options;

    const counter = new SearchCounterTracker();
    const sourcesByCanonicalUrl = new Map<string, DeduplicatedSourceDocument>();
    let rejectedCount = 0;

    for (const cand of candidates) {
      // 1. Check Step 32 URL validation outcome
      if (!cand.isFetchable || !cand.urlValidation.isValid) {
        counter.recordRejectedResult();
        rejectedCount++;
        logger.info('SOURCE_IDENTITY_REJECTED_UNSAFE_URL', 'Rejected candidate URL due to security or syntax invalidity', {
          originalUrl: cand.originalUrl,
          reason: !cand.urlValidation.isValid ? cand.urlValidation.error : 'Non-fetchable flag set',
        });
        continue;
      }

      // 2. Deterministic Canonicalization
      const canonResult = canonicalizeUrl(cand.originalUrl);
      if (!canonResult.isSuccess || !canonResult.canonicalUrl) {
        counter.recordRejectedResult();
        rejectedCount++;
        logger.info('SOURCE_IDENTITY_CANONICALIZATION_FAILED', 'Failed to canonicalize candidate URL', {
          originalUrl: cand.originalUrl,
          error: canonResult.error,
        });
        continue;
      }

      const canonicalUrl = canonResult.canonicalUrl;
      const domain = canonResult.domain;
      const queryText = (cand.queryVariantId && queryTextsByVariant[cand.queryVariantId]) || 'Unspecified Query';

      // 3. Resolve existing or new in-memory source document
      let doc = sourcesByCanonicalUrl.get(canonicalUrl);

      if (!doc) {
        let sourceDocId: string = randomUUID();

        // 4. Persistence Handling (if enabled and database is available)
        if (persist) {
          try {
            const { document: persistedDoc, isNew } = await this.sourceDocRepo.upsertOrResolve(
              {
                id: sourceDocId,
                run_id: runId,
                user_id: userId,
                original_url: cand.originalUrl,
                canonical_url: canonicalUrl,
                domain,
                title: cand.title,
                discovery_provider: cand.provider,
                access_state: SourceAccessState.ACCESSIBLE,
                extraction_state: ExtractionState.SUCCESS,
              },
              tx
            );
            sourceDocId = persistedDoc.id;
            counter.recordDiscovery(isNew);
          } catch (dbErr) {
            // Log persistence warning and fall back to in-memory ID if DB mock/disconnected
            logger.info('SOURCE_IDENTITY_PERSISTENCE_SKIPPED', 'Database persistence omitted or mock client resolved', {
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
            });
            counter.recordDiscovery(true);
          }
        } else {
          counter.recordDiscovery(true);
        }

        doc = {
          id: sourceDocId,
          runId,
          userId,
          originalUrl: cand.originalUrl,
          canonicalUrl,
          domain,
          title: cand.title,
          discoveryProvider: cand.provider,
          accessState: SourceAccessState.ACCESSIBLE,
          extractionState: ExtractionState.SUCCESS,
          httpStatusCode: null,
          contentHash: null,
          discoveryCount: 0,
          discoveries: [],
          firstDiscoveredAt: cand.discoveredAt,
          lastDiscoveredAt: cand.discoveredAt,
        };
        sourcesByCanonicalUrl.set(canonicalUrl, doc);
      } else {
        // Document already discovered in this batch/run
        counter.recordDiscovery(false);
      }

      // 5. Create Discrete Discovery Record
      const discoveryRecord: SourceDiscoveryRecord = {
        id: randomUUID(),
        sourceDocumentId: doc.id,
        runId,
        userId,
        queryVariantId: cand.queryVariantId,
        queryText,
        discoveryProvider: cand.provider,
        providerResultId: cand.providerResultId,
        originalUrl: cand.originalUrl,
        title: cand.title,
        snippet: cand.snippet,
        relevanceScore: cand.relevanceScore,
        discoveredAt: cand.discoveredAt,
      };

      if (persist) {
        try {
          await this.sourceDiscoveryRepo.create(
            {
              id: discoveryRecord.id,
              source_document_id: doc.id,
              run_id: runId,
              user_id: userId,
              query_variant_id: cand.queryVariantId,
              query_text: queryText,
              discovery_provider: cand.provider,
              provider_result_id: cand.providerResultId,
              original_url: cand.originalUrl,
              title: cand.title,
              snippet: cand.snippet,
              relevance_score: cand.relevanceScore,
              discovered_at: new Date(cand.discoveredAt),
            },
            tx
          );
        } catch (discErr) {
          logger.info('SOURCE_DISCOVERY_PERSISTENCE_SKIPPED', 'Discovery record persistence omitted', {
            error: discErr instanceof Error ? discErr.message : String(discErr),
          });
        }
      }

      // Update in-memory source document state
      sourcesByCanonicalUrl.set(canonicalUrl, {
        ...doc,
        discoveryCount: doc.discoveryCount + 1,
        discoveries: [...doc.discoveries, discoveryRecord],
        lastDiscoveredAt: cand.discoveredAt,
      });
    }

    const aggregatedSources = Array.from(sourcesByCanonicalUrl.values());
    const snapshot = counter.getSnapshot();

    return {
      runId,
      userId,
      totalCandidatesProcessed: candidates.length,
      uniqueSourcesCount: aggregatedSources.length,
      duplicateDiscoveriesCount: snapshot.duplicateDiscoveries,
      rejectedUrlsCount: rejectedCount,
      sources: aggregatedSources,
      counters: snapshot,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Safe evaluation of a page-supplied canonical hint (<link rel="canonical">).
   */
  evaluateHint(hint: string | null | undefined, sourceUrl: string) {
    return evaluateCanonicalHint(hint, sourceUrl);
  }
}
