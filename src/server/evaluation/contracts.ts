import 'server-only';
import { z } from 'zod';
import {
  ConstraintPrioritySchema,
  ConstraintOperatorSchema,
  ConstraintTypeSchema,
} from '@/server/research/planner/contracts';

/**
 * VerityScout AI — Deterministic Hard Constraints, Evidence States & Constraint Evaluation Contracts
 * Governed by: Step 38 (Deterministic Hard Constraints, Evidence States, and Constraint Evaluation)
 *
 * Epistemological Tenets:
 * 1. A constraint evaluation is a structured assessment of available evidence against a declared rule.
 * 2. It is NOT a guarantee of factual truth, product suitability, or final result classification.
 * 3. Deterministic evaluation requires pure, reproducible logic — NO generative AI judgments as the final comparator.
 * 4. Missing evidence must NEVER be converted to false, zero, or assumed satisfaction.
 * 5. Materially conflicting evidence across sources must be preserved, not arbitrarily reconciled.
 * 6. Differently denominated currencies and cross-dimensional units must NEVER be compared.
 * 7. Every evaluation preserves cryptographic traceability back to Step 36 claims and Step 37 normalized attributes.
 */

export const EVALUATION_RULESET_VERSION = 'v1.0';

/**
 * Substantive outcomes of evaluating an individual constraint against available evidence.
 */
export const EVALUATION_STATES = [
  'SATISFIED',            // Eligible evidence supports the declared constraint
  'VIOLATED',             // Eligible evidence proves the constraint is violated (or exclusion met)
  'UNKNOWN',              // Insufficient or absent evidence to decide
  'CONFLICTING_EVIDENCE', // Materially conflicting claims prevent a single conclusion
  'NOT_COMPARABLE',       // Incompatible units, currencies, or unsupported comparison types
  'INVALID_CONSTRAINT',   // Constraint definition is malformed, missing, or unsupported
] as const;
export type EvaluationState = (typeof EVALUATION_STATES)[number];
export const EvaluationStateSchema = z.enum(EVALUATION_STATES);

/**
 * Standardized reason codes explaining why an evaluation reached its state.
 */
export const EVALUATION_REASON_CODES = [
  // Bounds & Values
  'VALUE_WITHIN_ALLOWED_BOUND',
  'VALUE_OUTSIDE_ALLOWED_BOUND',
  'EXPLICIT_REQUIRED_FEATURE_PRESENT',
  'EXPLICIT_REQUIRED_FEATURE_ABSENT',
  'EXPLICIT_EXCLUSION_VIOLATED',
  'EXCLUSION_SATISFIED',

  // Evidence Completeness & Quality
  'ATTRIBUTE_EVIDENCE_MISSING',
  'ATTRIBUTE_VALUE_AMBIGUOUS',
  'APPROXIMATE_VALUE_UNCERTAIN',
  'CONFLICTING_ELIGIBLE_CLAIMS',

  // Incompatibility & Type Mismatches
  'INCOMPATIBLE_MEASUREMENT_DIMENSION',
  'CURRENCY_MISMATCH',
  'CURRENCY_UNRESOLVED',
  'PRICE_SEMANTICS_INCOMPATIBLE',

  // Constraint Definition & Evaluation System
  'INVALID_CONSTRAINT_DEFINITION',
  'NORMALIZATION_UNAVAILABLE',
  'UNSUPPORTED_COMPARATOR',
  'EVIDENCE_SCOPE_MISMATCH',
] as const;
export type EvaluationReasonCode = (typeof EVALUATION_REASON_CODES)[number];
export const EvaluationReasonCodeSchema = z.enum(EVALUATION_REASON_CODES);

/**
 * Traceable link to an originating Step 36 claim and Step 34 source document.
 */
export const EvidenceReferenceSchema = z.object({
  claimId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  verbatimQuote: z.string(),
  charOffsets: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  }).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  claimKey: z.string().optional(),
  claimType: z.string().optional(),
});
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

/**
 * Detailed record of a single constraint evaluation.
 */
export const ConstraintEvaluationRecordSchema = z.object({
  id: z.string().min(1),
  constraintId: z.string().min(1),
  constraintKey: z.string().min(1),
  constraintType: ConstraintTypeSchema,
  constraintPriority: ConstraintPrioritySchema,
  operator: ConstraintOperatorSchema,
  targetValue: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()).readonly(),
  ]),
  targetUnitOrCurrency: z.string().optional(),
  state: EvaluationStateSchema,
  reasonCode: EvaluationReasonCodeSchema,
  explanation: z.string().min(1),
  evidenceReferences: z.array(EvidenceReferenceSchema).readonly().default([]),
  actualComparableValue: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()).readonly(),
  ]).optional(),
  actualUnitOrCurrency: z.string().optional(),
  isApproximate: z.boolean().default(false),
  isRange: z.boolean().default(false),
  evaluatedAt: z.string().datetime(),
  rulesetVersion: z.string().default(EVALUATION_RULESET_VERSION),
});
export type ConstraintEvaluationRecord = z.infer<typeof ConstraintEvaluationRecordSchema>;

/**
 * Partitioned summary of evaluations for a specific constraint priority.
 */
export const PriorityEvaluationSummarySchema = z.object({
  total: z.number().int().min(0),
  satisfied: z.number().int().min(0),
  violated: z.number().int().min(0),
  unresolved: z.number().int().min(0), // UNKNOWN + CONFLICTING_EVIDENCE + NOT_COMPARABLE + INVALID_CONSTRAINT
});
export type PriorityEvaluationSummary = z.infer<typeof PriorityEvaluationSummarySchema>;

/**
 * Candidate-level provisional evaluation summary.
 * Strictly distinct from Step 39 final classification (exact_match, near_match, stale, etc.).
 */
export const CandidateConstraintEvaluationSummarySchema = z.object({
  candidateId: z.string().min(1),
  runId: z.string().min(1),
  userId: z.string().min(1),
  totalConstraintsEvaluated: z.number().int().min(0),
  satisfiedCount: z.number().int().min(0),
  violatedCount: z.number().int().min(0),
  unknownCount: z.number().int().min(0),
  conflictingCount: z.number().int().min(0),
  notComparableCount: z.number().int().min(0),
  invalidCount: z.number().int().min(0),
  requiredSummary: PriorityEvaluationSummarySchema,
  excludedSummary: PriorityEvaluationSummarySchema,
  preferredSummary: PriorityEvaluationSummarySchema,
  evaluations: z.array(ConstraintEvaluationRecordSchema).readonly(),
  passedConstraintKeys: z.array(z.string()).readonly(),
  failedConstraintKeys: z.array(z.string()).readonly(),
  unresolvedConstraintKeys: z.array(z.string()).readonly(),
  primaryMismatchReason: z.string().optional(),
  evaluatedAt: z.string().datetime(),
  rulesetVersion: z.string().default(EVALUATION_RULESET_VERSION),
});
export type CandidateConstraintEvaluationSummary = z.infer<
  typeof CandidateConstraintEvaluationSummarySchema
>;

/**
 * Shape expected by CandidateResultRow.constraint_evaluation for database persistence.
 */
export interface CandidateResultDbConstraintJson {
  readonly passedConstraints: readonly string[];
  readonly failedConstraints: readonly string[];
  readonly mismatchReason?: string | undefined;
}

/**
 * Helper to serialize CandidateConstraintEvaluationSummary into CandidateResultDbConstraintJson.
 */
export function formatEvaluationForDb(
  summary: CandidateConstraintEvaluationSummary,
): CandidateResultDbConstraintJson {
  return {
    passedConstraints: summary.passedConstraintKeys,
    failedConstraints: summary.failedConstraintKeys,
    ...(summary.primaryMismatchReason ? { mismatchReason: summary.primaryMismatchReason } : {}),
  };
}

/**
 * Input context for evaluating a candidate result against research constraints.
 */
export interface EvaluationContext {
  readonly candidateId: string;
  readonly runId: string;
  readonly userId: string;
  readonly candidateTitle: string;
  readonly canonicalUrl: string;
  readonly sellerOrDomain: string;
}
