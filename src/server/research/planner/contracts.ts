import 'server-only';
import { z } from 'zod';
import { TaskType } from '@/server/persistence/types';

/**
 * VerityScout AI — Research Query Parsing & Planning Contracts
 * Governed by: Step 31 (Research Query Parsing, Constraint-Aware Query Planning, and Search Intent Normalization)
 *
 * Traceability:
 * - Requirements: UR-001, UR-002, UR-003, UR-004
 * - Acceptance Criteria: AC-002 (Structured Query Specification Parsing), AC-003 (Interactive Disambiguation), AC-004 (Multi-Engine Query Planning)
 * - Domain Contracts: DATA_CONTRACTS.md (ResearchTask, ResearchRun, TaskType)
 */

export const ConstraintPrioritySchema = z.enum(['REQUIRED', 'PREFERRED', 'EXCLUDED']);
export type ConstraintPriority = z.infer<typeof ConstraintPrioritySchema>;

export const ConstraintTypeSchema = z.enum([
  'PRICE_CEILING',
  'PRICE_FLOOR',
  'CONDITION',
  'BRAND',
  'SPECIFICATION',
  'EXCLUDED_KEYWORD',
  'EXCLUDED_DOMAIN',
  'GENERIC',
]);
export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;

export const ConstraintOperatorSchema = z.enum(['EQ', 'LTE', 'GTE', 'IN', 'NOT_IN', 'BETWEEN']);
export type ConstraintOperator = z.infer<typeof ConstraintOperatorSchema>;

export const PlanningProvenanceSchema = z.enum(['EXPLICIT_USER', 'DETERMINISTIC_EXTRACTION', 'AI_INFERRED']);
export type PlanningProvenance = z.infer<typeof PlanningProvenanceSchema>;

export const PlanStatusSchema = z.enum(['READY', 'NEEDS_CLARIFICATION', 'INVALID']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const SearchQueryAngleSchema = z.enum([
  'PRIMARY',
  'SPECIFICATION_FOCUSED',
  'PRICE_AND_DEALS',
  'RETAILER_AGGREGATOR',
  'ALTERNATIVE_COMPARISON',
]);
export type SearchQueryAngle = z.infer<typeof SearchQueryAngleSchema>;

export const PlanWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  field: z.string().optional(),
});
export type PlanWarning = z.infer<typeof PlanWarningSchema>;

export const PlanAmbiguityCodeSchema = z.enum([
  'MISSING_CURRENCY',
  'AMBIGUOUS_ENTITY',
  'CONFLICTING_CONSTRAINTS',
  'UNCLEAR_RANGE',
  'AMBIGUOUS_UNIT',
]);
export type PlanAmbiguityCode = z.infer<typeof PlanAmbiguityCodeSchema>;

export const PlanAmbiguitySchema = z.object({
  code: PlanAmbiguityCodeSchema,
  message: z.string().min(1),
  field: z.string().min(1),
  suggestedResolutions: z.array(z.string()).readonly().optional(),
});
export type PlanAmbiguity = z.infer<typeof PlanAmbiguitySchema>;

export const NormalizedConstraintSchema = z.object({
  id: z.string().min(1),
  type: ConstraintTypeSchema,
  priority: ConstraintPrioritySchema,
  key: z.string().min(1),
  operator: ConstraintOperatorSchema,
  rawValue: z.string(),
  normalizedValue: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()).readonly(),
  ]),
  unitOrCurrency: z.string().optional(),
  provenance: PlanningProvenanceSchema,
});
export type NormalizedConstraint = z.infer<typeof NormalizedConstraintSchema>;

export const TaskTypeSchema = z.nativeEnum(TaskType);

export const NormalizedResearchIntentSchema = z.object({
  originalQuery: z.string().min(1),
  normalizedQuery: z.string().min(1),
  taskType: TaskTypeSchema,
  targetEntity: z.string().min(1),
  extractedCategory: z.string().optional(),
  constraints: z.array(NormalizedConstraintSchema).readonly(),
  provenance: PlanningProvenanceSchema,
});
export type NormalizedResearchIntent = z.infer<typeof NormalizedResearchIntentSchema>;

export const SearchQueryVariantSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  angle: SearchQueryAngleSchema,
  isPrimary: z.boolean(),
  rationale: z.string().min(1),
  targetedConstraintKeys: z.array(z.string()).readonly(),
});
export type SearchQueryVariant = z.infer<typeof SearchQueryVariantSchema>;

export const ResearchPlanSchema = z.object({
  id: z.string().uuid(),
  status: PlanStatusSchema,
  intent: NormalizedResearchIntentSchema,
  primaryQuery: z.string().min(1),
  searchQueries: z.array(SearchQueryVariantSchema).min(1).max(5).readonly(),
  ambiguities: z.array(PlanAmbiguitySchema).readonly(),
  warnings: z.array(PlanWarningSchema).readonly(),
  createdAt: z.string().datetime(),
  plannerVersion: z.string().min(1),
});
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

/**
 * Structured constraints input that can be provided alongside raw query text.
 * Mirrors the canonical ResearchTask constraints structure from Step 5 / Step 21.
 */
export const StructuredConstraintsInputSchema = z.object({
  maxPrice: z.string().optional(),
  minPrice: z.string().optional(),
  currency: z.string().optional(),
  requiredCondition: z.enum(['NEW', 'REFURBISHED', 'USED', 'ANY']).optional(),
  requiredBrand: z.string().optional(),
  excludedKeywords: z.array(z.string()).optional(),
  excludedDomains: z.array(z.string()).optional(),
  requiredSpecs: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export type StructuredConstraintsInput = z.infer<typeof StructuredConstraintsInputSchema>;

export const ResearchPlanInputSchema = z.object({
  rawQuery: z.string().min(1, 'Research query cannot be empty').max(1000, 'Research query exceeds 1000 character maximum'),
  structuredConstraints: StructuredConstraintsInputSchema.optional(),
  taskTypeOverride: TaskTypeSchema.optional(),
});
export type ResearchPlanInput = z.infer<typeof ResearchPlanInputSchema>;
