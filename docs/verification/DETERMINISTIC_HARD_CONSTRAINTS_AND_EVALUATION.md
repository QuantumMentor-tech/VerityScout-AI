# VerityScout AI — Deterministic Hard Constraints & Constraint Evaluation Engine

**Document Identifier:** VS-DETERMINISTIC-HARD-CONSTRAINTS-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 38 of 60)  
**Classification:** Core Decision Rule Engine & Epistemic Evaluation  
**Traceability:** Mapped to [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-008`, `UR-009`, `AC-008`, `SEC-016`, `SEC-017`).

---

## 1. Core Epistemological Foundations

A core architectural invariant of **VerityScout AI** is that **constraint evaluation is a structured, deterministic comparison between declared rules and available evidence; it does NOT constitute independent proof of real-world truth, product suitability, or final result classification**:

> **Evaluation answers: "Does the available, eligible, normalized evidence support or violate this declared constraint under the deterministic ruleset?"**  
> **Evaluation does NOT answer: "Is this product as a whole an exact or near match, is the source truthful, or should this result be recommended to the user?"**

Key principles enforced by the Step 38 implementation:

1. **Deterministic Core:** No generative AI / LLM is permitted as the final comparison authority. Given identical validated inputs, constraints, and eligible evidence, evaluation output is 100% reproducible and pure.
2. **Distinct Evidence States:** Substantive states are clearly delineated:
   - `SATISFIED`: Eligible evidence satisfies the constraint under the applicable policy.
   - `VIOLATED`: Eligible evidence proves the constraint is violated or an explicit exclusion is present.
   - `UNKNOWN`: Missing or insufficient evidence to make a determination.
   - `CONFLICTING_EVIDENCE`: Multiple eligible claims provide mutually contradictory evidence without reconciliation.
   - `NOT_COMPARABLE`: Incompatible units, cross-currency comparisons, or differing price semantics.
   - `INVALID_CONSTRAINT`: Malformed or incomplete constraint definitions.
3. **Missing-Data Safety:** Absence of evidence is **never** converted into a passing score, zero, false, or an assumed violation.
4. **Conflict Preservation:** Conflicting claims from separate sources are preserved intact with citations to all conflicting evidence records rather than arbitrarily picking a "winner."
5. **Strict Constraint Priority:** `REQUIRED` (hard), `EXCLUDED` (negative hard), and `PREFERRED` (soft) constraints maintain their declared semantics. A preferred constraint failure is tracked in `preferredSummary` and never causes a candidate to fail hard requirements.
6. **Monetary & Dimensional Isolation:** Strict zero-conversion rules prevent cross-currency comparisons (e.g. USD vs EUR) or comparisons with ambiguous currency symbols. Cross-dimensional conversions (e.g. mass to length) are rejected.
7. **Provisional Aggregation Without Final Classification:** The candidate summary aggregates per-priority metrics and identifies primary mismatch reasons, but strictly defers final match labels (`exact_match`, `near_match`, `uncertain`, `conflicting`, `stale`, `excluded`) to Step 39.

---

## 2. Architecture & Pipeline

```
Parsed Constraints (Step 31)   Extracted Claims (Step 36)   Normalized Attributes (Step 37)
            │                               │                           │
            └───────────────────────┬───────┴───────────────────────────┘
                                    │
                                    ▼
                       ConstraintEvaluationService
                                    │
                        matchEligibleEvidence
            (Scope Isolation: run_id, user_id, candidate_id)
            (Conflict Detection: multi-claim contradiction)
                                    │
                        evaluateConstraint (Dispatcher)
      ┌─────────────────────────────┼─────────────────────────────┐
      ▼                             ▼                             ▼
compareExclusion              compareMonetary               compareUnits
(Keywords, Domains,           (Currency match,              (Dimension verification,
 Conditions)                   Zero-conversion)              Canonical conversion)
      │                             │                             │
      └─────────────────────────────┼─────────────────────────────┘
                                    │
                                    ▼
                        compareNumeric / compareCategorical
                        (Exact decimals, Ranges, Approximations,
                         Set membership, Condition, Brand)
                                    │
                                    ▼
                         Per-Constraint Record
                      (ConstraintEvaluationRecord)
                                    │
                                    ▼
                     Provisional Candidate Summary
               (CandidateConstraintEvaluationSummary)
             ┌──────────────────────┴──────────────────────┐
             ▼ (Persistence)                               ▼ (Next Step)
  candidate_results Table                        Step 39 Match Classification
(constraint_evaluation JSON)                     (Exact, Near, Uncertain, Stale)
```

---

## 3. Supported Comparators & Operators

| Comparator | Supported Operators | Validated Input Types | Key Policies |
| :--- | :--- | :--- | :--- |
| **Numeric** | `EQ`, `LTE`, `GTE`, `BETWEEN` | `number`, `[number, number]` | Decimal-safe comparisons, range straddling detection, $\pm 1\%$ boundary approximation uncertainty |
| **Monetary** | `EQ`, `LTE`, `GTE`, `BETWEEN` | Amount + ISO currency | Strict zero currency conversion; currency code equality required; billing intervals aligned |
| **Physical Unit** | `EQ`, `LTE`, `GTE`, `BETWEEN` | Magnitude + Unit | Dimension verification; canonical unit conversion; cross-dimensional rejection (`NOT_COMPARABLE`) |
| **Categorical** | `EQ`, `IN`, `NOT_IN` | `string`, `boolean`, `string[]` | Condition matching (`NEW`, `REFURBISHED`, `USED`); brand matching; explicit boolean logic |
| **Exclusion** | `NOT_IN`, keyword, domain | `string`, `string[]` | Excluded condition detection, prohibited keyword search in metadata/specs, domain/URL matching |

---

## 4. Verification and Acceptance Status

Verified offline through automated unit tests in [`tests/unit/constraint-evaluation.test.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/tests/unit/constraint-evaluation.test.ts):

- **Numeric & Range Boundaries:** LTE/GTE/BETWEEN immediate below, on, and above boundary tests; evidence ranges with upper bound straddling; approximation uncertainty near thresholds.
- **Monetary & Currency Safety:** Compatible USD ceiling evaluation; cross-currency EUR vs USD rejection (`CURRENCY_MISMATCH`); bare `$` null code rejection (`CURRENCY_UNRESOLVED`); subscription vs one-time rejection (`PRICE_SEMANTICS_INCOMPATIBLE`).
- **Unit & Dimension Compatibility:** Mass conversion (1400g vs 1.5kg); cross-dimensional mass vs length rejection (`INCOMPATIBLE_MEASUREMENT_DIMENSION`).
- **Categorical & Exclusions:** Condition matching (`NEW`, `REFURBISHED`, `UNKNOWN`); set membership (`IN`, `NOT_IN`); condition exclusion (refurbished prohibited); domain and keyword exclusions.
- **Evidence Integrity & Conflict:** Missing attribute produces `UNKNOWN`; multi-claim contradiction produces `CONFLICTING_EVIDENCE` retaining both citations; cross-tenant/run claim rejection (`EVIDENCE_SCOPE_MISMATCH`).
- **Provisional Aggregation:** Priority partitioning (`requiredSummary`, `excludedSummary`, `preferredSummary`); primary mismatch reason formulation; determinism over repeated executions; clean database serialization.

