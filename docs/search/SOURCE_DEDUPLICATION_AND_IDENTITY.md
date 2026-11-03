# VerityScout AI — Source Deduplication and Identity Architecture

**Document Identifier:** VS-SOURCE-DEDUPLICATION-IDENTITY-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 7 (Step 35 of 60)  
**Classification:** Core System Architecture  
**Traceability:** Mapped to [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-006`, `AC-006`, `SEC-008`).

---

## 1. Epistemological Tenets & Source Identity Scope

In **VerityScout AI**, source deduplication is governed by three foundational invariants:

1. **Discovery Provenance vs. Content Identity:** Multiple search queries or providers may discover the exact same canonical webpage. Consolidating duplicate source identities must **never** erase or conflate the audit trail showing which query variant, provider, ranking score, or timestamp produced each discovery.
2. **Scope-Aware Uniqueness:** The primary deduplication key is strictly scoped to the research run and owning tenant:
   $$\text{Primary Deduplication Key} = (\text{run\_id}, \text{canonical\_url}) \quad \text{within tenant} \; \text{user\_id}$$
3. **Strict Cross-Tenant Isolation (`SEC-008`):** Canonical deduplication is never applied globally across different users. One user's research activities, discovered URLs, or private query logs must never leak or merge with another user's research scope.

---

## 2. Multi-Tier Relational Model

To reconcile canonical deduplication with discrete discovery provenance, the persistence layer models source data across two tightly linked relational entities:

```
┌────────────────────────────────────────────────────────┐
│               research_runs (run_id)                   │
└──────────────────────────┬─────────────────────────────┘
                           │ 1:N
                           ▼
┌────────────────────────────────────────────────────────┐
│             source_documents (id)                      │
│  - run_id (FK)                                         │
│  - user_id (tenant owner)                              │
│  - canonical_url (UNIQUE per run_id)                   │
│  - domain, title, access_state, extraction_state       │
│  - content_hash, extracted_text_excerpt                │
└──────────────────────────┬─────────────────────────────┘
                           │ 1:N
                           ▼
┌────────────────────────────────────────────────────────┐
│             source_discoveries (id)                    │
│  - source_document_id (FK -> source_documents.id)      │
│  - run_id (FK)                                         │
│  - user_id (tenant owner)                              │
│  - query_variant_id (e.g. 'variant-primary')           │
│  - query_text (verbatim query dispatched)              │
│  - discovery_provider ('tavily' | 'exa')               │
│  - provider_result_id                                  │
│  - original_url (raw URL with tracking parameters)     │
│  - title, snippet, relevance_score, discovered_at      │
└────────────────────────────────────────────────────────┘
```

### 2.1 Canonical Source Document (`source_documents`)
- Represents a deduplicated, canonical web resource identified by `(run_id, canonical_url)`.
- Governed by the database constraint:
  ```sql
  CREATE UNIQUE INDEX uq_source_documents_run_canonical ON source_documents(run_id, canonical_url);
  ```
- Holds content lifecycle attributes: `access_state`, `extraction_state`, `http_status_code`, `content_hash`, and bounded text excerpt.

### 2.2 Discovery Audit Record (`source_discoveries`)
- Every search result item accepted from a search provider produces a distinct `source_discoveries` row.
- Preserves the original discovered URL (including tracking parameters and anchor fragments), provider-assigned score, snippet, query variant ID, and discovery timestamp.
- If two query variants (e.g. primary query and spec query) discover the same canonical page, **1** row exists in `source_documents` and **2** rows exist in `source_discoveries`.

---

## 3. Deduplication Lifecycle & Concurrency Control

```
Search Execution Service (Step 33)
              │ (NormalizedSearchResult[])
              ▼
   SourceIdentityService
              │
              ├──► Validate URL Security (Step 32 SSRF) ──(Invalid)──► Reject; Record Rejection
              │
              ├──► Canonicalize URL (v1 Policy)
              │
              ▼
[Check Existing Document in Run]
     │
     ├── Found Existing:
     │     - Reuse source_documents.id
     │     - Record Duplicate Discovery (+1 duplicateDiscoveries)
     │     - Insert source_discoveries row
     │
     └── Not Found:
           - Insert into source_documents
           - Handle Potential Concurrency Race (ON CONFLICT uq_source_documents_run_canonical)
           - Record New Unique Source (+1 uniqueSourcesDiscovered)
           - Insert source_discoveries row
```

### 3.1 Concurrency Defense (`upsertOrResolve`)
When multiple concurrent search requests complete simultaneously, two workers may attempt to register the same canonical source within a fraction of a millisecond.

[`SourceDocumentRepository.upsertOrResolve`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/persistence/repositories/source-document.repository.ts) handles this atomically:
1. Queries for existing `(run_id, canonical_url)`.
2. If absent, executes `INSERT INTO source_documents`.
3. If a concurrent transaction inserted the row between lookup and insert, the PostgreSQL engine raises error code `23505` (`unique_violation`).
4. `upsertOrResolve` intercepts error `23505`, recovers by querying the newly inserted record, and safely returns `{ document: resolvedDoc, isNew: false }`.

---

## 4. Title & Content Similarity Non-Equivalence

1. **Title Similarity:** Two distinct URLs with identical or near-identical headlines (e.g. syndicated press releases, different product colors or models) are **never** merged based on title similarity.
2. **Identical URL ≠ Identical Content:** A single canonical URL may serve varying content over time, geo-location, or device type. Canonical URL deduplication establishes resource identity within a run, not proof of content immutability.

