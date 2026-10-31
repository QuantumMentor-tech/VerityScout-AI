# VerityScout AI — Application Route Map

**Document Identifier:** VS-ROUTE-MAP-v1.0  
**Phase:** Phase 3 — Core Application Shell & Design Foundations  
**Step:** Step 15 of 60  
**Status:** APPROVED ROUTE BASELINE  
**Governed by:** ADR-001 (Next.js App Router), ADR-002 (Modular Monolith)  

---

## 1. Architectural Route Hierarchy

The table below defines the authoritative mapping between web routes, intended functional areas, current data sources, and roadmap assignments.

| Path | Route Segment | Purpose | Data Source (Step 15) | Live Implementation Step | Status in Step 15 |
|---|---|---|---|---|---|
| `/` | Root | Overview & Workspace Dashboard | Synthetic Overview Fixture & Platform Status | Step 6 / 15 | **Implemented (Shell + Fixture)** |
| `/research` | `src/app/research/` | Research Workspace (Intake & Query Shell) | Synthetic Workspace Preview | Step 16 (Composer), Step 17 (Constraints) | **Implemented (Shell Only)** |
| `/research/runs/[runId]` | `src/app/research/runs/[runId]/` | Individual Research Run Detail View | Deterministic Run Fixture (`demo-run-001`) | Step 21 / 23 / 35 | **Implemented (Shell + Dynamic Fixture)** |
| `/history` | `src/app/history/` | Research Audit Trail & Historical Runs | Synthetic History Fixture (`demo-history-*`) | Step 35 (Audit Trail), Step 36 (PostgreSQL) | **Implemented (Shell + Fixture)** |
| `/schedules` | `src/app/schedules/` | Recurring Research & Monitor Jobs | Synthetic Schedules Fixture (`demo-schedule-*`) | Step 50 (Scheduled Monitoring Engine) | **Implemented (Shell + Fixture)** |
| `/settings/providers` | `src/app/settings/providers/` | AI & Search Provider Configuration | Synthetic Provider Fixture | Step 46 (BYOK Vault & Model Routing) | **Implemented (Deferred Preview Shell)** |

---

## 2. Invariants & Governance Rules

1. **Fixture Disclosure Mandate:** Every route displaying synthetic content must prominently render a visual sample data disclosure alert.
2. **Zero Fake Backend Services:** No mock HTTP servers, interceptors, or fake API endpoints are allowed. Fixtures are loaded directly from `src/fixtures/`.
3. **Dynamic Route Determinism:** `/research/runs/[runId]` strictly resolves known deterministic fixture IDs (e.g. `demo-run-001`). Arbitrary unknown identifiers trigger the framework's native `notFound()` boundary.
4. **Navigation Truthfulness:** Every enabled link in the primary navigation (`navigation-config.ts`) must point to an implemented route. Unimplemented routes must remain marked as unavailable (`Planned`).
