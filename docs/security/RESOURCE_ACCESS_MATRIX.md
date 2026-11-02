# Resource Access Matrix & Tenant Isolation Map

**Document ID:** SEC-RAM-001  
**Status:** Approved & Enforced (Step 24)  
**Security Level:** High / Multi-Tenant Isolation  

---

## 1. Domain Resource Access Matrix

The following matrix documents every domain resource, its ownership relationship, enforced operations, enforcement locations, database policies, and test coverage.

| Resource Type | Ownership Relationship | Implemented Operations | Required Identity | DAL Enforcement Location | Database Policy (RLS) | Security Test Coverage | Known Gaps / Deferred Work |
|---|---|---|---|---|---|---|---|
| `research_tasks` | Direct `user_id` ownership | `create`, `findById`, `listByOwner`, `update`, `archive` | Valid session (`users.id`) | `ResearchTaskRepository` (`WHERE id = $1 AND user_id = $2`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-TASK-001`, `OWN-TASK-002`, `AUTHZ-003` | Team / shared workspaces deferred to post-MVP. |
| `research_runs` | Linked to `task_id` and owned by `user_id` | `create`, `findById`, `listByTaskId`, `listByOwner`, `updateStatus`, `cancel` | Valid session (`users.id`) | `ResearchRunRepository` (`WHERE id = $1 AND user_id = $2`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-RUN-001`, `OWN-RUN-002`, `OWN-RUN-003` | Live async execution deferred to Phase 6. |
| `source_documents` | Linked to `run_id` and owned by `user_id` | `create`, `findById`, `listByRunId` | Valid session (`users.id`) | `SourceDocumentRepository` (`WHERE id = $1 AND user_id = $2`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-SRC-001`, `OWN-SRC-002` | Live web crawling deferred to Step 29+. |
| `candidate_results` | Linked to `run_id` and owned by `user_id` | `createWithEvidence`, `findById`, `listByRunId` | Valid session (`users.id`) | `CandidateResultRepository` (`WHERE id = $1 AND user_id = $2`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-CAND-001`, `OWN-CAND-002` (Anti-ID substitution) | AI synthesis engine deferred to Phase 8. |
| `evidence_records` | Linked to `source_id`, `run_id`, and owned by `user_id` | `create`, `findById`, `listBySourceId`, `listByRunId` | Valid session (`users.id`) | `EvidenceRecordRepository` (`WHERE id = $1 AND user_id = $2`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-EVID-001`, `OWN-EVID-002` | NLI deterministic verification deferred to Phase 7. |
| `candidate_evidence_links` | Junction linking candidate and evidence | `createWithEvidence` | Valid session (`users.id`) | Transactional check: evidence must belong to `input.userId` | `rls_tenant_isolation` (`candidate_id` / `evidence_id` owner check) | `OWN-CAND-002` | None. |
| `provider_configs` | Direct `user_id` ownership | `upsert`, `findByType`, `listByOwner`, `delete` | Valid session (`users.id`) | `ProviderConfigRepository` (`WHERE user_id = $1`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-PROV-001`, `OWN-PROV-002` | Secret key encryption deferred to Step 25. |
| `research_schedules` | Linked to `task_id` and owned by `user_id` | `create`, `findByTaskId`, `updateStatus` | Valid session (`users.id`) | `ResearchScheduleRepository` (`WHERE task_id = $1 AND user_id = $2`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-SCHED-001`, `OWN-SCHED-002` | Cron worker deferred to Phase 9. |
| `change_events` | Linked to `task_id` and owned by `user_id` | `create`, `findById`, `listByTaskId` | Valid session (`users.id`) | `ChangeEventRepository` (`WHERE id = $1 AND user_id = $2`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-EVENT-001`, `OWN-EVENT-002` | Webhook notifications deferred to Phase 10. |
| `usage_ledger` | Linked to `run_id` and owned by `user_id` | `record`, `listByRunId`, `getAggregatedCostByTask`, `getAggregatedCostByOwner` | Valid session (`users.id`) | `UsageLedgerRepository` (`WHERE user_id = $1`) | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `OWN-USAGE-001`, `OWN-USAGE-002` | Stripe billing integration deferred to Phase 11. |
| `sessions` | Direct `user_id` ownership | `createSession`, `getCurrentUser`, `revokeSession` | Valid cookie / session token | `SessionRepository` / `session.ts` | `rls_tenant_isolation` (`user_id = app.current_user_id`) | `AUTH-001` - `AUTH-006` | Multi-factor authentication deferred to post-MVP. |

---

## 2. Unimplemented / Future Resources (Explicitly Marked)

The following resources from the 60-step roadmap do not yet exist in the codebase and are explicitly marked as **NOT IMPLEMENTED**:

- **Provider Credential Vault Secrets:** Reserved for Step 25.
- **Search Provider Cache Records:** Reserved for Step 29.
- **Web Extraction Artifacts:** Reserved for Step 30.
- **Deterministic Claim Verification Graph:** Reserved for Step 33.
- **Export Artifacts (PDF/JSON/Markdown):** Reserved for Step 49.
- **Team / Organization Workspaces:** Out of scope for individual user MVP.
