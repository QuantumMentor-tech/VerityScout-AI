# Authorization, Resource Ownership, Tenant Isolation, and Row-Level Security

**Document ID:** SEC-AUTHZ-001  
**Status:** Approved & Enforced (Step 24)  
**Security Level:** High / Defense-in-Depth  
**Target Platform:** Next.js App Router (Server-Only Data Access Layer) & PostgreSQL 16  

---

## 1. Executive Summary & Authorization Architecture

VerityScout AI operates on a **strict zero-trust, tenant-isolated data ownership model**. In accordance with the application security standards established in Step 24:
1. **Never Trust Browser Inputs:** No client-supplied `userId`, query parameter, hidden field, or JSON attribute is accepted as authoritative for identity, ownership, or authorization.
2. **Independent Verification on Every Protected Operation:** Identity is resolved on the server via cryptographic session cookies (`auth_session`), and ownership boundaries are enforced at the Data Access Layer (DAL) and reinforced at the PostgreSQL Row-Level Security (RLS) boundary.
3. **Fail-Closed Semantics:** Any unauthenticated request to private resources receives an immediate HTTP 401 response; unauthorized requests to existing private resources receive an HTTP 404 (`ResourceNotFoundError`) by default to prevent cross-tenant resource enumeration and ID mapping attacks.

```
                    ┌───────────────────────────────┐
                    │  Incoming Request (Browser)   │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
             ┌─────────────────────────────────────────────┐
             │ Server-Side Identity Resolution (Step 23)   │
             │ - requireAuthenticatedCaller()              │
             │ - Validates secure HTTP-only session cookie │
             └─────────────────────┬───────────────────────┘
                                   │ Canonical userId (UUID)
                                   ▼
             ┌─────────────────────────────────────────────┐
             │ Centralized Authorization Helpers (Step 24) │
             │ - assertResourceOwnership()                 │
             │ - assertParentChildOwnership()              │
             │ - Anti-ID Substitution Verification         │
             └─────────────────────┬───────────────────────┘
                                   │
                                   ▼
             ┌─────────────────────────────────────────────┐
             │ Data Access Layer / Repositories            │
             │ - Owner-scoped WHERE clauses (WHERE user_id)│
             │ - Explicit parameter binding ($1, $2)       │
             └─────────────────────┬───────────────────────┘
                                   │
                                   ▼
             ┌─────────────────────────────────────────────┐
             │ PostgreSQL 16 Database Boundary             │
             │ - withUserContext(userId, ...)              │
             │ - set_config('app.current_user_id', $1, true│
             │ - Strict Fail-Closed RLS Policies (0003)    │
             └─────────────────────────────────────────────┘
```

---

## 2. Canonical Identity-to-Owner Mapping

1. **Authentication Verification:** The caller's session token is verified via `getCurrentUser()` in `src/server/auth/session.ts`. The session token must match an active, unexpired record in the `sessions` table.
2. **Canonical Application Owner ID:** The verified identity is represented as an immutable UUID `userId` corresponding to `users.id`.
3. **Session Rejection:** If the session is missing, invalid, expired, or revoked, the centralized helper `requireAuthenticatedCaller()` throws an `UnauthenticatedError` (HTTP 401).

---

## 3. Implemented Domain Entities & Ownership Semantics

Every private resource in VerityScout AI maps directly to a verified user tenant:

| Entity Name | Primary Key | Owner Column | Ownership Type | Relationship / Scoping Rules |
|---|---|---|---|---|
| `research_tasks` | `id` (UUID) | `user_id` | Direct Owner | Scoped by `user_id`. Cannot be forged on creation or reassigned on update. |
| `research_runs` | `id` (UUID) | `user_id` | Direct + Parent | Linked to `task_id` AND `user_id`. All run operations require `user_id` verification. |
| `source_documents` | `id` (UUID) | `user_id` | Direct + Run | Linked to `run_id` AND `user_id`. Lookups scoped by `id` and `user_id`. |
| `candidate_results` | `id` (UUID) | `user_id` | Direct + Run | Linked to `run_id` AND `user_id`. Mutations scoped by `user_id`. |
| `evidence_records` | `id` (UUID) | `user_id` | Direct + Source | Linked to `source_id`, `run_id`, and `user_id`. Lookups scoped by `user_id`. |
| `candidate_evidence_links` | `(candidate_id, evidence_id)` | Via junction | Junction | Anti-ID substitution: enforces that both candidate AND evidence belong to the caller. |
| `provider_configs` | `id` (UUID) | `user_id` | Direct Owner | Scoped by `user_id`. Unique per `(user_id, provider_type)`. |
| `research_schedules` | `id` (UUID) | `user_id` | Direct + Task | Scoped by `task_id` AND `user_id`. Toggle/update verifies ownership. |
| `change_events` | `id` (UUID) | `user_id` | Direct + Task | Audit trail records scoped by `task_id` AND `user_id`. |
| `usage_ledger` | `id` (UUID) | `user_id` | Direct + Run | Financial/token spend accounting records scoped by `user_id`. |

---

## 4. Anti-ID Substitution & Junction Verification

A critical security vulnerability in multi-tenant systems is **ID substitution**, wherein an attacker with a valid account attempts to associate their own parent record (e.g. Candidate B) with another user's child record (e.g. Evidence A).

In VerityScout AI, this is strictly prevented by repository-level validation:
- In `CandidateResultRepository.createWithEvidence()`, during candidate creation with linked evidence, the repository queries `SELECT user_id FROM evidence_records WHERE id = $1`.
- If `evidenceRecord.user_id !== input.userId`, the transaction immediately aborts with an `UnauthorizedError`:
  `"Cannot link evidence record belonging to another user (anti-ID substitution)"`.

---

## 5. Denial Semantics & Anti-Enumeration

VerityScout AI enforces consistent denial responses:
- **Unauthenticated (HTTP 401):** Thrown via `UnauthenticatedError`. Informs API consumers that a valid session is required.
- **Unauthorized (HTTP 404):** Thrown via `ResourceNotFoundError` when an authenticated user attempts to access a resource owned by another tenant. By returning 404 instead of 403, the application prevents attackers from determining whether a specific UUID exists in the database.
- **Explicit Forbidden (HTTP 403):** Reserved for actions where the user knows the resource exists (e.g., attempting an illegal lifecycle transition on their own resource), or when `hideExistence: false` is explicitly specified.

---

## 6. PostgreSQL Row-Level Security (RLS) Architecture

### 6.1 Defense-in-Depth Implementation
RLS is applied to all 11 private tables via migration `0003_enforce_rls_isolation.sql`:
```sql
ALTER TABLE research_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
```

### 6.2 Fail-Closed Policy Design
Each table is protected by a strict policy matching the session setting:
```sql
CREATE POLICY rls_tenant_isolation ON research_tasks
  FOR ALL
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);
```
- If `app.current_user_id` is unset or empty, `current_setting(..., true)` returns `''`.
- `NULLIF('', '')` evaluates to `NULL`.
- In SQL, `user_id = NULL` evaluates to `UNKNOWN` (falsy), meaning **zero rows are returned and zero rows can be modified**. The database fails closed by default.

### 6.3 Safe Connection Pool Propagation (`withUserContext`)
To prevent identity context contamination across connection pooling:
```typescript
await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
```
- The third argument `is_local = true` ensures that the configuration parameter is scoped strictly to the current database transaction.
- When the transaction commits or rolls back, PostgreSQL automatically discards the setting.
- In addition, `withUserContext()` wraps execution in `try ... finally` and unconditionally issues `RESET app.current_user_id` when releasing non-transactional clients, guaranteeing complete pool hygiene.

---

## 7. Operational Guidelines for Future Roadmap Steps

1. **Step 25 (Provider Credential Storage):** Must use `ProviderConfigRepository` with `user_id` scoping. No secret or vault key may be decrypted or returned across tenant boundaries.
2. **Phase 6+ Background Workers & Execution Engine:** Any asynchronous research engine job must run within a verified `userId` context, inheriting ownership parameters directly from the parent `research_tasks` record.
