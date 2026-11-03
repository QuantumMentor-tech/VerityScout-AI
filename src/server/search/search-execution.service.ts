import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ResearchPlan } from '@/server/research/planner/contracts';
import { validateUrl } from '@/server/security';
import {
  type SearchExecutionOptions,
  type SearchExecutionSummary,
  type NormalizedSearchResult,
  type SearchProviderId,
  type SearchQueryRequest,
  SearchProviderError,
  type SearchProviderErrorCode,
} from './contracts';
import { getSearchProviderRegistry } from './registry';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { logger } from '@/lib/logging/logger';

export class SearchExecutionService {
  private readonly credentialService: ProviderCredentialService;

  constructor(credentialService?: ProviderCredentialService) {
    this.credentialService = credentialService ?? new ProviderCredentialService();
  }

  /**
   * Executes a validated research plan within bounded resource limits,
   * normalizes returned source candidates, and validates all URLs through Step 32 SSRF controls.
   */
  async executePlan(
    userId: string,
    plan: ResearchPlan,
    options?: SearchExecutionOptions
  ): Promise<SearchExecutionSummary> {
    const startTime = Date.now();
    const providerId: SearchProviderId = options?.providerId ?? 'tavily';

    // 1. Eligibility Check
    if (plan.status !== 'READY') {
      throw new SearchProviderError(
        'PLAN_NOT_READY',
        `Research plan ${plan.id} is not eligible for search execution. Status is "${plan.status}". Only READY plans can be executed.`,
        { providerId }
      );
    }

    if (!plan.searchQueries || plan.searchQueries.length === 0) {
      throw new SearchProviderError(
        'INVALID_PLAN',
        `Research plan ${plan.id} contains zero search query variants`,
        { providerId }
      );
    }

    // 2. Credential Resolution
    let apiKey = options?.explicitApiKey;
    if (!apiKey) {
      apiKey = (await this.credentialService.getDecryptedCredential(userId, providerId)) ?? undefined;
    }

    if (!apiKey || apiKey.trim().length === 0) {
      throw new SearchProviderError(
        'CREDENTIAL_MISSING',
        `No API key configured for search provider "${providerId}". Please configure provider credentials in Settings.`,
        { providerId }
      );
    }

    // 3. Resolve Provider Adapter
    const registry = getSearchProviderRegistry();
    const adapter = registry.getAdapter(providerId);

    // 4. Bounded Execution Limits (Hard Server-Side Guardrails)
    const maxQueries = Math.min(options?.maxQueries ?? 3, 5); // Hard cap: 5 queries (ADR-005, SEC-035)
    const maxResultsPerQuery = Math.min(options?.maxResultsPerQuery ?? 5, 20); // Hard cap: 20 results (ADR-005)
    const maxAggregateResults = Math.min(options?.maxAggregateResults ?? 50, 100);
    const concurrency = Math.min(options?.concurrency ?? 2, 3); // Bounded concurrency (1 to 3)

    // 5. Extract Domain Constraints
    const excludedDomains: string[] = [];
    for (const constraint of plan.intent.constraints) {
      if (constraint.type === 'EXCLUDED_DOMAIN') {
        if (typeof constraint.normalizedValue === 'string') {
          excludedDomains.push(constraint.normalizedValue);
        } else if (Array.isArray(constraint.normalizedValue)) {
          for (const val of constraint.normalizedValue) {
            if (typeof val === 'string') excludedDomains.push(val);
          }
        }
      }
    }

    // Take bounded query variants
    const targetQueryVariants = plan.searchQueries.slice(0, maxQueries);

    const accumulatedResults: NormalizedSearchResult[] = [];
    const queryErrors: Array<{
      queryId?: string | undefined;
      query: string;
      code: SearchProviderErrorCode;
      message: string;
    }> = [];

    let queriesAttempted = 0;
    let queriesSucceeded = 0;
    let queriesFailed = 0;
    let totalCreditsConsumed = 0;
    let isCancelled = false;

    // 6. Execute Queries with Bounded Concurrency
    for (let i = 0; i < targetQueryVariants.length; i += concurrency) {
      if (options?.signal?.aborted) {
        isCancelled = true;
        break;
      }

      if (accumulatedResults.length >= maxAggregateResults) {
        break;
      }

      const batch = targetQueryVariants.slice(i, i + concurrency);
      const batchPromises = batch.map(async (variant) => {
        if (options?.signal?.aborted) {
          throw new SearchProviderError('CANCELLED', 'Operation was cancelled', { providerId });
        }

        queriesAttempted++;
        const searchReq: SearchQueryRequest = {
          query: variant.query,
          maxResults: maxResultsPerQuery,
          searchDepth: 'QUICK',
          topic: 'general',
          requestId: `${plan.id}-${variant.id}`,
          queryVariantId: variant.id,
          excludeDomains: excludedDomains.length > 0 ? excludedDomains : undefined,
          signal: options?.signal,
        };

        try {
          const resp = await adapter.search(searchReq, apiKey);
          queriesSucceeded++;
          totalCreditsConsumed += resp.usage.searchCreditsConsumed;

          // Normalize each candidate through Step 32 URL validation
          for (const cand of resp.results) {
            if (accumulatedResults.length >= maxAggregateResults) break;

            const urlValidation = validateUrl(cand.url, 'PUBLIC_RESEARCH_SOURCE');
            const normalizedResult: NormalizedSearchResult = {
              id: randomUUID(),
              provider: providerId,
              queryVariantId: variant.id,
              originalUrl: cand.url,
              title: cand.title,
              snippet: cand.snippet,
              publishedDate: cand.publishedDate,
              author: cand.author,
              relevanceScore: cand.relevanceScore,
              providerResultId: cand.providerResultId,
              urlValidation,
              isFetchable: urlValidation.isValid,
              discoveredAt: new Date().toISOString(),
            };

            accumulatedResults.push(normalizedResult);
          }
        } catch (err) {
          queriesFailed++;
          const errCode: SearchProviderErrorCode = err instanceof SearchProviderError
            ? err.code
            : 'UNKNOWN_ERROR';
          const errMsg = err instanceof Error ? err.message : String(err);

          queryErrors.push({
            queryId: variant.id,
            query: variant.query,
            code: errCode,
            message: errMsg,
          });

          if (errCode === 'CANCELLED') {
            isCancelled = true;
          }
        }
      });

      await Promise.all(batchPromises);

      if (isCancelled) break;
    }

    // 7. Calculate Truthful Execution Status
    let status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
    if (isCancelled) {
      status = 'CANCELLED';
    } else if (queriesFailed === 0 && queriesSucceeded > 0) {
      status = 'COMPLETED';
    } else if (queriesSucceeded > 0 && queriesFailed > 0) {
      status = 'PARTIAL';
    } else {
      status = 'FAILED';
    }

    const validSourceCount = accumulatedResults.filter((r) => r.isFetchable).length;
    const invalidSourceCount = accumulatedResults.length - validSourceCount;
    const durationMs = Date.now() - startTime;

    logger.info('SEARCH_PLAN_EXECUTION_COMPLETED', 'Search plan execution finished', {
      planId: plan.id,
      providerId,
      status,
      queriesAttempted,
      queriesSucceeded,
      queriesFailed,
      totalResultsDiscovered: accumulatedResults.length,
      validSourceCount,
      invalidSourceCount,
      durationMs,
    });

    return {
      planId: plan.id,
      providerId,
      status,
      queriesAttempted,
      queriesSucceeded,
      queriesFailed,
      totalResultsDiscovered: accumulatedResults.length,
      validSourceCount,
      invalidSourceCount,
      results: accumulatedResults,
      errors: queryErrors,
      totalCreditsConsumed,
      durationMs,
    };
  }
}

