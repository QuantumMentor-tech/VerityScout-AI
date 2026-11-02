# Repository Architecture and Transaction Management Guide

**Document Identifier:** VS-DOC-REPOSITORIES-v1.0  
**Phase:** Phase 5 of 12 (Database, Authentication, and Persistence)  
**Step:** 22 of 60  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Governing Documents:** `ADR-003`, `ADR-010`, `DATABASE_SCHEMA.md`

---

## 1. Architectural Role and Layering

The database persistence layer is located in [`src/server/persistence/`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/persistence) and strictly operates on the server:

```text
src/server/persistence/
├── database.ts                      # Centralized pool singleton & client checkout
├── transaction.ts                   # ACID transaction runner with savepoint support
├── types.ts                         # Strongly typed row contracts & domain enums
├── migrations/                      # Version-controlled SQL migration scripts & engine
└── repositories/                    # Domain-oriented repositories
    ├── base.repository.ts           # Query execution, allowlisted sorting, pagination
    ├── research-task.repository.ts
    ├── research-run.repository.ts
    ├── source-document.repository.ts
    ├── evidence-record.repository.ts
    ├── candidate-result.repository.ts
    ├── provider-config.repository.ts
    ├── research-schedule.repository.ts
    ├── change-event.repository.ts
    └── usage-ledger.repository.ts
```

### Server Boundary Invariant:
All files import `'server-only';`. Persistence repositories and database pool clients must never be imported into React Client Components or bundled into browser assets.

---

## 2. Connection Pool Management & Lifecycle

- Centralized singleton connection pool via `pg.Pool` (`getPool()`).
- Configuration is loaded and validated through [`server-env.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/lib/config/server-env.ts).
- Default limits: max 10 connections, 30s idle timeout, 5s connection acquisition timeout.
- Clean draining via `closePool()` during application shutdown and automated test teardown.

### Credential Protection:
All error logging and connection telemetry uses `redactDatabaseUrl()`, replacing database passwords with `*****`. Credentials are never logged or exposed in stack traces.

---

## 3. Parameterized Query Enforcement & SQL Safety

1. **Mandatory Parameterization:** All dynamic values (identifiers, search terms, filters, JSON payloads) must be passed as parameterized positional variables (`$1`, `$2`, ...). String concatenation into SQL queries is strictly prohibited (`SEC-023`).
2. **Strict Allowlisting for Sorting:** Dynamic `ORDER BY` clauses are sanitized via `sanitizeOrderBy()`, strictly validating requested column names against a predefined list of schema attributes. Any unallowlisted column immediately falls back to a deterministic safe default (e.g. `created_at DESC`).
3. **Bounded Pagination:** Bounded limit/offset pagination via `resolvePagination()` clamps page numbers to $\ge 1$ and limits to a maximum of 100 rows per request.

---

## 4. Transaction Management & Atomic Multi-Table Workflows

Atomic operations across multiple tables are managed via `withTransaction`:

```typescript
import { withTransaction } from '@/server/persistence/transaction';

const candidate = await withTransaction(async (tx) => {
  // 1. Insert candidate result
  const cand = await candidateRepo.create(candidateData, tx);

  // 2. Insert junction records linking candidate to supporting evidence
  await tx.query(
    'INSERT INTO candidate_evidence_links (candidate_id, evidence_record_id, claim_type) VALUES ($1, $2, $3)',
    [cand.id, evidenceId, 'price']
  );

  return cand;
});
```

### Commit & Rollback Semantics:
- **Top-Level Transactions:** Executes `BEGIN`, runs the user callback, executes `COMMIT` on success, and releases the connection in a `finally` block.
- **Error Handling & Rollback:** If any error occurs, `ROLLBACK` is issued. The original error is preserved and rethrown; secondary errors during rollback are captured to error logs without masking the primary exception.
- **Nested Transactions:** When an existing client connection is passed to `withTransaction`, a `SAVEPOINT` (`sp_<timestamp>_<rand>`) is created. If the nested block succeeds, the savepoint is released; if it fails, it rolls back to the savepoint without breaking the outer transaction.

---

## 5. Domain Repository Responsibilities

| Repository | Entity | Key Operations & Integrity Invariants |
| :--- | :--- | :--- |
| `ResearchTaskRepository` | `research_tasks` | Task creation, owner-scoped lookups, JSONB constraint updates, soft-archival (`is_archived = true`). |
| `ResearchRunRepository` | `research_runs` | Run lifecycle state machine transitions (`QUEUED` $\to$ `RUNNING` $\to$ `COMPLETED` / `FAILED`), stage tracking, atomic telemetry updates (`stage_counters`). |
| `SourceDocumentRepository` | `source_documents` | Access & extraction status, HTTP status codes, defensive 50KB excerpt cap enforcement (`SEC-032`). |
| `EvidenceRecordRepository` | `evidence_records` | Verbatim excerpts, character offsets, verification states (`SUPPORTED`, `CONTRADICTED`, `UNKNOWN`, `CONFLICTING`, `STALE`), strictly referencing `source_document_id`. |
| `CandidateResultRepository` | `candidate_results` | Match classification, exact decimal prices (`NUMERIC(12, 4)`), structured specs, atomic multi-table linking with `candidate_evidence_links`. |
| `ProviderConfigRepository` | `provider_configurations` | Non-secret provider metadata only (`is_enabled`, `is_healthy`, `credential_preview`). Plaintext API keys strictly excluded. |
| `ResearchScheduleRepository` | `research_schedules` | Cron recurrence rules, explicit IANA timezones, consecutive failure counts, and circuit-breaker tripping (`DISABLED_ERROR` upon 5 consecutive failures). |
| `ChangeEventRepository` | `change_events` | Immutable historical diff audit records across research runs (entity diff, previous/new value JSONB). |
| `UsageLedgerRepository` | `usage_ledger` | Immutable financial query & token accounting, exact numeric costs (`NUMERIC(12, 6)`), run and task cost aggregations. |

---

## 6. Explicit Non-Goals & Step 23/24 Boundaries

- **No Runtime Authentication:** User authentication, password hashing, session tokens, and identity management belong strictly to **Step 23**.
- **No Active RLS Session Context:** Setting `app.current_user_id` session context in database connections belongs to **Step 24**. Repositories provide ownership scoping via parameterized `user_id = $x` queries as defense-in-depth.
- **No Background Queue Processing:** Asynchronous BullMQ workers and worker job processors belong to **Step 25 / Step 43**.
