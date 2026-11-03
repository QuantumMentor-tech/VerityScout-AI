# VerityScout AI — Search Provenance and Execution Counters

**Document Identifier:** VS-SEARCH-PROVENANCE-COUNTERS-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 7 (Step 35 of 60)  
**Classification:** Operational Telemetry & System Invariants  
**Traceability:** Mapped to [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-006`, `AC-006`, `SEC-008`).

---

## 1. Principles of Truthful Counter Accounting

A strict engineering principle of **VerityScout AI** is:
> **Counters must derive strictly from actual system events and validated database state — zero fabricated progress.**

UI components, progress bars, and operational telemetry must never increment counters speculatively, simulate progress, or conflate transient query attempts with deduplicated source findings.

---

## 2. Explicit Counter Definitions & Formulas

The operational counter model is encapsulated in `SearchOperationCounters` ([`src/server/search/provenance/contracts.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/search/provenance/contracts.ts)):

| Counter Name | Scope | Operational Definition | Mathematical Formula / Transition Point |
| :--- | :--- | :--- | :--- |
| `plannedQueries` | Per Run | Number of query variants formulated in the validated `ResearchPlan`. | Clamped to bounded limit (max 5). |
| `executedQueries` | Per Run | Number of query HTTP requests actually dispatched to an external search provider adapter. | Dispatched request count. |
| `successfulQueries` | Per Run | Number of query requests whose provider response passed format validation (including zero-result queries). | Successful HTTP response with parsed JSON payload. |
| `failedQueries` | Per Run | Number of query requests that terminated in network error, timeout, HTTP 4xx/5xx, or authentication failure. | Exception or non-retryable provider failure. |
| `rawResultsReceived` | Per Run | Aggregate count of search result candidate items accepted from provider responses before deduplication. | Sum of `response.results.length` across all successful queries. |
| `rejectedResults` | Per Run | Result items rejected during URL safety pre-flight (malformed syntax or Step 32 SSRF violation). | Rejected URL count. |
| `validDiscoveries` | Per Run | Discovered candidates that passed URL security and were successfully evaluated for source identity. | `validDiscoveries = uniqueSourcesDiscovered + duplicateDiscoveries` |
| `duplicateDiscoveries` | Per Run | Discovered items that canonicalized to an already-known source document within the research run. | Discovered leads resolving to existing canonical URL. |
| `uniqueSourcesDiscovered` | Per Run | Distinct canonical source documents registered in the research run (`source_documents`). | Unique canonical URLs registered. |
| `sourcesExtracted` | Per Run | Canonical source documents whose HTML was retrieved and successfully parsed (`extraction_state = 'SUCCESS'`). | Step 34 extraction success count. |
| `extractionFailed` | Per Run | Source extraction attempts that resulted in timeout, bot challenge, HTTP error, or empty body. | Step 34 non-success extraction count. |

---

## 3. Core Mathematical Invariants

Every search and extraction execution must satisfy the following algebraic invariants:

1. **Query Dispatch Balance:**
   $$\text{executedQueries} = \text{successfulQueries} + \text{failedQueries}$$
   *(A successful query with 0 results is counted as a successful query, not a failure).*

2. **Result Reception & Screening Balance:**
   $$\text{rawResultsReceived} = \text{rejectedResults} + \text{validDiscoveries}$$

3. **Discovery & Deduplication Balance:**
   $$\text{validDiscoveries} = \text{uniqueSourcesDiscovered} + \text{duplicateDiscoveries}$$

These relationships are programmatically verified at runtime via `SearchCounterTracker.verifyInvariants()` ([`src/server/search/provenance/search-counters.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/search/provenance/search-counters.ts)).

---

## 4. Multi-Query Provenance Retention

When multiple query variants encounter the same canonical page, the system retains full relational provenance:

```
Query Variant 1: "ThinkPad X1 Carbon Gen 12"
  └── Discovered: https://lenovo.com/x1?utm_source=ad (Score: 0.98, Snippet: "Official Specs")
      └── Canonical: https://lenovo.com/x1 ──► [source_documents row #1]
      └── Provenance: [source_discoveries row #A (query_variant_id: 'var-1')]

Query Variant 2: "ThinkPad X1 battery life reviews"
  └── Discovered: https://lenovo.com/x1#battery (Score: 0.88, Snippet: "All-day Battery")
      └── Canonical: https://lenovo.com/x1 ──► [Reused source_documents row #1]
      └── Provenance: [source_discoveries row #B (query_variant_id: 'var-2')]
```

- **Run Summary Result:**
  - `uniqueSourcesDiscovered = 1`
  - `duplicateDiscoveries = 1`
  - Total discoveries preserved for evidence tracing = 2

