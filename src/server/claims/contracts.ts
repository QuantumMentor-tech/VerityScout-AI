import 'server-only';
import { z } from 'zod';
import { VerificationState } from '@/server/persistence/types';
import type { ExtractedDocument } from '@/server/extraction/contracts';
import type { AiProviderId } from '@/server/providers/contracts/provider-id';

/**
 * VerityScout AI — Structured Fact Extraction & Claim Representation Contracts
 * Governed by: Step 36 (Structured Fact Extraction, Claim Representation, and Evidence-Linked Attribute Capture)
 *
 * Epistemological Tenets:
 * 1. Extraction answers "What does this source explicitly state, and what passage supports it?"
 * 2. Extraction does NOT equate to truth verification; the source itself may be stale, partial, or biased.
 * 3. Raw source values ("1.4 kg", "$799.99", "Starting at $299") are preserved unaltered (normalization belongs to Step 37).
 * 4. Grounding invariant: Every evidence-backed claim MUST be grounded by an exact verbatim quote verified against the document.
 * 5. Conflicting claims within or across documents are captured distinctly, never silently dropped or reconciled.
 */

export const CLAIM_TYPES = [
  'PROPERTY',
  'PRICE',
  'AVAILABILITY',
  'SPECIFICATION',
  'WARRANTY',
  'COMPATIBILITY',
  'GENERAL_FACT',
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_POLARITIES = ['POSITIVE', 'NEGATIVE'] as const;
export type ClaimPolarity = (typeof CLAIM_POLARITIES)[number];

export const EXTRACTION_STATUSES = ['EXPLICIT', 'INFERRED', 'AMBIGUOUS', 'UNRESOLVED'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const EVIDENCE_GROUNDING_STATUSES = [
  'GROUNDED_EXACT',
  'GROUNDED_NORMALIZED',
  'UNVERIFIED_QUOTE',
  'LOCATOR_UNVERIFIABLE',
] as const;
export type EvidenceGroundingStatus = (typeof EVIDENCE_GROUNDING_STATUSES)[number];

export const EXTRACTION_METHODS = [
  'LLM_STRUCTURED',
  'REGEX_DETERMINISTIC',
  'META_TAG',
  'DOM_SELECTOR',
] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

/**
 * Validated evidence span proving a claim from the source text.
 */
export const EvidenceSpanSchema = z.object({
  verbatimQuote: z.string().min(1, 'Verbatim quote cannot be empty'),
  charOffsetStart: z.number().int().min(0, 'Start offset cannot be negative'),
  charOffsetEnd: z.number().int().min(0, 'End offset cannot be negative'),
  locationInDocument: z.string().optional(),
  groundingStatus: z.enum(EVIDENCE_GROUNDING_STATUSES),
  confidenceScore: z.number().min(0).max(1).default(1.0),
});
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

/**
 * Canonical structured claim representation.
 */
export const ExtractedClaimSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  userId: z.string().min(1),
  subject: z.string().nullable().default(null),
  claimKey: z.string().min(1, 'Claim key cannot be empty'),
  extractedRawValue: z.string().min(1, 'Raw value cannot be empty'),
  claimType: z.enum(CLAIM_TYPES),
  polarity: z.enum(CLAIM_POLARITIES).default('POSITIVE'),
  qualifiers: z.array(z.string()).readonly().default([]),
  evidence: EvidenceSpanSchema,
  extractionStatus: z.enum(EXTRACTION_STATUSES).default('EXPLICIT'),
  extractionMethod: z.enum(EXTRACTION_METHODS),
  verificationState: z.nativeEnum(VerificationState).default(VerificationState.SUPPORTED),
  conflictDetails: z.string().optional(),
  extractedAt: z.string().datetime(),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

/**
 * Raw claim structure returned by an LLM before server-side quote verification.
 */
export const RawModelClaimSchema = z.object({
  subject: z.string().nullable().optional(),
  claim_key: z.string().min(1),
  raw_value: z.string().min(1),
  claim_type: z.enum(CLAIM_TYPES).default('SPECIFICATION'),
  polarity: z.enum(CLAIM_POLARITIES).default('POSITIVE'),
  qualifiers: z.array(z.string()).optional(),
  verbatim_quote: z.string().min(1),
  location_in_document: z.string().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
});
export type RawModelClaim = z.infer<typeof RawModelClaimSchema>;

export const RawModelOutputSchema = z.object({
  claims: z.array(RawModelClaimSchema),
});
export type RawModelOutput = z.infer<typeof RawModelOutputSchema>;

/**
 * Input request for extracting claims from an extracted document.
 */
export interface ClaimExtractionInput {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly userId: string;
  readonly extractedDoc: ExtractedDocument;
  readonly targetAttributes?: readonly string[] | undefined;
  readonly preferredProvider?: AiProviderId | 'rule_based' | undefined;
  readonly modelId?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly persist?: boolean | undefined;
}

export interface RejectedClaimRecord {
  readonly rawClaim: unknown;
  readonly reason: string;
  readonly code: 'UNVERIFIED_QUOTE' | 'SCHEMA_VIOLATION' | 'UNSUPPORTED_TYPE';
}

/**
 * Execution summary returned by the claim extraction service.
 */
export interface ClaimExtractionSummary {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly totalCandidatesFound: number;
  readonly acceptedClaims: readonly ExtractedClaim[];
  readonly rejectedClaims: readonly RejectedClaimRecord[];
  readonly executionMethod: ExtractionMethod;
  readonly durationMs: number;
}
