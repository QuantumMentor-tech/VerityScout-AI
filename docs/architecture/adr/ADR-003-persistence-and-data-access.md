# ADR-003: Persistent Relational Database & Data-Access Architecture

**Status:** APPROVED (Candidate Managed Platform: Supabase / PostgreSQL)  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Database Architect  
**Related Requirements:** UR-013, UR-014, UR-020, NFR-007, NFR-008  
**Traceability:** Implements [DEC-004](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [AC-013](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-013-research-run-history-and-detail-view), [AC-038](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-038-sanitized-audit-logging-and-secret-redaction)

---

## 1. Context and Problem Statement

VerityScout AI stores complex, highly structured relational entities: users, research tasks, execution runs, candidate results, source URLs, extracted evidence records, recurring schedules, and change events. Every result must trace back to its exact evidence records via foreign keys, and deleting a task must cascade clean all associated historical records without leaving orphaned data. The database must support transactional integrity, row-level tenant isolation, and migration versioning.

## 2. Considered Alternatives

1. **Alternative 1: PostgreSQL with Prisma ORM / Typed SQL Migrations** *(Chosen)*
2. **Alternative 2: Document Store (MongoDB / DynamoDB)**
3. **Alternative 3: Vector Database as Primary Store (Pinecone / Qdrant)**

## 3. Decision Outcome & Chosen Approach

We adopt **PostgreSQL as the authoritative persistence engine**, with Supabase as the planned managed platform.

### Key Architectural Tenets:
- **Relational Integrity & Foreign Keys:** Strict foreign key constraints with `ON DELETE CASCADE` from `research_tasks` to `research_runs`, `candidate_results`, `evidence_records`, and `change_events` (`SEC-033`).
- **PostgreSQL Row Level Security (RLS):** All tables enforce `user_id = auth.uid()` to guarantee defense-in-depth isolation across tenants (`SEC-008`).
- **Precision Monetary Values:** Monetary fields (prices, budgets, token costs) are stored using `NUMERIC(12, 4)` or integer cents to prevent binary floating-point rounding errors (`UR-008`).
- **Data Minimization:** Raw full-page HTML is discarded; only normalized text excerpts (max 50KB) and structured attributes are stored in `evidence_records` (`SEC-032`).
- **Database Migrations:** Version-controlled SQL migration files executed sequentially, supporting forward migrations and rollback procedures (`NFR-008`).

## 4. Consequences and Trade-offs

- **Benefits:**
  - Complete ACID transaction guarantees across runs and change detection snapshots.
  - Relational indexes (`task_id`, `run_id`, `canonical_url`) guarantee fast query times (<50ms).
  - PostgreSQL's JSONB data type allows storing flexible provider metadata and dynamic product specification tables without schema bloat.
- **Trade-offs:**
  - Requires maintaining disciplined migration files across development, staging, and production environments.

## 5. Security & Privacy Implications

- Prevents Broken Object-Level Authorization (BOLA) and SQL injection: all queries are parameterized (`SEC-023`, `VS-THR-004`).
- User API keys are stored in an encrypted session vault table using AES-256-GCM, separate from general task metadata (`SEC-002`, `VS-THR-003`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 21 (Data Model & Schema), Step 22 (Persistence & Transactions), Step 24 (Authorization & RLS).
- **Validation Criteria:** Integration test suite verifying multi-table transactions, foreign-key cascade purges, and automated schema rollback checks (`AC-028`).
