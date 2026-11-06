# Integration Test Specifications (Step 52)

**Phase:** Phase 11, Quality Assurance and Security  
**Step:** 52 of 60  
**Title:** Integration Tests for Database, Providers, Queue, and Scheduler  
**Standard:** Deterministic, Isolated, Zero Live External Network Calls, Failure-Aware, Transaction-Safe  

---

## 1. Architecture Overview

Integration tests validate real interactions across internal architectural boundaries without invoking live external third-party paid inference APIs or requiring active external Docker / PostgreSQL daemons.

### 1.1 In-Memory PostgreSQL Integration Engine (`tests/integration/helpers/test-db.ts`)
- Powered by `pg-mem`, providing a fully compliant in-process PostgreSQL 16 engine.
- Automatically applies all 11 versioned migration files in chronological sequence:
  - `0001_initial_schema.sql`
  - `0002_local_auth.sql`
  - `0003_enforce_rls_isolation.sql`
  - `0004_source_deduplication_and_discoveries.sql`
  - `0005_research_job_queue.sql`
  - `0006_progress_tracking_cancellation_recovery.sql`
  - `0007_usage_accounting_and_concurrency.sql`
  - `0008_recurring_research_schedules.sql`
  - `0009_idempotent_schedule_occurrences.sql`
  - `0010_research_result_change_detection.sql`
  - `0011_in_app_notifications.sql`
- Registers core cryptographic (`gen_random_uuid`) and string length primitives (`length`, `octet_length`).
- Wraps the pg connection pool to provide true transaction rollbacks and nested `SAVEPOINT` semantics via in-memory snapshot backups.

---

## 2. Integration Test Suites & Boundary Coverage

### Suite 1: Schema Migrations & Constraints
- **File:** `tests/integration/database/migrations-and-schema.integration.test.ts`
- **Boundaries Verified:**
  - Presence of all 20 canonical application tables in the `public` schema.
  - Foreign key constraint enforcement (attempted orphan run rejected).
  - Cascade delete behavior (`research_tasks` deletion automatically cascades to `research_runs`).
  - Unique constraint violations (`(task_id, idempotency_key)` uniqueness).
  - Column check constraints (`task_type` allowlist).

### Suite 2: Repositories, ACID Transactions & Multi-Tenant Isolation
- **File:** `tests/integration/database/repositories-and-transactions.integration.test.ts`
- **Boundaries Verified:**
  - `ResearchTaskRepository` CRUD, soft archive, and search scoping.
  - `ResearchRunRepository`, `CandidateResultRepository`, and `EvidenceRecordRepository` creation and state transitions.
  - `CandidateResultRepository.createWithEvidence` atomic transaction with junction table linking.
  - `NotificationRepository` persistence, unread counter queries, and read status transitions.
  - Multi-tenant data isolation: Alice's tasks cannot be viewed, listed, or mutated by Bob.
  - ACID transaction atomicity: `withTransaction` rollbacks completely discard changes upon mid-operation failure.

### Suite 3: Persistent Research Job Queue & Worker Daemon
- **File:** `tests/integration/queue/queue-worker.integration.test.ts`
- **Boundaries Verified:**
  - `IResearchJobQueue` lifecycle: `enqueue` $\rightarrow$ `claimNextJob` $\rightarrow$ `ackJob`.
  - Single-run enqueue idempotency (duplicate runs rejected).
  - Single deterministic tick execution via `ResearchWorker.runOnce()`.
  - Stale lease recovery via `ResearchRecoveryService.reconcileStaleJobs()` after worker lease expiration.
  - Exponential backoff retry scheduling upon retryable errors.

### Suite 4: Recurring Schedules & Occurrences
- **File:** `tests/integration/scheduler/scheduler-occurrence.integration.test.ts`
- **Boundaries Verified:**
  - `ResearchSchedulerService.evaluateAndDispatchDueSchedules` scans due schedules, creates durable `schedule_occurrences`, enqueues jobs into `PostgresJobQueueAdapter`, and advances `next_run_at`.
  - Occurrence idempotency: `createOrGet` guarantees no duplicate records for the same `(schedule_id, scheduled_at)`.
  - `ScheduleLifecycleService` pause/resume state machine: paused schedules are excluded from evaluation and resume recalculates clean future run times.

### Suite 5: Cross-Domain Research Pipeline
- **File:** `tests/integration/pipeline/cross-domain-pipeline.integration.test.ts`
- **Boundaries Verified:**
  - Complete backend lifecycle flow:
    1. Baseline Research Run ($1,000 price observation).
    2. Subsequent Research Run ($850 price observation).
    3. Step 48 `ChangeDetectorService.compareRuns()` detects `PRICE_DROP` (15% decrease).
    4. Step 50 `NotificationService.processComparisonChanges()` evaluates eligibility and persists in-app notification.
    5. Event-level idempotency ensures duplicate comparison processing never duplicates in-app alerts.

---

## 3. Execution Commands

```bash
# Run all integration test suites
npm run test:integration

# Run provider contract test suites
npm run test:contracts

# Run unit test suites
npm run test:unit

# Full test execution
npm test
```

