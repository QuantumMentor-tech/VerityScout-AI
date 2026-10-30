# ADR-002: Modular Monolith Architecture & Persistent Worker Process Separation

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Backend Lead  
**Related Requirements:** UR-005, UR-006, UR-015, NFR-002, NFR-008  
**Traceability:** Implements [DEC-003](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [AC-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-005-multi-source-web-search-orchestration), [AC-036](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-036-resilient-background-worker-recovery)

---

## 1. Context and Problem Statement

VerityScout AI executes complex research workflows: multi-query web search, extracting arbitrary HTML pages, structured JSON schema parsing from LLMs, and multi-step verification. These operations take between 15 and 90 seconds. Web-server HTTP request handlers (e.g., standard serverless functions or synchronous Express routes) are subject to connection dropouts, browser tab closures, client disconnects, and 30-second gateway timeouts. The application must decouple client request intake from long-running execution without introducing microservices complexity.

## 2. Considered Alternatives

1. **Alternative 1: Modular Monolith with Separate Background Worker Daemon** *(Chosen)*
2. **Alternative 2: Synchronous Request/Response in Next.js Server Actions / API Routes**
3. **Alternative 3: Microservices Mesh (API Service, Extraction Service, LLM Service, Queue Service)**

## 3. Decision Outcome & Chosen Approach

We adopt a **Modular Monolith architecture operating as two distinct process runtimes**:
1. **Interactive API & Web Process (`web`):** Next.js App Router server handling UI rendering, session management, and fast API endpoints (`/api/v1/*`). When a research run is requested, it records the task in PostgreSQL, dispatches a job to Redis BullMQ, and immediately returns HTTP 202 Accepted.
2. **Persistent Research Worker Daemon (`worker`):** A dedicated Node.js process consuming jobs from BullMQ. It executes the multi-step research pipeline, handles HTTP timeouts, extracts DOM text, invokes AI providers, applies deterministic checks, and writes results to PostgreSQL.

### Architectural Invariants:
- The `web` process never blocks on external search or LLM HTTP calls.
- The `worker` process does not serve user HTTP requests directly.
- The UI client tracks research progress via polling or server-sent events against persisted run records in PostgreSQL.

## 4. Consequences and Trade-offs

- **Benefits:**
  - Complete immunity to client browser disconnects: closing a tab does not terminate the research run (`UR-020`).
  - Worker memory spikes from large DOM extractions do not degrade web interface responsiveness.
  - Zero microservices overhead: single codebase, single test harness, and unified TypeScript types.
- **Trade-offs:**
  - Requires hosting infrastructure capable of running a persistent background Node.js process alongside the web server (e.g., Railway/Render or a standard VPS/Docker container).

## 5. Security & Privacy Implications

- The worker process runs in an isolated network context, applying strict outbound SSRF filters before socket connections (`SEC-012`, `TB-3`).
- Queue payloads contain only resource IDs (`runId`, `taskId`), completely preventing credential leakage through Redis (`SEC-005`, `VS-THR-001`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 9 (Environment), Step 23 (API Ingress), Step 43–45 (Worker Implementation).
- **Validation Criteria:** Integration test asserting worker process completes long-running job and persists findings even when client HTTP socket is aborted immediately after dispatch (`AC-036`).
