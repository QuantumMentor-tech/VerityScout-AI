# VerityScout AI — Constraint Evaluation Contract Specification

**Document Identifier:** VS-CONSTRAINT-EVALUATION-CONTRACT-v1.0  
**Status:** APPROVED INTERFACE SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 38 of 60)  
**Governing Standard:** Deterministic, Evidence-Linked Constraint Assessment  
**Upstream Sources:**  
- Step 31 [`NormalizedConstraint`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/research/planner/contracts.ts#L72)  
- Step 36 [`ExtractedClaim`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/claims/contracts.ts#L68)  
- Step 37 [`NormalizedAttribute`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/normalization/contracts.ts#L141) and [`ComparableAttribute`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/normalization/contracts.ts#L171)  
**Downstream Consumer:** Step 39 Result Classification Engine  

---

## 1. Schema Definitions

Located in [`src/server/evaluation/contracts.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/evaluation/contracts.ts).

### 1.1 `ConstraintEvaluationRecord` (Per-Constraint Evaluation)

```typescript
export interface ConstraintEvaluationRecord {
  readonly id: string;
  readonly constraintId: string;
  readonly constraintKey: string;
  readonly constraintType: ConstraintType;
  readonly constraintPriority: ConstraintPriority;
  readonly operator: ConstraintOperator;
  readonly targetValue: string | number | boolean | readonly string[];
  readonly targetUnitOrCurrency?: string | undefined;
  readonly state: EvaluationState;
  readonly reasonCode: EvaluationReasonCode;
  readonly explanation: string;
  readonly evidenceReferences: readonly EvidenceReference[];
  readonly actualComparableValue?: string | number | boolean | readonly string[] | undefined;
  readonly actualUnitOrCurrency?: string | undefined;
  readonly isApproximate: boolean;
  readonly isRange: boolean;
  readonly evaluatedAt: string;
  readonly rulesetVersion: string;
}
```

### 1.2 `CandidateConstraintEvaluationSummary` (Candidate-Level Aggregation)

```typescript
export interface CandidateConstraintEvaluationSummary {
  readonly candidateId: string;
  readonly runId: string;
  readonly userId: string;
  readonly totalConstraintsEvaluated: number;
  readonly satisfiedCount: number;
  readonly violatedCount: number;
  readonly unknownCount: number;
  readonly conflictingCount: number;
  readonly notComparableCount: number;
  readonly invalidCount: number;
  readonly requiredSummary: PriorityEvaluationSummary;
  readonly excludedSummary: PriorityEvaluationSummary;
  readonly preferredSummary: PriorityEvaluationSummary;
  readonly evaluations: readonly ConstraintEvaluationRecord[];
  readonly passedConstraintKeys: readonly string[];
  readonly failedConstraintKeys: readonly string[];
  readonly unresolvedConstraintKeys: readonly string[];
  readonly primaryMismatchReason?: string | undefined;
  readonly evaluatedAt: string;
  readonly rulesetVersion: string;
}
```

---

## 2. Invariants for Step 39 Handoff

1. **Clean Separation of Evaluation vs. Classification:** Step 38 records whether constraints are satisfied or violated, but strictly defers final classification (`exact_match`, `near_match`, `stale`, `excluded`) to Step 39.
2. **Hard vs. Soft Constraints:**
   - If `requiredSummary.violated > 0` or `excludedSummary.violated > 0`, the candidate has failed hard constraints.
   - If `preferredSummary.violated > 0` while hard requirements pass, Step 39 may classify the result as a near match rather than excluding it.
3. **Unresolved Uncertainty:** If `requiredSummary.unresolved > 0` (due to unknown, conflicting, or non-comparable constraints), Step 39 can classify the result as uncertain rather than falsely treating it as passing or failing.
4. **Audit Provenance:** Every evidence-dependent record in `evaluations` retains direct cryptographic pointers to `evidenceReferences`, allowing the UI and verification reports to ground every badge in exact source quotes.

