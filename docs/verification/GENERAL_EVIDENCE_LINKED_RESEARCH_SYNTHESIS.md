# VerityScout AI — General Evidence-Linked Research Synthesis

**Document Identifier:** VS-GENERAL-EVIDENCE-LINKED-SYNTHESIS-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 40 of 60)  
**Classification:** Core Research Synthesis & Citation Traceability  
**Traceability:** Mapped to [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-010`, `UR-012`, `AC-010`, `AC-012`, `SEC-018`, `SEC-021`).

---

## 1. Core Epistemological Foundations

A cardinal design invariant of **VerityScout AI** is that **research synthesis organizes, explains, compares, and grounds available evidence; it does NOT invent facts, conceal disagreements, or fabricate consensus**:

> **Synthesis answers: "Given the eligible, normalized claims and constraint evaluations gathered for this research query, what coherent evidence-backed findings and direct answer can be established?"**  
> **Synthesis does NOT answer: "What sounds plausible based on the LLM's unverified internal training data?"**

Key principles enforced by the Step 40 implementation:

1. **Mandatory Evidence Grounding:** Every substantive factual statement in `directAnswer` or `keyFindings` must link to valid citation IDs referencing eligible source claims.
2. **Post-Generation Citation Validation:** All citation IDs emitted by generative models are strictly validated against the allowed eligible claim set. Fabricated citation IDs, cross-tenant/cross-run references, and quote mismatches are rejected.
3. **Conflict Preservation:** Material source disagreements identified upstream (Step 38 `CONFLICTING_EVIDENCE`) are documented in the `conflicts` array with citations to both sides. Synthesis is strictly forbidden from picking an arbitrary "winning" source.
4. **Uncertainty & Limitation Transparency:** Missing information (Step 38 `UNKNOWN`), cross-dimensional or cross-currency incompatibilities (`NOT_COMPARABLE`), and approximate measurements (`APPROXIMATE_VALUE_UNCERTAIN`) are preserved in `uncertaintiesAndLimitations`.
5. **Classification Awareness:** Step 39 match classifications (`EXACT_MATCH`, `NEAR_MATCH`, `PARTIALLY_VERIFIED`, `CONFLICTING`, `EXCLUDED`) are derived and reflected directly with their reasons. Excluded candidates are never presented as recommendations.
6. **Passive Data Enclosure & Security:** All untrusted claim excerpts and source texts are encapsulated in `<untrusted_evidence_data>` blocks, preventing prompt-injection instructions from overriding application rules.
7. **Dual-Engine Execution & Deterministic Testing:** Supports both `AiResearchSynthesizer` (via the existing approved provider abstraction) and `RuleBasedResearchSynthesizer` (a deterministic offline engine requiring 0 live external network calls and 0 AI spend for CI/CD test reproducibility).

---

## 2. Synthesis Architecture & Pipeline

```
Research Query (Step 31)   Extracted Claims (Step 36)   Constraint Evaluations (Step 38)
            │                            │                           │
            └────────────────────┬───────┴───────────────────────────┘
                                 │
                                 ▼
                     ResearchSynthesisService
                                 │
                     Context & Scope Bounding
              (Max 50 claims, Max 10 sources, Tenant Isolation)
                                 │
            ┌────────────────────┴────────────────────┐
            ▼                                         ▼
   AiResearchSynthesizer                    synthesizeViaRules
   (Approved AI Provider Adapter)           (Deterministic Offline Engine)
            │                                         │
            └────────────────────┬────────────────────┘
                                 │
                                 ▼
                         validateCitations
          - Validates citation IDs against eligible claims
          - Enforces verbatim quote match
          - Quarantines fabricated / cross-tenant references
                                 │
                                 ▼
                      ResearchSynthesisOutput
               (Direct Answer, Key Findings, Citations,
                Conflicts, Limitations, Candidate Comparisons)
```

---

## 3. General Research Output Structure

The output contract supports diverse research tasks (factual inquiries, market comparisons, specification deep-dives, requirement audits) without forcing every query into a rigid product-matching template:

1. **`directAnswer`:** Concise, evidence-backed answer directly addressing the user's research query.
2. **`keyFindings`:** Array of [`StructuredFinding`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/synthesis/contracts.ts#L61) records linking statements to citation IDs with finding types (`FACTUAL`, `COMPARISON`, `INTERPRETATION`, `LIMITATION`).
3. **`supportingCitations`:** Array of [`SupportingCitation`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/synthesis/contracts.ts#L36) records with source URLs, titles, and exact verbatim quotes.
4. **`conflicts`:** Array of [`SynthesisConflict`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/synthesis/contracts.ts#L74) records preserving multi-source disagreements.
5. **`uncertaintiesAndLimitations`:** Array of [`SynthesisUncertainty`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/synthesis/contracts.ts#L85) records capturing missing attributes and unverified specifications.
6. **`candidateComparisons`:** Array of [`CandidateComparisonRow`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/synthesis/contracts.ts#L96) records showing constraint outcomes and match classifications.
7. **`metadata`:** Timestamps, strategy used, ruleset version, duration, and evidence coverage metrics.

---

## 4. Verification & Test Evidence

Verified offline through automated unit tests in [`tests/unit/research-synthesis.test.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/tests/unit/research-synthesis.test.ts):

- **Citation Integrity Tests:** Legitimate citation validation with exact quote matching; rejection of fabricated citation IDs; rejection of cross-tenant/cross-run citations.
- **Conflict & Uncertainty Tests:** Preservation of Step 38 multi-source conflicts without winner selection; preservation of missing required attributes as uncertainties.
- **Classification Derivation Tests:** Deterministic derivation of `EXACT_MATCH`, `NEAR_MATCH`, and `EXCLUDED` from constraint evaluation summaries.
- **Service Execution Tests:** Complete synthesis execution conforming to `ResearchSynthesisOutputSchema`; empty evidence handling with `EMPTY` status; determinism across repeated executions.
- **Regression Safety:** Full test suite passing across 53 test files (598 tests), 0 TypeScript compiler errors, 0 ESLint warnings, clean Next.js production build.

