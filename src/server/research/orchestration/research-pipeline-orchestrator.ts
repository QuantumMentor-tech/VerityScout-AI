import 'server-only';
import { randomUUID } from 'node:crypto';
import { RunStatus, RunStage, MatchClassification } from '@/server/persistence/types';
import { ResearchPlannerService } from '@/server/research/planner/research-planner.service';
import { SearchExecutionService } from '@/server/search/search-execution.service';
import { SourceIdentityService } from '@/server/search/provenance/source-identity.service';
import { SourceExtractionService } from '@/server/extraction/source-extraction.service';
import { ClaimExtractionService } from '@/server/claims/claim-extraction.service';
import { ProductNormalizationService } from '@/server/normalization/normalization.service';
import { ConstraintEvaluationService } from '@/server/evaluation/evaluation.service';
import { ResearchSynthesisService } from '@/server/synthesis/synthesis.service';
import { ModelRouterService } from '@/server/models/router/model-router.service';
import {
  ResearchRunRepository,
  CandidateResultRepository,
} from '@/server/persistence/repositories';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import type { ClaimedResearchJob } from '@/server/queue/queue.types';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type {
  PipelineExecutionOptions,
  PipelineExecutionResult,
} from './orchestration.types';
import { logger } from '@/lib/logging/logger';

export class ResearchPipelineOrchestrator {
  private readonly plannerService: ResearchPlannerService;
  private readonly searchExecutionService: SearchExecutionService;
  private readonly sourceIdentityService: SourceIdentityService;
  private readonly sourceExtractionService: SourceExtractionService;
  private readonly claimExtractionService: ClaimExtractionService;
  private readonly normalizationService: ProductNormalizationService;
  private readonly evaluationService: ConstraintEvaluationService;
  private readonly synthesisService: ResearchSynthesisService;
  private readonly modelRouter: ModelRouterService;
  private readonly credentialService: ProviderCredentialService;
  private readonly runRepo: ResearchRunRepository;
  private readonly candidateRepo: CandidateResultRepository;
  private readonly searchProviderId?: string | undefined;
  private readonly extractionProviderId?: string | undefined;

  constructor(options?: PipelineExecutionOptions) {
    this.plannerService = options?.plannerService ?? new ResearchPlannerService();
    this.searchExecutionService = options?.searchExecutionService ?? new SearchExecutionService();
    this.sourceIdentityService = options?.sourceIdentityService ?? new SourceIdentityService(options?.sourceDocRepo);
    this.sourceExtractionService = options?.sourceExtractionService ?? new SourceExtractionService();
    this.claimExtractionService = options?.claimExtractionService ?? new ClaimExtractionService({ evidenceRepo: options?.evidenceRepo });
    this.normalizationService = options?.normalizationService ?? new ProductNormalizationService();
    this.evaluationService = options?.evaluationService ?? new ConstraintEvaluationService();
    this.synthesisService = options?.synthesisService ?? new ResearchSynthesisService();
    this.modelRouter = options?.modelRouter ?? new ModelRouterService();
    this.credentialService = new ProviderCredentialService();
    this.runRepo = options?.runRepo ?? new ResearchRunRepository();
    this.candidateRepo = options?.candidateRepo ?? new CandidateResultRepository();
    this.searchProviderId = options?.searchProviderId;
    this.extractionProviderId = options?.extractionProviderId;
  }

  /**
   * Executes the full Step 31–42 research pipeline on a claimed job instance.
   */
  async execute(job: ClaimedResearchJob): Promise<PipelineExecutionResult> {
    const startTime = Date.now();
    const { runId, userId } = job;

    logger.info('PIPELINE_RUN_STARTED', 'Starting asynchronous research pipeline execution', {
      runId,
      taskId: job.taskId,
      userId,
      query: job.payload.query,
    });

    try {
      // 1. Stage: PLANNING (Step 31)
      await this.runRepo.updateStatus(runId, RunStatus.RUNNING, RunStage.PLANNING, undefined, userId);

      const plan = await this.plannerService.planResearch({
        rawQuery: job.payload.query,
        structuredConstraints: job.payload.constraints as Record<string, unknown> | undefined,
      });

      // 2. Model Routing check (Step 42)
      try {
        await this.modelRouter.route({
          operationType: 'claim_extraction',
          userId,
          correlationId: `run-${runId}-claims`,
        });
        await this.modelRouter.route({
          operationType: 'research_synthesis',
          userId,
          correlationId: `run-${runId}-synthesis`,
        });
      } catch (routerErr) {
        logger.warn('ROUTER_EVALUATION_FALLBACK', 'Router auto-pick fallback applied', {
          runId,
          error: routerErr instanceof Error ? routerErr.message : String(routerErr),
        });
      }

      // 3. Stage: SEARCHING (Steps 33 & 35)
      await this.runRepo.updateStatus(runId, RunStatus.RUNNING, RunStage.SEARCHING, undefined, userId);

      // Resolve search provider & credentials gracefully
      let providerId = this.searchProviderId ?? 'tavily';
      let explicitApiKey: string | undefined = undefined;

      if (!this.searchProviderId) {
        let hasTavilyKey = false;
        let hasExaKey = false;
        try {
          hasTavilyKey = Boolean(await this.credentialService.getDecryptedCredential(userId, 'tavily'));
          hasExaKey = Boolean(await this.credentialService.getDecryptedCredential(userId, 'exa'));
        } catch {
          // If vault is unreachable in offline/test environment, proceed to mock fallback
        }

        if (hasTavilyKey) {
          providerId = 'tavily';
        } else if (hasExaKey) {
          providerId = 'exa';
        } else {
          // In offline/dev/fixture environments without paid keys, use mock_search
          providerId = 'mock_search';
          explicitApiKey = 'mock-key';
        }
      } else if (this.searchProviderId === 'mock_search') {
        explicitApiKey = 'mock-key';
      }

      const searchSummary = await this.searchExecutionService.executePlan(
        userId,
        plan,
        {
          providerId: providerId as 'tavily' | 'exa' | 'mock_search',
          explicitApiKey,
          maxQueries: 3,
          maxResultsPerQuery: 5,
        }
      );

      // Record discoveries & deduplicate canonical sources (Step 35)
      const queryTextsByVariant = Object.fromEntries(
        plan.searchQueries.map((q) => [q.id, q.query])
      );

      const deduplicationSummary = await this.sourceIdentityService.deduplicateAndRecordDiscoveries({
        runId,
        userId,
        candidates: searchSummary.results,
        queryTextsByVariant,
        persist: true,
      });

      await this.runRepo.updateCounters(runId, {
        queriesExecuted: searchSummary.queriesAttempted,
        sourcesDiscovered: searchSummary.totalResultsDiscovered,
        sourcesExtracted: 0,
        claimsVerified: 0,
      });

      // 4. Stage: EXTRACTING (Step 34)
      await this.runRepo.updateStatus(runId, RunStatus.RUNNING, RunStage.EXTRACTING, undefined, userId);

      const extractionInputs = searchSummary.results.slice(0, 5);
      const extractionSummary = await this.sourceExtractionService.extractBatch(
        userId,
        extractionInputs,
        {
          providerId: (this.extractionProviderId as 'direct_safe_fetch' | 'firecrawl' | 'mock_extract') ?? 'direct_safe_fetch',
          maxUrls: 5,
        }
      );

      await this.runRepo.updateCounters(runId, {
        queriesExecuted: searchSummary.queriesAttempted,
        sourcesDiscovered: searchSummary.totalResultsDiscovered,
        sourcesExtracted: extractionSummary.totalSuccessful,
        claimsVerified: 0,
      });

      // 5. Stage: VERIFYING & CLAIM EXTRACTION (Step 36)
      await this.runRepo.updateStatus(runId, RunStatus.RUNNING, RunStage.VERIFYING, undefined, userId);

      const allClaims: ExtractedClaim[] = [];
      const sourcesForSynthesis: Array<{
        id: string;
        url: string;
        domain: string;
        title: string;
        publisher?: string | undefined;
        publishedAt?: string | undefined;
      }> = [];

      for (const doc of extractionSummary.documents) {
        // Resolve matching deduplicated source document
        const matchingSource = deduplicationSummary.sources.find(
          (s) => s.canonicalUrl === doc.requestedUrl || s.canonicalUrl === doc.finalUrl
        );
        const sourceDocId = matchingSource?.id ?? doc.id;

        sourcesForSynthesis.push({
          id: sourceDocId,
          url: doc.finalUrl ?? doc.requestedUrl,
          domain: doc.domain,
          title: doc.title ?? doc.domain ?? 'Untitled Source',
          publisher: doc.publisher ?? undefined,
        });

        try {
          const claimSummary = await this.claimExtractionService.extractClaims({
            runId,
            sourceDocumentId: sourceDocId,
            userId,
            extractedDoc: doc,
            persist: true,
          });
          allClaims.push(...claimSummary.acceptedClaims);
        } catch (claimErr) {
          logger.warn('CLAIM_EXTRACTION_PARTIAL_ERROR', 'Failed to extract claims from document', {
            runId,
            sourceDocumentId: sourceDocId,
            error: claimErr instanceof Error ? claimErr.message : String(claimErr),
          });
        }
      }

      await this.runRepo.updateCounters(runId, {
        queriesExecuted: searchSummary.queriesAttempted,
        sourcesDiscovered: searchSummary.totalResultsDiscovered,
        sourcesExtracted: extractionSummary.totalSuccessful,
        claimsVerified: allClaims.length,
      });

      // 6. Stage: NORMALIZATION & CONSTRAINT EVALUATION (Steps 37–39)
      const normalizationSummary = this.normalizationService.normalizeClaims(runId, allClaims);

      // Create candidates based on normalized claims or search discoveries
      const candidateList: Array<{
        id: string;
        name: string;
        classification: MatchClassification;
        brand: string | null;
        modelNumber: string | null;
        priceNumeric: string | null;
        currencyCode: string;
        availabilityStatus: string | null;
        primarySourceUrl: string | null;
        specifications: Record<string, unknown>;
        conflicts: Record<string, unknown>;
        exclusionReason: string | null;
        evidenceLinks: Array<{ evidence_record_id: string; claim_type?: string }>;
      }> = [];

      // Group claims by entity / source to form discrete candidates
      const claimsBySource = new Map<string, ExtractedClaim[]>();
      for (const claim of allClaims) {
        const list = claimsBySource.get(claim.sourceDocumentId) ?? [];
        list.push(claim);
        claimsBySource.set(claim.sourceDocumentId, list);
      }

      // If no claims extracted, create fallback provisional candidates from discovered sources
      if (claimsBySource.size === 0 && deduplicationSummary.sources.length > 0) {
        for (const s of deduplicationSummary.sources.slice(0, 3)) {
          candidateList.push({
            id: randomUUID(),
            name: s.title || s.domain,
            classification: MatchClassification.PARTIALLY_VERIFIED,
            brand: null,
            modelNumber: null,
            priceNumeric: null,
            currencyCode: 'USD',
            availabilityStatus: 'UNKNOWN',
            primarySourceUrl: s.canonicalUrl,
            specifications: {},
            conflicts: {},
            exclusionReason: null,
            evidenceLinks: [],
          });
        }
      } else {
        let index = 1;
        for (const [sourceId, srcClaims] of claimsBySource.entries()) {
          const matchingSource = deduplicationSummary.sources.find((s) => s.id === sourceId);
          const candidateId = randomUUID();
          const candidateName = matchingSource?.title || `Candidate Option ${index++}`;

          // Evaluate candidate against constraints
          const evalSummary = this.evaluationService.evaluateCandidate(
            {
              candidateId,
              runId,
              userId,
              candidateTitle: candidateName,
              canonicalUrl: matchingSource?.canonicalUrl ?? '',
              sellerOrDomain: matchingSource?.domain ?? 'unknown',
            },
            plan.intent.constraints,
            srcClaims,
            normalizationSummary.attributes,
            normalizationSummary.comparableAttributes
          );

          let classification = MatchClassification.NEAR_MATCH;
          let exclusionReason: string | null = null;

          if (evalSummary.violatedCount > 0) {
            classification = MatchClassification.EXCLUDED;
            exclusionReason = evalSummary.primaryMismatchReason ?? 'Violated required constraints';
          } else if (evalSummary.satisfiedCount === plan.intent.constraints.length && plan.intent.constraints.length > 0) {
            classification = MatchClassification.EXACT_MATCH;
          } else if (evalSummary.unknownCount > 0) {
            classification = MatchClassification.PARTIALLY_VERIFIED;
          }

          // Build specifications map from claims
          const specs: Record<string, unknown> = {};
          for (const c of srcClaims) {
            specs[c.claimKey] = c.extractedRawValue;
          }

          candidateList.push({
            id: candidateId,
            name: candidateName,
            classification,
            brand: null,
            modelNumber: null,
            priceNumeric: null,
            currencyCode: 'USD',
            availabilityStatus: 'IN_STOCK',
            primarySourceUrl: matchingSource?.canonicalUrl ?? null,
            specifications: specs,
            conflicts: {},
            exclusionReason,
            evidenceLinks: srcClaims.map((c) => ({
              evidence_record_id: c.id,
              claim_type: c.claimType,
            })),
          });
        }
      }

      // 7. Stage: SYNTHESIZING (Step 40)
      await this.runRepo.updateStatus(runId, RunStatus.RUNNING, RunStage.SYNTHESIZING, undefined, userId);

      const synthesisSources = sourcesForSynthesis.length > 0
        ? sourcesForSynthesis
        : deduplicationSummary.sources.map((s) => ({
            id: s.id,
            url: s.canonicalUrl,
            domain: s.domain,
            title: s.title,
            publisher: undefined,
          }));

      const synthesisOutput = await this.synthesisService.synthesize({
        runId,
        userId,
        query: job.payload.query,
        claims: allClaims,
        sources: synthesisSources,
        preferredStrategy: 'ai_provider',
      });

      // 8. Stage: FINALIZING & PERSISTENCE
      await this.runRepo.updateStatus(runId, RunStatus.RUNNING, RunStage.FINALIZING, undefined, userId);

      // Persist candidate results with linked evidence
      for (const candidate of candidateList) {
        try {
          await this.candidateRepo.createWithEvidence({
            id: candidate.id,
            run_id: runId,
            user_id: userId,
            name: candidate.name,
            match_classification: candidate.classification,
            brand: candidate.brand,
            model_number: candidate.modelNumber,
            price_numeric: candidate.priceNumeric,
            currency_code: candidate.currencyCode,
            availability_status: candidate.availabilityStatus,
            primary_source_url: candidate.primarySourceUrl,
            specifications: candidate.specifications,
            conflicts: candidate.conflicts,
            exclusion_reason: candidate.exclusionReason,
            evidence_links: candidate.evidenceLinks,
          });
        } catch (candErr) {
          logger.warn('CANDIDATE_PERSIST_ERROR', 'Failed to persist candidate result', {
            runId,
            candidateId: candidate.id,
            error: candErr instanceof Error ? candErr.message : String(candErr),
          });
        }
      }

      const durationMs = Date.now() - startTime;

      // Mark run as COMPLETED with synthesis output
      await this.runRepo.updateStatus(
        runId,
        RunStatus.COMPLETED,
        RunStage.FINALIZING,
        {
          completed_at: new Date(),
          progress_percent: 100,
          execution_duration_ms: durationMs,
          synthesis: synthesisOutput as unknown as Record<string, unknown>,
        },
        userId
      );

      logger.info('PIPELINE_RUN_COMPLETED', 'Research pipeline run finished successfully', {
        runId,
        durationMs,
        sourcesCount: deduplicationSummary.sources.length,
        claimsCount: allClaims.length,
        candidatesCount: candidateList.length,
      });

      return {
        runId,
        success: true,
        durationMs,
        totalSourcesScanned: deduplicationSummary.sources.length,
        totalCandidatesFound: candidateList.length,
        totalClaimsExtracted: allClaims.length,
        synthesis: synthesisOutput,
      };
    } catch (fatalError: unknown) {
      const durationMs = Date.now() - startTime;
      const safeMessage =
        fatalError instanceof Error
          ? fatalError.message
          : 'An unexpected internal error occurred during research execution';

      logger.error('PIPELINE_RUN_FAILED', 'Research pipeline encountered fatal error', {
        runId,
        durationMs,
        error: safeMessage,
      });

      try {
        await this.runRepo.updateStatus(
          runId,
          RunStatus.FAILED,
          RunStage.FINALIZING,
          {
            completed_at: new Date(),
            error_message: safeMessage,
            execution_duration_ms: durationMs,
          },
          userId
        );
      } catch (repoErr) {
        logger.error('PIPELINE_RUN_STATUS_UPDATE_FAILED', 'Failed to update run status to FAILED', {
          runId,
          error: repoErr instanceof Error ? repoErr.message : String(repoErr),
        });
      }

      return {
        runId,
        success: false,
        durationMs,
        totalSourcesScanned: 0,
        totalCandidatesFound: 0,
        totalClaimsExtracted: 0,
        error: safeMessage,
      };
    }
  }
}
