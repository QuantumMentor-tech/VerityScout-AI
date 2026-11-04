# Asynchronous Research Runs and Persistent Worker Integration

**Document Version:** 1.0.0  
**Status:** Approved & Implemented  
**Roadmap Step:** Step 43 of 60 (Phase 9: Model Routing and Asynchronous Research)  
**Governed By:** ADR-002 (Modular Monolith & Worker Separation), ADR-004 (Queue & Scheduler Architecture), DATA_CONTRACTS.md  

---

## 1. Executive Summary & Core Principles

VerityScout AI strictly separates **research request submission** from **long-running research execution**. Complex research runs involve bounded web discovery (Steps 33, 35), safe page extraction (Step 34), fact extraction with verbatim quote grounding (Step 36), attribute normalization (Step 37), deterministic constraint evaluation (Step 38), and AI-driven evidence synthesis (Step 40). These operations take between several seconds to several minutes and must never block interactive HTTP request-response cycles.

### Non-Negotiable Architectural Invariants

1. **Durable Job Acceptance First**: A research run is NEVER reported as `QUEUED` to the user until both the research task, research run, and persistent queue record have been durably written and committed to the PostgreSQL database within an atomic transaction.
2. **Persistence Prior to Completion**: A run is NEVER reported as `COMPLETED` until all discovered sources, extracted claims, candidate evaluations, and the final synthesized report are 100% persisted to the relational database.
3. **Strict Concurrency-Safe Dequeue**: Queue workers claim jobs atomically using `SELECT ... FOR UPDATE SKIP LOCKED`, preventing double-processing and race conditions across multiple daemon instances without distributed locking deadlocks.
4. **Owner-Isolated Ingestion & Polling**: All API operations (`POST /api/research/runs`, `GET /api/research/runs/[runId]`, `GET /api/research/runs/[runId]/results`) enforce tenant authentication and row-level ownership.

---

## 2. Architecture & Subsystem Interaction

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HTTP Client / Frontend                          │
│        (QueryComposer -> POST /api/research/runs -> 202 Accepted)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         Atomically Inserts
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL Database                           │
│  ├── research_tasks (id, user_id, original_query, constraints)         │
│  ├── research_runs (id, task_id, status: 'QUEUED', current_stage)      │
│  └── research_job_queue (id, run_id, status: 'QUEUED', priority)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  SELECT ... FOR UPDATE SKIP LOCKED
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Persistent Research Worker Daemon                    │
│   (src/server/worker/research-worker.ts -> ResearchWorker.runOnce)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                 Executes Full Multi-Stage Pipeline
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      ResearchPipelineOrchestrator                      │
│                                                                        │
│   1. PLANNING (Step 31): ResearchPlannerService.planResearch           │
│   2. ROUTING (Step 42): ModelRouterService (AUTO_PICK selection)       │
│   3. SEARCHING (Steps 33 & 35): SearchExecution & SourceIdentity       │
│   4. EXTRACTING (Step 34): SourceExtractionService (direct_safe_fetch) │
│   5. VERIFYING (Step 36): ClaimExtractionService (grounded quotes)     │
│   6. NORMALIZING (Step 37): ProductNormalizationService                │
│   7. EVALUATING (Steps 38-39): ConstraintEvaluationService             │
│   8. SYNTHESIZING (Step 40): ResearchSynthesisService                  │
│   9. FINALIZING: Persist candidate_results, evidence_records, run      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         Acknowledge or Fail
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│           Job Queue State -> COMPLETED (or FAILED on error)            │
│               Run State -> COMPLETED, progress: 100%                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema: Migration 0005

The persistent queue is governed by migration `0005_research_job_queue.sql`:

```sql
CREATE TABLE IF NOT EXISTS research_job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    claimed_by VARCHAR(128) NULL,
    claimed_at TIMESTAMPTZ NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_research_job_queue_status CHECK (status IN (
        'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'
    )),
    CONSTRAINT uq_research_job_queue_run_id UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS idx_research_job_queue_dequeue
ON research_job_queue(priority DESC, created_at ASC)
WHERE status = 'QUEUED';

ALTER TABLE research_job_queue ENABLE ROW LEVEL SECURITY;
```

---

## 4. Atomic Dequeue Algorithm (`SKIP LOCKED`)

In `PostgresJobQueueAdapter.claimNextJob(workerId)`:

```sql
WITH next_job AS (
  SELECT id
  FROM research_job_queue
  WHERE status = 'QUEUED'
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE research_job_queue q
SET status = 'PROCESSING',
    claimed_by = $1,
    claimed_at = NOW(),
    attempts = q.attempts + 1,
    updated_at = NOW()
FROM next_job
WHERE q.id = next_job.id
RETURNING q.id, q.run_id, q.task_id, q.user_id, q.priority, q.attempts, q.payload;
```

**Properties:**
- **Zero Lock Contention**: Concurrent workers attempting to claim jobs concurrently skip locked rows immediately and pick up the next available job without blocking each other.
- **Strict FIFO with Priority**: Higher priority jobs (e.g. priority `10`) are claimed before standard priority `0`, with tie-breaking governed by `created_at ASC`.

---

## 5. API Endpoints

### 5.1 Submission: `POST /api/research/runs`
- **Authentication**: Required (`requireAuthenticatedCaller()`).
- **Validation**:
  - `query`: string, 3 to 2,000 characters.
  - `taskType`: enum (`PRODUCT_RESEARCH`, `GENERAL_RESEARCH`, `PRICE_MONITOR`, `SPEC_VERIFICATION`).
  - `priority`: integer between -10 and 10 (default: 0).
- **Response**: `202 Accepted`
  ```json
  {
    "runId": "22222222-2222-4222-a222-222222222222",
    "taskId": "33333333-3333-4333-a333-333333333333",
    "status": "QUEUED",
    "message": "Research run submitted and durably queued for execution.",
    "createdAt": "2026-11-04T12:00:00.000Z"
  }
  ```

### 5.2 Status: `GET /api/research/runs/[runId]`
- **Authentication**: Required with owner validation (`user_id = caller.userId`).
- **Response**: `200 OK`
  ```json
  {
    "id": "22222222-2222-4222-a222-222222222222",
    "taskId": "33333333-3333-4333-a333-333333333333",
    "status": "RUNNING",
    "currentStage": "SEARCHING",
    "stageCounters": {
      "queriesExecuted": 3,
      "sourcesDiscovered": 6,
      "sourcesExtracted": 0,
      "claimsVerified": 0
    },
    "startedAt": "2026-11-04T12:00:00.000Z",
    "completedAt": null
  }
  ```

### 5.3 Results: `GET /api/research/runs/[runId]/results`
- **When In-Progress**: Returns HTTP 200 with `{ "completed": false, "status": "RUNNING" }`.
- **When Failed**: Returns HTTP 200 with `{ "completed": false, "status": "FAILED", "error": "..." }`.
- **When Completed**: Returns HTTP 200 with:
  - `completed: true`
  - `run`: Full research run metadata.
  - `synthesis`: Evidence-linked synthesis output with citations and findings.
  - `candidates`: Verified candidate records with match classifications.
  - `evidence`: Grounded evidence records with verbatim excerpts and char offsets.
  - `sources`: Discovered and extracted source documents.

---

## 6. Worker Daemon Lifecycle & CLI

The worker daemon is implemented in `src/server/worker/research-worker.ts` and runnable via:

```bash
npm run worker
```

**Lifecycle Capabilities:**
- **Dynamic Polling**: Automatically polls when idle, but immediately claims next job without sleep when work is pending.
- **Graceful Shutdown**: Traps `SIGINT` and `SIGTERM`, allows in-flight jobs to complete their transactional persistence before exiting, preventing corrupt intermediate states.
- **Error Isolation**: Catches all unhandled pipeline errors, persists safe non-disclosing error messages to `research_runs.error_message`, and marks the queue row as `FAILED`.

