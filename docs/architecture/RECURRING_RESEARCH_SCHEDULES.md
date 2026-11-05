# VerityScout AI — Recurring Research Schedules and Timezone-Aware Scheduling

**Architecture Document**  
**Phase:** 10 of 12 (Research Scheduling and Change Monitoring)  
**Step:** 46 of 60  
**Status:** Approved Canonical Specification  
**Governing Documents:** ADR-002, ADR-004, ADR-010, DATA_CONTRACTS.md  

---

## 1. Overview and Core Principles

VerityScout AI enables evidence-grounded research to run continuously and autonomously. Step 46 establishes the foundational server-side recurring research scheduling system that evaluates recurrence rules over time and safely dispatches jobs through the established asynchronous pipeline.

### Core Non-Negotiable Architectural Principles:
1. **Durable Server-Side Authority:**
   - A recurring schedule is persisted in PostgreSQL (`research_schedules`) and evaluated by server-side daemons.
   - An open browser tab or client-side timer is **never** required for a scheduled research run to execute.
2. **True IANA Timezone Correctness:**
   - Scheduled local times (e.g. 09:00) are interpreted using a validated IANA timezone (e.g. `America/New_York`, `Europe/London`, `Asia/Karachi`).
   - A daily schedule running at 09:00 local time remains at 09:00 local time across daylight-saving transitions, rather than drifting by a fixed 24-hour UTC addition.
3. **Deterministic Recurrence Evaluation:**
   - Next-run calculation is a pure, testable function accepting an injected reference timestamp, enabling deterministic test fixtures for leap years, month boundaries, and daylight-saving transitions.
4. **Persistent Queue Dispatch:**
   - When a schedule is due, the scheduler creates a child `research_runs` record and enqueues work into the persistent PostgreSQL job queue (`research_jobs` via `IResearchJobQueue` from Step 43). The scheduler never executes research synchronously.
5. **Safe Dispatch Consistency:**
   - Advances `next_run_at`, updates `last_dispatched_at`, and links `last_run_id` atomically within a transaction. If dispatch fails, the schedule does not falsely advance.
6. **Bounded Missed-Execution Policy:**
   - If the server is offline when a schedule becomes due, upon restart the scheduler executes at most **one** catch-up run and immediately advances `next_run_at` to the upcoming future occurrence, preventing backlog stampedes.

---

## 2. Relational Schema Architecture (Migration 0008)

Migration `0008_recurring_research_schedules.sql` enriches the `research_schedules` table established in Step 21:

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique schedule identifier |
| `task_id` | `UUID` | `NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE` | Template task defining the research parameters |
| `user_id` | `UUID` | `NOT NULL` | Tenant owner identifier (Row-Level Security isolated) |
| `name` | `VARCHAR(255)` | `NULL` | User-defined label for the schedule |
| `status` | `VARCHAR(50)` | `NOT NULL DEFAULT 'ACTIVE'` | `ACTIVE`, `PAUSED`, `DISABLED_ERROR`, `ARCHIVED` |
| `cron_expression` | `VARCHAR(100)` | `NOT NULL` | Standard cron string representation |
| `recurrence_rule` | `JSONB` | `NULL` | Structured definition (`frequency`, `time`, `interval`, `weekdays`, `dayOfMonth`, `monthBoundaryPolicy`) |
| `scheduled_time` | `VARCHAR(10)` | `NULL` | 24-hour local wall-clock time string (e.g. `'09:00'`) |
| `request_snapshot` | `JSONB` | `NULL` | Snapshot of query, constraints, and model policy at creation |
| `timezone` | `VARCHAR(100)` | `NOT NULL DEFAULT 'UTC'` | Validated IANA timezone identifier |
| `next_run_at` | `TIMESTAMPTZ` | `NOT NULL` | Authoritative UTC timestamp of upcoming execution |
| `last_run_at` | `TIMESTAMPTZ` | `NULL` | Timestamp when the most recent run started/completed |
| `last_dispatched_at` | `TIMESTAMPTZ` | `NULL` | Timestamp when the scheduler claimed and enqueued the run |
| `last_run_id` | `UUID` | `NULL REFERENCES research_runs(id) ON DELETE SET NULL` | Pointer to the latest research run |
| `consecutive_failures` | `INT` | `NOT NULL DEFAULT 0` | Circuit breaker failure counter |
| `change_notification_threshold_pct` | `NUMERIC(5, 2)` | `NOT NULL DEFAULT 2.00` | Sensitivity threshold for price/change alerts |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record update timestamp |

### Indexes & Performance
- `idx_research_schedules_due`: `(status, next_run_at) WHERE status = 'ACTIVE'` guarantees sub-millisecond retrieval of due schedules.
- `idx_research_schedules_user_id`: Enforces fast tenant-filtered schedule listings.

---

## 3. Recurrence Patterns & Semantics

Supported recurrence patterns under schema version `2026-11-recurrence-v1`:

1. **Daily:**
   - Required: `time` (`HH:mm`, 24-hour).
   - Optional: `interval` (1..30 days, default: 1).
2. **Weekly:**
   - Required: `time` (`HH:mm`).
   - Required: `weekdays` (non-empty array of ISO weekdays, `1` = Monday through `7` = Sunday).
   - Optional: `interval` (1..52 weeks, default: 1).
3. **Monthly:**
   - Required: `time` (`HH:mm`).
   - Required: `dayOfMonth` (integer `1..31`).
   - Optional: `interval` (1..12 months, default: 1).
   - Optional: `monthBoundaryPolicy`:
     - `'CLAMP_TO_LAST_DAY'` (Default): If targeting day 31 in a 30-day month (e.g., April), executes on the 30th. In February, executes on the 28th (or 29th on leap years).
     - `'SKIP_MONTH'`: If the target day does not exist in the current calendar month, skips to the next month containing that day.

---

## 4. Daylight-Saving & Timezone Transition Policies

- **Spring-Forward Gap (Nonexistent Local Time):**
  When clocks skip forward (e.g., 02:00 jumps to 03:00 in `America/New_York`), a scheduled time of 02:30 does not exist.
  *Policy:* Deterministically shifts forward to the first valid wall-clock time after the gap (03:00 local time).
- **Fall-Back Overlap (Ambiguous Local Time):**
  When clocks fall back (e.g., 02:00 repeats 01:00 to 02:00), 01:30 occurs twice.
  *Policy:* Deterministically selects the earlier UTC instant (first occurrence), ensuring the schedule does not fire twice or drift.
- **Reference Time Injection:**
  The `RecurrenceService.calculateNextRun(rule, timezone, referenceDate)` accepts a reference timestamp, ensuring that calculation does not depend on system wall clocks during tests.

---

## 5. Server-Side Scheduler & Worker Integration

The `ResearchSchedulerService` evaluates due schedules using `scheduleRepo.listActiveDue(referenceDate, batchLimit)`:
1. Validates that the schedule has an intact `request_snapshot` and `recurrence_rule`.
2. Computes the next future execution instant `nextRunResult = RecurrenceService.calculateNextRun(...)`.
3. Within an atomic PostgreSQL transaction:
   - Inserts a child `research_runs` record (`schedule_id = schedule.id`).
   - Enqueues the job into `research_jobs` via `IResearchJobQueue.enqueue`.
   - Calls `scheduleRepo.claimAndAdvance(schedule.id, nextRunDate, run.id)`.
4. Embedded within `ResearchWorker`: The background worker daemon periodically checks for due schedules (e.g. every 10 polling cycles) during normal queue processing, enabling 100% autonomous operation.

---

## 6. Authenticated API Endpoints

- **`POST /api/schedules`:**
  - Authenticated (`requireAuthenticatedCaller`).
  - Validates `query`, `recurrence`, `timezone` (via `Intl.DateTimeFormat`).
  - Persists template task and schedule.
  - Returns 201 Created with initial calculated `nextRun`.
- **`GET /api/schedules`:**
  - Authenticated.
  - Returns all active/inactive schedules owned by the caller with formatted recurrence descriptions.
- **`GET /api/schedules/[id]`:**
  - Authenticated and strictly owner-isolated (returns 404 for cross-tenant access).

