# ADR-007: Evidence-First Verification & Deterministic Hard Constraints

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Verification Systems Lead  
**Related Requirements:** UR-007, UR-008, UR-009, UR-010, NFR-001  
**Traceability:** Implements [DEC-008](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), [DEC-009](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), [DEC-010](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [AC-007](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-007-source-linked-findings-and-citation-records), [AC-008](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-008-strict-product-constraint-verification)

---

## 1. Context and Problem Statement

A fundamental flaw of generative AI in commerce and technical research is hallucination: models frequently declare a product "compatible" or "within budget" when in fact it exceeds the price ceiling or physical dimensions. Furthermore, search snippets often contain stale cached data from expired sales. VerityScout AI's core value proposition is **truth over probability**: an AI model must never have the authority to declare a constraint "passed" through probabilistic text generation alone.

## 2. Considered Alternatives

1. **Alternative 1: Deterministic TypeScript Verification Engine with Field-Level Evidence Linking** *(Chosen)*
2. **Alternative 2: Pure LLM-Based Verification via Prompt Engineering ("Is this under budget? Yes/No")**
3. **Alternative 3: Secondary LLM Judge / Critic Model**

## 3. Decision Outcome & Chosen Approach

We adopt a **deterministic, code-level verification architecture**:
1. **Decoupled Fact Extraction:** The LLM is used strictly as an information parser to extract structured numeric values (e.g., `extractedPrice: 549.99`, `lengthMm: 320`) and associate them with an exact source text excerpt.
2. **Deterministic Constraint Verification:** A pure TypeScript engine executes mathematical comparisons against user constraints:
   - `isUnderBudget = extractedPrice <= userMaxBudget`
   - `isCompatibleLength = gpuLengthMm <= caseMaxGpuLengthMm`
   If the LLM generates a claim that an item is verified, but the numbers contradict the claim, the deterministic verifier unconditionally overrides the status to `REFUTED` with reason `EXCEEDS_BUDGET` (`SEC-017`, `FIX-GPU-001`).
3. **Multi-Tier Classification:** Results are automatically categorized into deterministic tiers:
   - **Strong Matches:** Satisfies 100% of required constraints with primary source citations.
   - **Near-Matches:** Meets core criteria but misses a secondary flexible constraint.
   - **Partially Verified / Conflicting:** Contradictory prices or specs between retailers preserved side-by-side.
   - **Excluded:** Definitively violates a hard constraint (e.g., condition is Used when New was required).
4. **Granular Citations:** No claim exists without a backing URL, extraction timestamp, and raw snippet.

## 4. Consequences and Trade-offs

- **Benefits:**
  - Mathematical certainty: 0% chance of budget-exceeding items appearing in the Strong Match tier (`UR-008`).
  - Total defense against indirect prompt injections attempting to force false "PASS" statuses (`FIX-INJECT-001`).
- **Trade-offs:**
  - Requires writing robust regex and schema parsing for diverse web units (inches, mm, USD, EUR, etc.).

## 5. Security & Privacy Implications

- Neutralizes indirect prompt injection attacks where adversarial webpage text commands the model to output verified (`SEC-016`, `VS-THR-002`, `VS-THR-004`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 35 (Evidence Provenance), Step 37 (Deterministic Verifier), Step 39–40 (Tier Classification).
- **Validation Criteria:** 100% pass rate across the 60 ground-truth benchmark cases in `verityscout_benchmark.jsonl` (`AC-008`, `SEC-TEST-010`).
