import 'server-only';
import type { NormalizedConstraint } from '@/server/research/planner/contracts';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type {
  ComparableAttribute,
  NormalizedAttribute,
} from '@/server/normalization/contracts';
import {
  EVALUATION_RULESET_VERSION,
  type CandidateConstraintEvaluationSummary,
  type ConstraintEvaluationRecord,
  type EvaluationContext,
  type PriorityEvaluationSummary,
} from './contracts';
import { evaluateConstraint } from './constraint-evaluator';

export class ConstraintEvaluationService {
  /**
   * Evaluates a candidate result against all parsed user constraints, producing
   * an auditable provisional summary without assigning final Step 39 classifications.
   */
  evaluateCandidate(
    context: EvaluationContext,
    constraints: readonly NormalizedConstraint[],
    claims: readonly ExtractedClaim[],
    normalized: readonly NormalizedAttribute[],
    comparable: readonly ComparableAttribute[],
  ): CandidateConstraintEvaluationSummary {
    const evaluations: ConstraintEvaluationRecord[] = [];

    let satisfiedCount = 0;
    let violatedCount = 0;
    let unknownCount = 0;
    let conflictingCount = 0;
    let notComparableCount = 0;
    let invalidCount = 0;

    const requiredEvaluations: ConstraintEvaluationRecord[] = [];
    const excludedEvaluations: ConstraintEvaluationRecord[] = [];
    const preferredEvaluations: ConstraintEvaluationRecord[] = [];

    const passedConstraintKeys: string[] = [];
    const failedConstraintKeys: string[] = [];
    const unresolvedConstraintKeys: string[] = [];

    let primaryMismatchReason: string | undefined;

    for (const constraint of constraints) {
      const evaluation = evaluateConstraint(constraint, context, claims, normalized, comparable);
      evaluations.push(evaluation);

      // State counters
      switch (evaluation.state) {
        case 'SATISFIED':
          satisfiedCount++;
          passedConstraintKeys.push(constraint.key);
          break;
        case 'VIOLATED':
          violatedCount++;
          failedConstraintKeys.push(constraint.key);
          if (!primaryMismatchReason && (constraint.priority === 'REQUIRED' || constraint.priority === 'EXCLUDED')) {
            primaryMismatchReason = evaluation.explanation;
          }
          break;
        case 'UNKNOWN':
          unknownCount++;
          unresolvedConstraintKeys.push(constraint.key);
          break;
        case 'CONFLICTING_EVIDENCE':
          conflictingCount++;
          unresolvedConstraintKeys.push(constraint.key);
          break;
        case 'NOT_COMPARABLE':
          notComparableCount++;
          unresolvedConstraintKeys.push(constraint.key);
          break;
        case 'INVALID_CONSTRAINT':
          invalidCount++;
          unresolvedConstraintKeys.push(constraint.key);
          break;
      }

      // Priority Partitioning (AC-08)
      if (constraint.priority === 'REQUIRED') {
        requiredEvaluations.push(evaluation);
      } else if (constraint.priority === 'EXCLUDED') {
        excludedEvaluations.push(evaluation);
      } else if (constraint.priority === 'PREFERRED') {
        preferredEvaluations.push(evaluation);
      }
    }

    const buildPrioritySummary = (records: readonly ConstraintEvaluationRecord[]): PriorityEvaluationSummary => {
      let satisfied = 0;
      let violated = 0;
      let unresolved = 0;

      for (const r of records) {
        if (r.state === 'SATISFIED') satisfied++;
        else if (r.state === 'VIOLATED') violated++;
        else unresolved++;
      }

      return {
        total: records.length,
        satisfied,
        violated,
        unresolved,
      };
    };

    const requiredSummary = buildPrioritySummary(requiredEvaluations);
    const excludedSummary = buildPrioritySummary(excludedEvaluations);
    const preferredSummary = buildPrioritySummary(preferredEvaluations);

    const now = new Date().toISOString();

    return {
      candidateId: context.candidateId,
      runId: context.runId,
      userId: context.userId,
      totalConstraintsEvaluated: constraints.length,
      satisfiedCount,
      violatedCount,
      unknownCount,
      conflictingCount,
      notComparableCount,
      invalidCount,
      requiredSummary,
      excludedSummary,
      preferredSummary,
      evaluations,
      passedConstraintKeys,
      failedConstraintKeys,
      unresolvedConstraintKeys,
      primaryMismatchReason,
      evaluatedAt: now,
      rulesetVersion: EVALUATION_RULESET_VERSION,
    };
  }

  /**
   * Helper to evaluate a batch of candidates for a research run.
   */
  evaluateCandidatesBatch(
    contexts: readonly {
      context: EvaluationContext;
      claims: readonly ExtractedClaim[];
      normalized: readonly NormalizedAttribute[];
      comparable: readonly ComparableAttribute[];
    }[],
    constraints: readonly NormalizedConstraint[],
  ): CandidateConstraintEvaluationSummary[] {
    return contexts.map(({ context, claims, normalized, comparable }) =>
      this.evaluateCandidate(context, constraints, claims, normalized, comparable),
    );
  }
}

let defaultEvaluationService: ConstraintEvaluationService | null = null;

export function getDefaultEvaluationService(): ConstraintEvaluationService {
  if (!defaultEvaluationService) {
    defaultEvaluationService = new ConstraintEvaluationService();
  }
  return defaultEvaluationService;
}

