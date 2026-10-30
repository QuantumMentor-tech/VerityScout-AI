# ADR-009: Progress Delivery, Cancellation Semantics & Run Recovery

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Full-Stack Lead  
**Related Requirements:** UR-006, UR-020, NFR-002, NFR-008  
**Traceability:** Maps to [AC-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-006-multi-source-page-extraction-and-normalization), [AC-020](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-020-session-persistence-and-recovery-after-interruption)

---

## 1. Context and Problem Statement

Research runs take between 15 and 90 seconds, progressing through multiple stages: `QUEUED` $\rightarrow$ `PLANNING` $\rightarrow$ `SEARCHING` $\rightarrow$ `EXTRACTING` $\rightarrow$ `VERIFYING` $\rightarrow$ `SYNTHESIZING` $\rightarrow$ `COMPLETED` (or `FAILED` / `CANCELLED`). The web user interface requires continuous feedback on current stage, URLs discovered, and extraction counts. If a user refreshes the page, closes their laptop, or navigates away, the research must continue running in the background, and the UI must seamlessly reconnect upon return. Furthermore, users must be able to cancel an active run without lingering zombie worker processes.

## 2. Considered Alternatives

1. **Alternative 1: Durable Server-Sent Events (SSE) with Fallback Polling against Persisted State** *(Chosen)*
2. **Alternative 2: Ephemeral WebSockets**
3. **Alternative 3: Client Polling Only (every 2 seconds)**

## 3. Decision Outcome & Chosen Approach

We adopt **Durable Polling & Server-Sent Events (SSE) grounded in PostgreSQL run state**:
1. **Authoritative State in PostgreSQL:** The worker process persists stage transitions and source counters directly into `research_runs` as each milestone completes. The database is the single source of truth.
2. **Dual Transport Strategy:**
   - **Primary Live Stream:** `GET /api/v1/research-runs/:id/events` streams lightweight SSE messages (`data: {"stage": "EXTRACTING", "sourcesFound": 8}`).
   - **Durable Reconnection & Recovery:** If the SSE socket drops or the user refreshes the page, the frontend calls `GET /api/v1/research-runs/:id` to retrieve the current persisted snapshot and smoothly resumes UI rendering (`UR-020`).
3. **Cancellation Semantics:**
   - User issues `POST /api/v1/research-runs/:id/cancel`.
   - The API marks the run status in PostgreSQL as `CANCELLATION_REQUESTED` and signals BullMQ.
   - The worker checks for cancellation checkpoints before each expensive operation (before each search query, before each page fetch, and before calling the LLM).
   - If detected, the worker halts immediately, logs `CANCELLED_BY_USER`, preserves already collected evidence, and frees resources.

## 4. Consequences and Trade-offs

- **Benefits:**
  - Complete resilience to network partitions and page refreshes.
  - SSE is simpler to secure, proxy, and inspect than bidirectional WebSockets, and operates over standard HTTP/2.
- **Trade-offs:**
  - SSE connections require server keep-alive pings (every 15s) to prevent intermediate reverse proxy timeouts.

## 5. Security & Privacy Implications

- The SSE endpoint validates user session authentication and resource ownership (`SEC-007`).
- Cancellation checkpoints prevent runaway spending after user aborts (`SEC-035`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 12 (Progress Visualizer UI), Step 23 (API Route), Step 43 (Worker Cancellation Checkpoints).
- **Validation Criteria:** Integration test validating that cancelling a run stops subsequent page extractions within 500ms (`AC-020`).
