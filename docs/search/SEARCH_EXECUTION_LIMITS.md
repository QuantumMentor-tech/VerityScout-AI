# VerityScout AI — Search Execution Limits & Resource Guardrails

**Document Identifier:** VS-SEARCH-LIMITS-v1.0  
**Status:** APPROVED ENGINEERING SPECIFICATION  
**Phase:** Phase 7 (Step 33 of 60)  
**Author:** Senior Search Systems Architect, Backend Reliability Engineer  
**Classification:** Resource Quotas & Operational Limits  
**Traceability:** Mapped to [ADR-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-005-search-and-extraction-provider-abstraction.md), [MVP_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/MVP_REQUIREMENTS.md) (`NFR-005`), and [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md) (`SEC-035`).

---

## 1. Overview & Architectural Principles

External search APIs consume API credits, incur network latency, and can trigger vendor rate limits or denial-of-service conditions if executed without strict server-side boundaries.

VerityScout AI enforces hard, non-bypassable resource limits within `SearchExecutionService` (`src/server/search/search-execution.service.ts`). Frontend clients and user-controlled parameters cannot expand these bounds.

---

## 2. Hard Execution Limit Specifications

| Guardrail Parameter | Default Value | Hard Architectural Ceiling | Governing Rule / Traceability |
|---|---|---|---|
| **Max Queries per Plan** | `3` variants | **`5` variants** | `SEC-035`, `ADR-005` |
| **Max Results per Query** | `5` URLs | **`20` URLs** | `ADR-005`, `PROVIDER_ADAPTER_CONTRACTS.md` |
| **Aggregate Discovered Results**| `50` URLs | **`100` URLs** | Memory bounding & extraction prevention |
| **Search Concurrency** | `2` parallel workers | **`3` parallel workers** | Rate-limit avoidance |
| **Connection Timeout** | `5,000` ms (5s) | **`5,000` ms** | Step 32 `PUBLIC_RESEARCH_SOURCE_POLICY` |
| **Response Timeout** | `15,000` ms (15s) | **`15,000` ms** | Step 32 / Step 33 transport bound |
| **Total Operation Timeout** | `30,000` ms (30s) | **`45,000` ms** | Worker run threshold |
| **Max Retries** | `0` or `1` transient | **`1` retry** | Transient HTTP 429/5xx only |
| **Max Response Payload** | `5,242,880` bytes (5 MB) | **`5,242,880` bytes** | Streaming ceiling prevents buffer overflow |

---

## 3. Enforcement Mechanisms in Code

### 3.1 Query Count Capping
In `SearchExecutionService.executePlan`:
```typescript
const maxQueries = Math.min(options?.maxQueries ?? 3, 5);
const targetQueryVariants = plan.searchQueries.slice(0, maxQueries);
```
Even if a user or upstream planner provides $>5$ query variants, the service slices strictly up to `maxQueries`, ignoring excess entries and logging the applied bounds.

### 3.2 Result Count Capping
Each search query request enforces:
```typescript
const maxResultsPerQuery = Math.min(options?.maxResultsPerQuery ?? 5, 20);
```
Adapters map this value to the provider's parameter (`max_results` in Tavily, `numResults` in Exa). Furthermore, the adapter slices returned candidate arrays before returning to protect against over-delivering upstream APIs.

### 3.3 Aggregate Result Ceilings
During batch execution across multiple query variants:
```typescript
if (accumulatedResults.length >= maxAggregateResults) {
  break;
}
```
If earlier queries already discover the aggregate limit (e.g. 50 items), subsequent queries in the queue are safely skipped without incurring unnecessary provider credit consumption.

### 3.4 Bounded Concurrency
Queries are scheduled in small parallel batches using a chunked loop:
```typescript
for (let i = 0; i < targetQueryVariants.length; i += concurrency) {
  const batch = targetQueryVariants.slice(i, i + concurrency);
  await Promise.all(batch.map(async (variant) => { ... }));
}
```
This bounds parallel socket allocations and prevents triggering burst rate limits (e.g. Exa's 5 req/s limit or Tavily's 100 req/min limit).

---

## 4. Cancellation & Error Budgeting

1. **Caller Cancellation:** The service monitors `options.signal?.aborted` both before launching batches and inside worker promises. Upon abort, pending queries are discarded, active sockets are destroyed, and the execution summary truthfully records `status: 'CANCELLED'`.
2. **Partial Failure Tolerance:** If query variant 1 succeeds and query variant 2 fails (e.g., due to an upstream rate limit), the service records the failure in `errors`, aggregates the results from variant 1, and marks the run status truthfully as `'PARTIAL'`. It never discards good results or converts failures into empty successes.

