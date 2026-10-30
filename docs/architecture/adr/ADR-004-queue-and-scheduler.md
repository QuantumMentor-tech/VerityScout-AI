# ADR-004: Background Queue & Recurring Scheduling Architecture

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Backend Lead  
**Related Requirements:** UR-015, UR-016, UR-017, NFR-005, NFR-008  
**Traceability:** Implements [DEC-003](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [AC-015](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-015-persistent-scheduled-research-monitoring), [AC-036](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-036-resilient-background-worker-recovery)

---

## 1. Context and Problem Statement

VerityScout AI supports both interactive ad-hoc research queries and persistent scheduled monitoring runs (e.g., re-running research every 24 hours to detect price changes). Scheduled runs must survive server reboots, execute with bounded concurrency, retry transient provider errors gracefully, quarantine persistent failures, and prevent race conditions or duplicate runs when schedules are paused or deleted.

## 2. Considered Alternatives

1. **Alternative 1: BullMQ backed by Redis** *(Chosen)*
2. **Alternative 2: In-Memory Node.js `setInterval` / `cron`**
3. **Alternative 3: Cloud-Native SQS / Cloud Tasks**

## 3. Decision Outcome & Chosen Approach

We adopt **BullMQ backed by Redis** as the durable job queue and scheduling engine.

### Core Architectural Guarantees:
- **Deterministic Idempotency:** Every scheduled job is enqueued with a deterministic `jobId = SHA256(taskId + slotTimestamp)`. BullMQ automatically discards duplicate submissions (`SEC-027`).
- **Atomic Dequeue Validation:** When a worker dequeues a job, it executes a database pre-check (`SELECT status FROM tasks WHERE id = :taskId`). If the task is `PAUSED` or `DELETED`, the job is discarded immediately with zero outbound HTTP calls (`SEC-026`, `VS-THR-009`).
- **Bounded Exponential Backoff & DLQ:** Transient failures retry at most 3 times with exponential backoff (5s, 10s, 20s). Persistent failures move to `research-jobs-dlq` and record `FAILED` status (`SEC-028`, `VS-THR-005`).
- **Global & Per-User Concurrency Throttling:** BullMQ concurrency limiter restricts parallel research runs to 2 concurrent runs per user and 5 system-wide (`SEC-037`).
- **Persistence Guarantees:** Redis configured with Append-Only File (`appendonly yes`) to guarantee recovery after process crashes (`REC-003`).

## 4. Consequences and Trade-offs

- **Benefits:**
  - Complete crash recovery: in-flight jobs are recovered or re-assigned upon worker restart.
  - Built-in repeatable job support (`Queue.add(name, data, { repeat: { cron } })`) eliminates the need for external crond daemons.
  - BullMQ event telemetry provides real-time progress events for the web UI.
- **Trade-offs:**
  - Requires running and maintaining a Redis instance alongside PostgreSQL.

## 5. Security & Privacy Implications

- Redis is isolated within private container networks or bound strictly to `127.0.0.1` with `requirepass` authentication (`SEC-030`, `VS-THR-008`).
- Job payloads carry only resource UUIDs; zero API keys or user queries reside in Redis memory (`SEC-005`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 9 (Redis Config), Step 43 (Worker Queue Setup), Step 46–48 (Scheduler Implementation).
- **Validation Criteria:** Integration test suite validating duplicate job suppression, pause race conditions, and dead-letter queue routing (`AC-036`, `SEC-TEST-013`, `SEC-TEST-014`).
