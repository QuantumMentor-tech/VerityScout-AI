import 'server-only';
import { z } from 'zod';
import { MatchClassification } from '@/server/persistence/types';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type { ConstraintEvaluationRecord, CandidateConstraintEvaluationSummary } from '@/server/evaluation/contracts';
import type { AiProviderId } from '@/server/providers/contracts/provider-id';

/**
 * VerityScout AI — General Evidence-Linked Research Synthesis Contracts
 * Governed by: Step 40 (General Evidence-Linked Research Synthesis)
 *
 * Epistemological Tenets:
 * 1. Synthesis organizes, compares, and explains available evidence — it does NOT invent facts or consensus.
 * 2. Every material factual assertion must be grounded by and linked to eligible source evidence.
 * 3. Material disagreements, uncertainty, staleness, and missing data must be preserved, never smoothed over.
 * 4. Distinct product variants, SKUs, and conditions must never be conflated.
 * 5. Full cryptographic traceability back to Step 36 claims and Step 34 source documents is mandatory.
 */

export const SYNTHESIS_RULESET_VERSION = 'v1.0';

export const FINDING_TYPES = ['FACTUAL', 'COMPARISON', 'INTERPRETATION', 'LIMITATION'] as const;
export type FindingType = (typeof FINDING_TYPES)[number];
export const FindingTypeSchema = z.enum(FINDING_TYPES);

export const SYNTHESIS_STATUSES = ['SUCCESS', 'PARTIAL', 'EMPTY', 'FAILED'] as const;
export type SynthesisStatus = (typeof SYNTHESIS_STATUSES)[number];
export const SynthesisStatusSchema = z.enum(SYNTHESIS_STATUSES);

export const CITATION_VALIDATION_STATUSES = [
  'VALID',
  'UNRESOLVED_QUOTE',
  'FABRICATED_ID',
  'CROSS_TENANT_REJECTED',
] as const;
export type CitationValidationStatus = (typeof CITATION_VALIDATION_STATUSES)[number];
export const CitationValidationStatusSchema = z.enum(CITATION_VALIDATION_STATUSES);

/**
 * Structured citation representing an explicit evidence link to an underlying source claim.
 */
export const SupportingCitationSchema = z.object({
  id: z.string().min(1),
  claimId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().min(1),
  verbatimQuote: z.string().min(1),
  charOffsets: z
    .object({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    })
    .optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  claimKey: z.string().optional(),
  claimType: z.string().optional(),
  publicationDate: z.string().optional(),
  validationStatus: CitationValidationStatusSchema.default('VALID'),
});
export type SupportingCitation = z.infer<typeof SupportingCitationSchema>;

/**
 * An individual synthesized finding with explicit sentence-level citation references.
 */
export const StructuredFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  statement: z.string().min(1),
  citationIds: z.array(z.string()).readonly().default([]),
  findingType: FindingTypeSchema.default('FACTUAL'),
  isDecisive: z.boolean().default(false),
});
export type StructuredFinding = z.infer<typeof StructuredFindingSchema>;

/**
 * Material conflict preserved across multiple sources.
 */
export const SynthesisConflictSchema = z.object({
  topic: z.string().min(1),
  explanation: z.string().min(1),
  conflictingClaimIds: z.array(z.string()).readonly().default([]),
  conflictingCitationIds: z.array(z.string()).readonly().default([]),
});
export type SynthesisConflict = z.infer<typeof SynthesisConflictSchema>;

/**
 * Unresolved question, missing evidence, or research limitation.
 */
export const SynthesisUncertaintySchema = z.object({
  topic: z.string().min(1),
  description: z.string().min(1),
  unresolvedReasonCode: z.string().optional(),
});
export type SynthesisUncertainty = z.infer<typeof SynthesisUncertaintySchema>;

/**
 * Candidate comparison row summarizing constraint outcomes and match classification.
 */
export const CandidateComparisonRowSchema = z.object({
  candidateId: z.string().min(1),
  title: z.string().min(1),
  matchClassification: z.nativeEnum(MatchClassification),
  classificationReason: z.string().optional(),
  keyAttributes: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  passedConstraints: z.array(z.string()).readonly().default([]),
  failedConstraints: z.array(z.string()).readonly().default([]),
  unresolvedConstraints: z.array(z.string()).readonly().default([]),
  primaryMismatchReason: z.string().optional(),
});
export type CandidateComparisonRow = z.infer<typeof CandidateComparisonRowSchema>;

/**
 * Metadata covering the execution context and completeness of research synthesis.
 */
export const SynthesisMetadataSchema = z.object({
  synthesizedAt: z.string().datetime(),
  rulesetVersion: z.string().default(SYNTHESIS_RULESET_VERSION),
  synthesizerStrategy: z.enum(['RULE_BASED', 'AI_PROVIDER']),
  modelUsed: z.string().optional(),
  evidenceCoverage: z.object({
    totalEligibleClaims: z.number().int().min(0),
    citedClaimsCount: z.number().int().min(0),
    sourcesCount: z.number().int().min(0),
  }),
  durationMs: z.number().int().min(0),
});
export type SynthesisMetadata = z.infer<typeof SynthesisMetadataSchema>;

/**
 * The canonical evidence-linked research synthesis response.
 */
export const ResearchSynthesisOutputSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  userId: z.string().min(1),
  query: z.string().min(1),
  status: SynthesisStatusSchema,
  directAnswer: z.string().min(1),
  keyFindings: z.array(StructuredFindingSchema).readonly().default([]),
  supportingCitations: z.array(SupportingCitationSchema).readonly().default([]),
  conflicts: z.array(SynthesisConflictSchema).readonly().default([]),
  uncertaintiesAndLimitations: z.array(SynthesisUncertaintySchema).readonly().default([]),
  candidateComparisons: z.array(CandidateComparisonRowSchema).readonly().default([]),
  metadata: SynthesisMetadataSchema,
});
export type ResearchSynthesisOutput = z.infer<typeof ResearchSynthesisOutputSchema>;

/**
 * Input bundle supplied to the research synthesis service.
 */
export interface SourceDocumentReference {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly domain?: string | undefined;
  readonly publishedAt?: string | undefined;
}

export interface ResearchSynthesisInput {
  readonly runId: string;
  readonly userId: string;
  readonly query: string;
  readonly claims: readonly ExtractedClaim[];
  readonly sources: readonly SourceDocumentReference[];
  readonly evaluations?: readonly ConstraintEvaluationRecord[] | undefined;
  readonly candidateSummaries?: readonly CandidateConstraintEvaluationSummary[] | undefined;
  readonly preferredStrategy?: 'rule_based' | 'ai_provider' | undefined;
  readonly providerId?: AiProviderId | undefined;
  readonly modelId?: string | undefined;
  readonly useAutoPick?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
}
