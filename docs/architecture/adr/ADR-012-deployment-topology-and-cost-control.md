# ADR-012: Deployment Topology, Operational Recovery & Cost Control

**Status:** PROPOSED (Infrastructure Architecture) / NEEDS_USER_APPROVAL (Production Hosting Selection & Budget)  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, DevOps Lead  
**Related Requirements:** UR-023, UR-024, NFR-005, NFR-008  
**Traceability:** Maps to [OPEN-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#4-open-decisions-pending-resolution-open), [SEC-035](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-035-hard-spending-caps-and-per-run-token-limits), [SEC-036](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-036-recurring-schedule-frequency-and-daily-run-caps)

---

## 1. Context and Problem Statement

VerityScout AI requires a resilient hosting topology capable of serving the Next.js web application, executing the persistent BullMQ worker daemon, managing Redis queues, and running PostgreSQL. Furthermore, because external search APIs and AI model calls incur marginal billing costs per query and token, the platform must enforce strict, immutable spending guardrails to prevent accidental runaway bills or denial-of-wallet attacks.

## 2. Considered Alternatives

1. **Alternative 1: Hybrid Cloud (Vercel Frontend/API + Railway/Render Worker/Redis + Supabase PostgreSQL)** *(Recommended Candidate)*
2. **Alternative 2: Unified Self-Hosted Single VPS (Docker Compose with Next.js, Worker, Redis, and PostgreSQL on AWS/DigitalOcean)**
3. **Alternative 3: Kubernetes (EKS/GKE) Cluster** *(Explicitly Excluded via `OUT-009`)*

## 3. Decision Outcome & Chosen Approach

We adopt a **container-ready, two-process deployment baseline**:
1. **Physical Process Topology:**
   - **Process 1 (`web`):** Next.js Server rendering UI pages and handling ingress API requests.
   - **Process 2 (`worker`):** Persistent Node.js worker consuming BullMQ jobs.
   - Backed by managed PostgreSQL (Supabase) and Redis.
   - Designed to run seamlessly either in managed cloud containers (Railway/Render) or within a standard Docker Compose stack on a single Linux VPS.
2. **Hard Cost & Rate Limits:**
   - **Per-Run Spending Cap:** Maximum 5 search queries, max 10 page extractions, max 16,000 prompt tokens, and hard cost ceiling of $0.25 per single research run (`SEC-035`, `UR-023`).
   - **Schedule Guardrails:** Minimum interval between scheduled runs enforced at 6 hours (frequencies below 6 hours are strictly rejected by the API). Maximum 20 automated runs per user per 24 hours (`SEC-036`).
   - **Real-Time Cost Tracking:** `usage_ledger` records estimated and actual token/search costs for every run, displaying transparent usage metrics in the user settings UI (`UR-024`).
3. **Disaster Recovery & Rollback:**
   - Database backups encrypted with AES-256 and stored in an isolated bucket (`RISK-015`).
   - Rollback procedures documented with forward-only/backward-compatible migrations (`RISK-014`, `RISK-026`).

## 4. Consequences and Trade-offs

- **Benefits:**
  - Complete protection against unexpected cloud billing surprises.
  - Deployment flexibility: portable across Docker, Railway, Render, or standard cloud virtual machines without vendor lock-in.
- **Trade-offs:**
  - Multi-process architecture requires deploying and monitoring two separate services.

## 5. Security & Privacy Implications

- Staging and production environments use strictly separated database instances, Redis namespaces, and API keys (`RISK-024`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 9 (Env Config), Step 45 (Cost Controls), Step 57–59 (Deployment & Recovery).
- **Validation Criteria:** Integration test asserting run execution aborts immediately when simulated token and search costs exceed $0.25 (`SEC-TEST-017`).
