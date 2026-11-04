# VerityScout AI — Research Synthesis Contract Specification

**Document Identifier:** VS-RESEARCH-SYNTHESIS-CONTRACT-v1.0  
**Status:** APPROVED INTERFACE SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 40 of 60)  
**Governing Standard:** General Evidence-Linked Research Synthesis  
**Upstream Sources:**  
- Step 31 [`NormalizedConstraint`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/research/planner/contracts.ts#L72)  
- Step 36 [`ExtractedClaim`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/claims/contracts.ts#L68)  
- Step 37 [`NormalizedAttribute`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/normalization/contracts.ts#L141)  
- Step 38 [`ConstraintEvaluationRecord`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/evaluation/contracts.ts#L88) & [`CandidateConstraintEvaluationSummary`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/evaluation/contracts.ts#L131)  
**Downstream Consumer:** Step 41+ Model Catalog and Research Reports  

---

## 1. Schema Definitions

Located in [`src/server/synthesis/contracts.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/synthesis/contracts.ts).

### 1.1 `ResearchSynthesisOutput`

```typescript
export interface ResearchSynthesisOutput {
  readonly id: string;
  readonly runId: string;
  readonly userId: string;
  readonly query: string;
  readonly status: 'SUCCESS' | 'PARTIAL' | 'EMPTY' | 'FAILED';
  readonly directAnswer: string;
  readonly keyFindings: readonly StructuredFinding[];
  readonly supportingCitations: readonly SupportingCitation[];
  readonly conflicts: readonly SynthesisConflict[];
  readonly uncertaintiesAndLimitations: readonly SynthesisUncertainty[];
  readonly candidateComparisons: readonly CandidateComparisonRow[];
  readonly metadata: SynthesisMetadata;
}
```

### 1.2 `StructuredFinding`

```typescript
export interface StructuredFinding {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly citationIds: readonly string[];
  readonly findingType: 'FACTUAL' | 'COMPARISON' | 'INTERPRETATION' | 'LIMITATION';
  readonly isDecisive: boolean;
}
```

### 1.3 `SupportingCitation`

```typescript
export interface SupportingCitation {
  readonly id: string;
  readonly claimId: string;
  readonly sourceDocumentId: string;
  readonly sourceTitle: string;
  readonly sourceUrl: string;
  readonly verbatimQuote: string;
  readonly charOffsets?: {
    readonly start: number;
    readonly end: number;
  };
  readonly confidenceScore?: number;
  readonly claimKey?: string;
  readonly claimType?: string;
  readonly publicationDate?: string;
  readonly validationStatus: 'VALID' | 'UNRESOLVED_QUOTE' | 'FABRICATED_ID' | 'CROSS_TENANT_REJECTED';
}
```

---

## 2. Invariants for Downstream Consumption

1. **Sentence-to-Evidence Traceability:** Every finding of type `FACTUAL` contains verified `citationIds` referencing citations whose `validationStatus` is `'VALID'`.
2. **Conflict Preservation:** Conflicting claims retain citations to each distinct source statement, ensuring the user interface can display neutral disagreement banners.
3. **Classification Integrity:** Candidate comparison rows preserve the match classifications derived from Step 38 constraint evaluation without narrative distortion.

