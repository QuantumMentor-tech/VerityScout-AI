import 'server-only';
import type { SearchProviderId } from '@/server/search/contracts';
import type { ExtractionProviderId } from '@/server/extraction/contracts';
import type { ResearchPlannerService } from '@/server/research/planner/research-planner.service';
import type { SearchExecutionService } from '@/server/search/search-execution.service';
import type { SourceIdentityService } from '@/server/search/provenance/source-identity.service';
import type { SourceExtractionService } from '@/server/extraction/source-extraction.service';
import type { ClaimExtractionService } from '@/server/claims/claim-extraction.service';
import type { ProductNormalizationService } from '@/server/normalization/normalization.service';
import type { ConstraintEvaluationService } from '@/server/evaluation/evaluation.service';
import type { ResearchSynthesisService } from '@/server/synthesis/synthesis.service';
import type { ModelRouterService } from '@/server/models/router/model-router.service';
import type {
  ResearchRunRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
  SourceDocumentRepository,
} from '@/server/persistence/repositories';
import type { ResearchSynthesisOutput } from '@/server/synthesis/contracts';

export interface PipelineExecutionOptions {
  readonly plannerService?: ResearchPlannerService | undefined;
  readonly searchExecutionService?: SearchExecutionService | undefined;
  readonly sourceIdentityService?: SourceIdentityService | undefined;
  readonly sourceExtractionService?: SourceExtractionService | undefined;
  readonly claimExtractionService?: ClaimExtractionService | undefined;
  readonly normalizationService?: ProductNormalizationService | undefined;
  readonly evaluationService?: ConstraintEvaluationService | undefined;
  readonly synthesisService?: ResearchSynthesisService | undefined;
  readonly modelRouter?: ModelRouterService | undefined;
  readonly runRepo?: ResearchRunRepository | undefined;
  readonly candidateRepo?: CandidateResultRepository | undefined;
  readonly evidenceRepo?: EvidenceRecordRepository | undefined;
  readonly sourceDocRepo?: SourceDocumentRepository | undefined;
  readonly searchProviderId?: SearchProviderId | undefined;
  readonly extractionProviderId?: ExtractionProviderId | undefined;
}

export interface PipelineExecutionResult {
  readonly runId: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly totalSourcesScanned: number;
  readonly totalCandidatesFound: number;
  readonly totalClaimsExtracted: number;
  readonly synthesis?: ResearchSynthesisOutput | undefined;
  readonly error?: string | undefined;
}

