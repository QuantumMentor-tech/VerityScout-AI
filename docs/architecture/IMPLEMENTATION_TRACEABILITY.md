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
| **UR-001** | AC-001 | ADR-001, ADR-008 | `ResearchTask` | `POST /api/v1/research-tasks` | SEC-024 | Step 16, 23 | Vitest QueryComposer & Playwright E2E |
| **UR-002** | AC-002 | ADR-007, ADR-008 | `ResearchTask.constraints` | `POST /api/v1/research-tasks` | SEC-024 | Step 16, 23 | Vitest constraint extraction |
| **UR-003** | AC-003 | ADR-006, ADR-010 | `ProviderCredentialMetadata` | `GET /api/v1/settings/providers` | SEC-001, SEC-034 | Step 26, 28 | Vitest provider model discovery |
| **UR-004** | AC-004 | ADR-006 | `ResearchTask.modelPolicy` | `POST /api/v1/research-runs` | SEC-031 | Step 42 | Unit test fallback whitelist (`SEC-TEST-016`) |
| **UR-005** | AC-005 | ADR-005 | `ResearchRun.stageCounters` | Worker BullMQ Consumer | SEC-019, SEC-035 | Step 33, 43 | Integration test multi-query search |
| **UR-006** | AC-006 | ADR-005 | `SourceDocument` | `GET /api/v1/research-runs/{id}/sources` | SEC-011, SEC-012, SEC-013 | Step 20, 32, 34 | SourceExplorer, URL validator (`SOURCE-UNIT-001`–`007`), SSRF suite |
| **UR-007** | AC-007 | ADR-007 | `EvidenceRecord` | `GET /api/v1/research-runs/{id}/evidence` | SEC-032 | Step 20, 35 | EvidenceDrawer, verbatim quote tests (`EVIDENCE-UNIT-001`–`007`) |
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
| **UR-025** | AC-025 | ADR-007 | `CandidateResult.evidenceIds` | `GET /api/v1/evidence/{id}` | SEC-032 | Step 20, 35 | Evidence drawer & citation deep-link traceability |
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
| **Step 11** | Design Tokens, Typography, Spacing & Dark Palette | ADR-001 | `src/app/globals.css`, `src/app/page.module.css`, `docs/design-system/DESIGN_TOKENS.md` | SEC-021 | Verified (WCAG 2.2 AA contrast matrix, 0 build/test regressions) |
| **Step 12** | Dynamic Gradient, Motion Policy & Preference Control | ADR-001 | `src/components/motion/`, `MOTION_AND_ACCESSIBILITY.md` | SEC-021 | Verified (OS precedence, in-app toggle, 10 E2E & 5 unit tests passing) |
| **Step 13** | Responsive Application Shell, Navigation, Header & Sidebar | ADR-001, ADR-002 | `src/components/shell/`, `src/components/navigation/`, `APP_SHELL_AND_NAVIGATION.md` | SEC-021 | Verified (8 E2E tests, 8 unit tests, desktop/mobile responsive, zero dead links) |
| **Step 14** | Reusable UI Primitives (Button, Card, Form, Dialog, Tooltip, States) | ADR-001, ADR-002 | `src/components/ui/`, `docs/design-system/COMPONENTS.md` | SEC-021 | Verified (39 new unit tests, 75 total tests passing, WCAG 2.2 AA compliant) |
| **Step 15** | Application Page and Route Shells with Fixture Data | ADR-001, ADR-008 | `src/app/`, `src/fixtures/`, `PAGE_SHELLS_AND_FIXTURES.md` | SEC-021 | Verified (5 route shells, deterministic fixtures, Playwright NAV suite) |
| **Step 16** | Research Query Composer & Input Experience | ADR-001, ADR-007 | `src/features/research/`, `QUERY_COMPOSER.md` | SEC-024 | Verified (16 unit tests, 7 E2E tests, 1,000 char boundary) |
| **Step 17** | Multi-Dimensional Research Constraints Editor | ADR-007 | Constraints UI foundation & normalization | SEC-016 | Verified (UI models aligned with DATA_CONTRACTS) |
| **Step 18** | Research Progress Indicator & Cancellation UI | ADR-009 | Run progress stages, cancel request dispatcher | SEC-010 | Verified (Deterministic stage transitions) |
| **Step 19** | Candidate Results Filtering, Comparison & Near-Match Cards | ADR-007 | Match tier categorization, specification cards | SEC-018 | Verified (Exact vs near match separation) |
| **Step 20** | Source Explorer, Evidence Drawer & Claim Traceability | ADR-007, ADR-008 | `src/features/evidence/`, `SOURCE_EXPLORER_AND_EVIDENCE_DRAWER.md` | SEC-032 | Verified (30 unit tests, 6 E2E tests, safe URL boundary) |
| **Step 21** | PostgreSQL Relational Schema, Relationships & Integrity | ADR-003, ADR-010 | `docs/database/schema.sql`, `DATABASE_SCHEMA.md`, `src/server/persistence/` | SEC-001, SEC-008, SEC-032, SEC-033 | Verified (11 tables, UUIDv4 PKs, cascade integrity, RLS, vault isolation, 9 unit tests) |
| **Step 22** | Database Migrations, Repository Layer & Transaction Management | ADR-003, ADR-010 | `src/server/persistence/`, `migrations/`, `repositories/`, `MIGRATIONS_AND_SCHEMA_EVOLUTION.md`, `REPOSITORY_AND_TRANSACTION_GUIDE.md` | SEC-001, SEC-007, SEC-023, SEC-032 | Verified (SQL-first migration runner with SHA-256 drift check, pg.Pool lifecycle, ACID transactions with savepoints, 9 domain repositories, 29 persistence unit tests, 170 unit tests & 36 E2E tests passing) |
| **Step 23** | Local-First User Authentication, Sessions & Identity Integration | ADR-010, OPEN-008 | `src/server/auth/`, `src/app/api/auth/`, `src/app/login/`, `src/app/register/`, `src/components/auth/`, `0002_local_auth.sql`, `AUTHENTICATION_AND_SESSIONS.md` | SEC-006, SEC-007, SEC-009 | Verified (100% self-hosted, local-first auth on user PC, scrypt password hashing, SHA-256 token hashing, HttpOnly Lax cookies, 5-attempt rate limiter lockout, 31 new tests, 197 unit tests & 40 Playwright E2E tests passing, clean build) |
| **Step 24** | Authorization, Resource Ownership, Tenant Isolation & Row-Level Security | ADR-003, ADR-010 | `src/server/auth/authorization.ts`, `0003_enforce_rls_isolation.sql`, `src/server/persistence/repositories/`, `AUTHORIZATION_AND_RESOURCE_OWNERSHIP.md`, `RESOURCE_ACCESS_MATRIX.md` | SEC-008, SEC-010, SEC-032 | Verified (Zero-trust server-side authz helpers, anti-ID substitution on junctions, fail-closed RLS on 11 tables, transaction-scoped connection pool context, 34 new tests across 9 repositories, 231 unit tests & 40 Playwright E2E tests passing) |
| **Step 25** | Secure Provider Credential Storage, Encryption Boundaries & Key Management | ADR-010 | `src/server/crypto/`, `src/server/services/provider-credential.service.ts`, `src/server/persistence/repositories/provider-vault.repository.ts`, `PROVIDER_CREDENTIAL_STORAGE.md`, `ENCRYPTION_AND_KEY_MANAGEMENT.md` | SEC-001, SEC-002, SEC-003 | Verified (Zero plaintext at rest, AES-256-GCM authenticated encryption with 12-byte random nonce, 16-byte auth tag, AAD context binding, segregated versioned keyring, restricted internal decryption, safe preview masking, 33 new unit tests, 264 unit tests & 40 Playwright E2E tests passing, clean build) |
| **Step 26** | AI Provider Settings CRUD, Secure Credential UI & Provider Connection Tests | ADR-010, ADR-011 | `src/app/settings/providers/`, `src/components/providers/`, `src/app/api/settings/providers/`, `src/server/providers/connection-tester.ts`, `PROVIDER_SETTINGS_AND_CONNECTION_TESTS.md`, `PROVIDER_SETTINGS_SECURITY.md` | SEC-001, SEC-008, SEC-011, SEC-012 | Verified (Full CRUD for OpenAI, OpenRouter, and NVIDIA NIM; AES-256-GCM BYOK vault storage; password masking; SSRF destination allowlisting; manual redirect token protection; lightweight non-inference connection testing; 26 new unit tests, 2 new Playwright E2E tests, 290 unit tests & 42 Playwright E2E tests passing, 0 typecheck/lint errors, clean production build) |
| **Step 27** | Common AI Provider Interfaces, Model Contracts, Capability Metadata & Provider Registry | ADR-010, ADR-011 | `src/server/providers/contracts/`, `src/server/providers/registry.ts`, `docs/providers/COMMON_PROVIDER_ARCHITECTURE.md`, `docs/providers/PROVIDER_CAPABILITY_CONTRACT.md`, `docs/providers/PROVIDER_ADAPTER_IMPLEMENTATION_GUIDE.md` | SEC-001, SEC-008, SEC-011, SEC-021 | Verified (Canonical provider IDs [openai, openrouter, nim]; trinary capabilities [SUPPORTED, UNSUPPORTED, UNKNOWN] with provenance; normalized inference request/response contracts; sanitized ProviderError taxonomy with retryability; AiProviderRegistry with adapter registration and Step 26 probe fallback; 32 new unit tests, 322 total unit tests & 42 Playwright E2E tests passing, 0 typecheck/lint errors, clean production build) |
| **Step 28** | OpenAI Provider Adapter, Request & Response Mapping, Error Normalization & Integration Tests | ADR-010, ADR-011 | `src/server/providers/adapters/openai/`, `docs/providers/OPENAI_ADAPTER.md`, `docs/providers/OPENAI_ERROR_MAPPING.md` | SEC-001, SEC-008, SEC-011, SEC-021 | Verified (OpenAiProviderAdapter implementing AiProviderAdapter; official Responses API mapping with max_output_tokens, temperature, and refusal handling; user-scoped AES-256-GCM credential retrieval via ProviderCredentialService; manual redirect security and 30s timeout; sanitized ProviderError taxonomy; 23 new unit tests, 345 total unit tests & 42 Playwright E2E tests passing, 0 typecheck/lint errors, clean production build) |
| **Step 29** | OpenRouter Provider Adapter, Model Identifier Mapping, Request/Response Normalization & Error Handling | ADR-010, ADR-011 | `src/server/providers/adapters/openrouter/`, `docs/providers/OPENROUTER_ADAPTER.md`, `docs/providers/OPENROUTER_ERROR_MAPPING.md` | SEC-001, SEC-008, SEC-011, SEC-021 | Verified (OpenRouterProviderAdapter implementing AiProviderAdapter; Chat Completions mapping preserving publisher-qualified model IDs [e.g. anthropic/claude-3.5-sonnet]; HTTP 402 INSUFFICIENT_CREDITS vs HTTP 429 RATE_LIMITED distinctions; upstream provider reporting; user-scoped AES-256-GCM credential retrieval; 25 new unit tests, 370 total unit tests & 42 Playwright E2E tests passing, 0 typecheck/lint errors, clean production build) |
| **Step 30** | NVIDIA NIM Provider Adapter, Request/Response Mapping, Error Normalization & Integration Tests | ADR-010, ADR-011 | `src/server/providers/adapters/nim/`, `docs/providers/NVIDIA_NIM_ADAPTER.md`, `docs/providers/NVIDIA_NIM_ERROR_MAPPING.md` | SEC-001, SEC-008, SEC-011, SEC-021 | Verified (NimProviderAdapter implementing AiProviderAdapter; OpenAI-compatible Chat Completions mapping preserving publisher-qualified model IDs [e.g. meta/llama-3.1-70b-instruct, nvidia/nemotron-4-340b-instruct]; Bearer nvapi-... authentication; user-scoped AES-256-GCM credential retrieval via ProviderCredentialService; manual redirect security and 30s timeout; FastAPI detail parsing and sanitized ProviderError taxonomy; 29 new unit tests, 399 total unit tests & 42 Playwright E2E tests passing, 0 typecheck/lint errors, clean production build) |
| **Step 31** | Research Query Parsing, Constraint-Aware Query Planning & Search Intent Normalization | ADR-007, ADR-008 | `src/server/research/planner/`, `docs/research/QUERY_PARSING_AND_PLANNING.md`, `docs/research/QUERY_PLAN_CONTRACT.md` | SEC-001, SEC-008, SEC-016 | Verified (Conservative query text normalizer preserving technical model IDs [RTX 5090, Ryzen 7 7800X3D]; deterministic constraint extractor fulfilling AC-002 [price ceiling, condition, specs, excluded attributes, excluded domains]; AC-003 interactive currency disambiguation [NEEDS_CLARIFICATION for missing currency]; contradiction detection [minPrice > maxPrice]; AC-004 multi-engine query formulation generating 2-5 diversified queries [Primary, Specs, Price, Retailer]; optional AI-assisted seam with provider adapter; 20 new unit tests, 419 total unit tests & 42 Playwright E2E tests passing, 0 typecheck/lint errors, clean production build) |







