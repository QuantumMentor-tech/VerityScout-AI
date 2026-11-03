# VerityScout AI — Search Result Contract & Data Normalization

**Document Identifier:** VS-SEARCH-RESULT-CONTRACT-v1.0  
**Status:** APPROVED DATA CONTRACT SPECIFICATION  
**Phase:** Phase 7 (Step 33 of 60)  
**Author:** Principal Software Architect, Senior QA Automation Engineer  
**Classification:** Domain Data Contract  
**Traceability:** Mapped to [DATA_CONTRACTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/DATA_CONTRACTS.md), [ADR-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-005-search-and-extraction-provider-abstraction.md), and [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-006`, `AC-006`).

---

## 1. Core Epistemological Principle: Discovery Leads vs. Verified Facts

A core architectural invariant of **VerityScout AI** is:
> **Search results are discovery leads, not verified facts.**

A search result title, snippet, relevance score, or URL returned by Tavily or Exa represents an external suggestion of where information might reside on the web. It must **never** be presented as:
- Proof that a claim is accurate, current, or true.
- A verified candidate result.
- An extracted webpage document.
- An exact or near match for user constraints.

Full content extraction is strictly reserved for **Step 34**, canonical deduplication and provenance for **Step 35**, and deterministic constraint verification for **Step 38**.

---

## 2. Canonical Search Result Schema (`NormalizedSearchResult`)

Each candidate returned by an `ISearchProvider` adapter is normalized into `NormalizedSearchResult` (`src/server/search/contracts.ts`):

```typescript
export interface NormalizedSearchResult {
  readonly id: string;                     // Stable UUIDv4 identifying discovery lead
  readonly provider: SearchProviderId;     // 'tavily' | 'exa' | 'mock_search'
  readonly queryVariantId: string | null;  // Association with specific ResearchPlan query variant
  readonly originalUrl: string;            // Verbatim URL returned by search engine
  readonly title: string;                  // Page title reported by engine (default: 'Untitled Web Page')
  readonly snippet: string | null;         // Excerpt snippet (null if unprovided)
  readonly publishedDate: string | null;   // ISO 8601 string if reported by engine (null if unprovided)
  readonly author: string | null;          // Author name if reported (null if unprovided)
  readonly relevanceScore: number | null;  // Float clamped to [0.0, 1.0] if reported
  readonly providerResultId: string | null;// Engine-specific ID (e.g. Exa document ID)
  readonly urlValidation: UrlValidationResult; // Full Step 32 SSRF and destination classification
  readonly isFetchable: boolean;           // True ONLY if urlValidation.isValid === true
  readonly discoveredAt: string;           // ISO 8601 UTC timestamp
}
```

---

## 3. Metadata Invariants & Missing Data Semantics

1. **Zero Data Fabrication:** If an engine does not report publication dates, author metadata, or relevance scores, the values are stored strictly as `null`. Under no circumstances are dates defaulted to the current timestamp or scores defaulted to `1.0` or `0.0`.
2. **Relevance Score Semantics:** Provider-reported scores represent an upstream relevance heuristic relative to the query string. They are clamped strictly to $[0.0, 1.0]$. They must **not** be interpreted as a probability of truth, factual accuracy, or product quality.
3. **URL Safety Classification:** `urlValidation` preserves the output of Step 32's `validateUrl(url, 'PUBLIC_RESEARCH_SOURCE')`.
   - If an engine returns `http://127.0.0.1/admin` or `http://169.254.169.254/latest`, `urlValidation.isValid` is `false`, and `isFetchable` is `false`.
   - Downstream extraction services (Step 34) must verify `isFetchable === true` before attempting any HTTP connection.

---

## 4. Execution Summary Schema (`SearchExecutionSummary`)

The aggregate execution of a research plan yields:

```typescript
export interface SearchExecutionSummary {
  readonly planId: string;
  readonly providerId: SearchProviderId;
  readonly status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  readonly queriesAttempted: number;
  readonly queriesSucceeded: number;
  readonly queriesFailed: number;
  readonly totalResultsDiscovered: number;
  readonly validSourceCount: number;
  readonly invalidSourceCount: number;
  readonly results: readonly NormalizedSearchResult[];
  readonly errors: ReadonlyArray<{
    readonly queryId?: string | undefined;
    readonly query: string;
    readonly code: SearchProviderErrorCode;
    readonly message: string;
  }>;
  readonly totalCreditsConsumed: number;
  readonly durationMs: number;
}
```

---

## 5. Downstream Integration Contract (Steps 34 and 35)

- **Step 34 (Source Extraction):** Will consume `results.filter(r => r.isFetchable)` and attempt static HTTP fetching (Tier 1) or managed extraction (Tier 2).
- **Step 35 (Source Deduplication & Provenance):** Will perform cross-query URL canonicalization, deduplication, and persistence into the PostgreSQL `source_documents` repository.

