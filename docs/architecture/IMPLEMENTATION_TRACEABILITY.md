# VerityScout AI — Architectural Implementation Traceability Matrix

**Document Identifier:** VS-TRACE-MATRIX-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 1 (Step 5 of 60)  
**Author:** Principal Software Architect, QA Lead  
**Traceability:** Mapped to [MVP_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/MVP_REQUIREMENTS.md), [ACCEPTANCE_CRITERIA.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md), [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md), and [DATA_CONTRACTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/DATA_CONTRACTS.md).

---

## 1. Purpose and Traceability Chain

This matrix provides the bidirectional engineering link between Step 1 requirements, Step 2 benchmark cases, Step 3 provider findings, Step 4 security requirements, and Step 5 architectural decisions. Future coding-agent prompts across Steps 6 through 60 must reference this matrix to locate the authoritative contract, ADR, and test evidence for every feature.

**Traceability Chain:**  
$$\text{Requirement} \longrightarrow \text{Acceptance Criteria} \longrightarrow \text{ADR} \longrightarrow \text{Domain Contract} \longrightarrow \text{API Route} \longrightarrow \text{Security Control} \longrightarrow \text{Target Step} \longrightarrow \text{Test Evidence}$$

---

## 2. Master Implementation Traceability Matrix

| Req ID | Acceptance Criteria | Governing ADR | Canonical Domain Contract | API Endpoint Operation | Threat & Security Req | Target Step | Future Test Evidence |
|---|---|---|---|---|---|---|---|
| **UR-001** | AC-001 | ADR-001, ADR-008 | `ResearchTask` | `POST /api/v1/research-tasks` | SEC-024 | Step 11, 23 | Vitest Zod parser test |
| **UR-002** | AC-002 | ADR-007, ADR-008 | `ResearchTask.constraints` | `POST /api/v1/research-tasks` | SEC-024 | Step 16, 23 | Vitest constraint extraction |
| **UR-003** | AC-003 | ADR-006, ADR-010 | `ProviderCredentialMetadata` | `GET /api/v1/settings/providers` | SEC-001, SEC-034 | Step 26, 28 | Vitest provider model discovery |
| **UR-004** | AC-004 | ADR-006 | `ResearchTask.modelPolicy` | `POST /api/v1/research-runs` | SEC-031 | Step 42 | Unit test fallback whitelist (`SEC-TEST-016`) |
| **UR-005** | AC-005 | ADR-005 | `ResearchRun.stageCounters` | Worker BullMQ Consumer | SEC-019, SEC-035 | Step 33, 43 | Integration test multi-query search |
| **UR-006** | AC-006 | ADR-005 | `SourceDocument` | `GET /api/v1/research-runs/{id}/sources` | SEC-011, SEC-012, SEC-013 | Step 32, 34 | SSRF security test suite (`SEC-TEST-005`–`007`) |
| **UR-007** | AC-007 | ADR-007 | `EvidenceRecord` | `GET /api/v1/research-runs/{id}/evidence` | SEC-032 | Step 35 | Unit test verbatim quote extractor |
| **UR-008** | AC-008 | ADR-007 | `CandidateResult.constraintEvaluation` | `GET /api/v1/research-runs/{id}/results` | SEC-017 | Step 37, 38 | Benchmark fixture test (`FIX-GPU-001`, `SEC-TEST-010`) |
| **UR-009** | AC-009 | ADR-007 | `CandidateResult.specifications` | `GET /api/v1/research-runs/{id}/results` | SEC-016, SEC-017 | Step 37 | Unit test negative constraint verifier |
| **UR-010** | AC-010 | ADR-007 | `CandidateResult.classification` | `GET /api/v1/research-runs/{id}/results` | SEC-018 | Step 39, 40 | Benchmark 60-case validation |
| **UR-011** | AC-011 | ADR-001 | N/A (CSS Design Tokens) | Web UI Shell (`/`) | SEC-021 | Step 11, 17 | Playwright reduced-motion & theme toggle |
| **UR-012** | AC-012 | ADR-001, ADR-007 | `CandidateResult` | Web UI Results View | SEC-021, SEC-022 | Step 13, 15 | Headless DOMPurify XSS audit (`SEC-TEST-011`) |
| **UR-013** | AC-013 | ADR-003, ADR-010 | `ResearchRun` | `GET /api/v1/research-runs` | SEC-007, SEC-008 | Step 21, 24 | Multi-tenant BOLA test suite (`SEC-TEST-004`) |
| **UR-014** | AC-014 | ADR-008 | Report DTO (JSON/CSV/MD) | `GET /api/v1/research-runs/{id}/export` | SEC-025 | Step 49 | CSV formula injection test (`SEC-TEST-018`) |
| **UR-015** | AC-015 | ADR-004 | `ResearchSchedule` | `POST /api/v1/schedules` | SEC-036 | Step 46 | Vitest cron interval validator (6h min) |
| **UR-016** | AC-016 | ADR-004 | `ChangeEvent` | `GET /api/v1/schedules/{id}/changes` | SEC-026, SEC-027 | Step 47, 48 | Integration test change event detection |
| **UR-017** | AC-017 | ADR-004 | `ChangeEvent.notificationStatus` | In-App Notification Center | SEC-021 | Step 50 | Playwright notification card inspector |
| **UR-018** | AC-018 | ADR-010 | `ProviderCredentialMetadata` | `POST /api/v1/settings/providers` | SEC-001, SEC-002 | Step 25 | Database raw SQL inspection (`SEC-TEST-002`) |
| **UR-019** | AC-019 | ADR-006, ADR-010 | `ResearchTask.modelPolicy` | Worker Model Dispatcher | SEC-004, SEC-031 | Step 26, 42 | Mock provider connection test probe |
| **UR-020** | AC-020 | ADR-002, ADR-009 | `ResearchRun.status` | `GET /api/v1/research-runs/{id}/events` | SEC-006, SEC-010 | Step 12, 43 | Client disconnect & reconnect test |
| **UR-021** | AC-021 | ADR-001 | N/A (CSS Layout) | Web UI Shell | N/A | Step 11 | Playwright mobile & tablet viewport tests |
| **UR-022** | AC-022 | ADR-001 | N/A (CSS High-Contrast) | Web UI Shell | N/A | Step 11, 56 | Automated axe-core contrast ratio audit |
| **UR-023** | AC-023 | ADR-012 | `ResearchRun.limits` | Worker Job Controller | SEC-035 | Step 45 | Run cost limit abort test (`SEC-TEST-017`) |
| **UR-024** | AC-024 | ADR-012 | `UsageLedger` | `GET /api/v1/settings/usage` | SEC-035 | Step 44, 45 | Vitest token & credit cost accumulator |
| **UR-025** | AC-025 | ADR-007 | `CandidateResult.evidenceIds` | `GET /api/v1/evidence/{id}` | SEC-032 | Step 35 | Unit test citation deep-link integrity |
| **UR-026** | AC-026 | ADR-001 | N/A (Accessible Forms) | Query Composer UI | N/A | Step 11, 56 | Screen-reader & keyboard navigation tests |
| **NFR-001** | AC-027 | ADR-007 | Benchmark Score Matrix | Benchmark Test Runner | SEC-017 | Step 54 | Canonical 60-case benchmark evaluation |
| **NFR-002** | AC-028 | ADR-002, ADR-004 | Telemetry Durations | API Middleware & Worker | SEC-014, SEC-037 | Step 52, 57 | Concurrency load test (5 parallel runs) |
| **NFR-003** | AC-029 | ADR-001 | Responsive Breakpoints | Web UI Component Tree | N/A | Step 11, 56 | Playwright cross-device visual regressions |
| **NFR-004** | AC-030 | ADR-001 | Accessible Contrast Tokens | CSS Design Tokens | N/A | Step 56 | Automated WCAG 2.2 AA validation |
| **NFR-005** | AC-031 | ADR-012 | `UsageLedger.estimatedCostUsd`| Worker Provider Dispatcher | SEC-035, SEC-038 | Step 45 | Cost cap enforcement test ($0.25 max) |
| **NFR-006** | AC-032 | ADR-001 | Accessibility Landmarks | Web UI Shell | N/A | Step 56 | Zero axe-core violation test report |
| **NFR-007** | AC-033 | ADR-008, ADR-010 | Global Security Policy | API & Worker Pipeline | SEC-001 to SEC-038 | Step 9, 25, 55 | TruffleHog bundle scan & SAST audit |
| **NFR-008** | AC-034 | ADR-004, ADR-012 | Queue Retry Counters | BullMQ Queue & Worker | SEC-028, SEC-029 | Step 43, 52 | DLQ 3-retry backoff integration test |
| **NFR-009** | AC-035 | ADR-005, ADR-008 | Safe-Fetch IP Filter | Outbound HTTP Client | SEC-011 to SEC-015 | Step 32, 55 | Private IP & metadata SSRF test suite |
| **NFR-010** | AC-036 | ADR-002, ADR-004 | Worker Heartbeat Records | Worker Process Daemon | SEC-026 | Step 43, 53 | Worker kill & restart recovery test |
| **NFR-011** | AC-037 | ADR-003 | PostgreSQL Migration Files | Database Migrations | N/A | Step 22, 57 | Forward & rollback migration execution |
| **NFR-012** | AC-038 | ADR-010 | Sanitized Logger Transports| Centralized Logger Engine | SEC-003 | Step 9, 51 | Unit test logger redaction (`SEC-TEST-003`) |

---

## 3. Phase 2 Implementation Progress & Architecture Mapping (Steps 6–10)

| Step | Scope & Deliverable | Governing ADRs | Module / Infrastructure Artifacts | Security Controls | Verification Status |
|---|---|---|---|---|---|
| **Step 6** | Next.js 15 App Router Foundation & UI Shell | ADR-001, ADR-002 | `src/app/`, `next.config.ts`, brand emblem | SEC-021 | Verified (clean build, SSR/CSR check) |
| **Step 7** | Strict TypeScript Governance & ESLint 9 | ADR-002, ADR-003 | `tsconfig.json` (strict flags), `eslint.config.mjs` | SEC-021 | Verified (0 lint/typecheck errors) |
| **Step 8** | Testing Foundation (Vitest, Playwright, CI) | ADR-002, ADR-007 | `vitest.config.mts`, `playwright.config.ts`, `.github/workflows/ci.yml` | SEC-003, SEC-021 | Verified (23 unit, 3 E2E passing) |
| **Step 9** | Server Config, Safe Errors & Structured Logger | ADR-002, ADR-003, ADR-010 | `src/lib/config/`, `src/lib/errors/`, `src/lib/logging/` | SEC-001, SEC-002, SEC-003 | Verified (Zod server-only, redactor, 100% tests) |
| **Step 10** | Module Skeleton, Local Services & Architecture Docs | ADR-002, ADR-009, ADR-010 | `src/components/`, `src/features/`, `src/server/`, `compose.yaml`, `LOCAL_DEVELOPMENT.md`, `REPOSITORY_STRUCTURE.md` | SEC-001, SEC-002, SEC-003 | Verified (isolated ports, loopback-only, non-destructive scripts) |

