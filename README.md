# VerityScout AI

> **Autonomous Multi-Source Web Research & Deterministic Verification Platform**  
> *An independent, clean-room AI research engine inspired by the Blue Whale / DeepWhale concept.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B%20LTS-brightgreen.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20Strict-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-yellow.svg)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.64-orange.svg)](https://playwright.dev/)

---

## 1. Executive Summary & Mission

**VerityScout AI** replaces probabilistic generative claims with verifiable, source-linked evidence and deterministic code-level constraint verification. 

When users ask complex multi-constraint questions (e.g., *"Find a new RTX 4070 GPU under $550 currently in stock with 2-day delivery"*), generative LLMs frequently hallucinate availability, confuse refurbished with new, or miscalculate pricing. VerityScout AI solves this through a clean-room, evidence-first pipeline:

```text
┌─────────────────┐     ┌──────────────────────┐     ┌───────────────────────┐     ┌─────────────────────┐
│  User Request   │ ──> │ Multi-Source Search  │ ──> │ Two-Tier Safe-Extract │ ──> │ Multi-Model Analyst │
│ Hard Constraints│     │   (Tavily / Exa)     │     │ (Direct + Cloud Tier) │     │ (OpenAI/NIM/Router) │
└─────────────────┘     └──────────────────────┘     └───────────────────────┘     └─────────────────────┘
                                                                                              │
                                                                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                       Deterministic Code-Level Verification Engine (Layer 4)                       │
│     Exact Constraint Checker • Currency Normalizer • Freshness Validator • Provenance Auditor      │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │   Structured Findings: Accurate vs Near-Match   │
                         │   100% Evidence-Linked with Source Provenance   │
                         └─────────────────────────────────────────────────┘
```

---

## 2. Architectural Pillars

- **Modular Monolith Foundation (`ADR-002`):** Next.js 15 App Router providing presentation, API ingress, and domain services in a single maintainable repository.
- **Decoupled Durable Worker (`ADR-003`):** Persistent Node.js worker consuming BullMQ jobs over Redis for long-running research tasks.
- **Strict TypeScript Governance (`ADR-001`, `ENG-POL-001`):** Compiler hardened with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `forceConsistentCasingInFileNames`.
- **Vanilla CSS & CSS Modules:** Component-scoped styling and CSS Custom Properties. Tailwind CSS is strictly excluded (`ADR-001`).
- **Comprehensive Testing Infrastructure:** Vitest 5 component testing, React Testing Library, and headless Chromium browser E2E testing via Playwright.
- **Defensive Secret Redaction & Safe Logging:** Structured single-line JSON logging with automatic pattern masking (Bearer tokens, API keys, connection strings) and fail-closed error boundaries.

---

## 3. Quick Start

### 3.1 Windows Quick Launcher (`run.bat`)

If you are on Windows, simply double-click or run [`run.bat`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/run.bat):

```cmd
run.bat
```

This interactive launcher checks Node.js prerequisites, automatically installs dependencies if missing, and provides a menu to:
- `[1]` Start Development Server (`http://localhost:3000`)
- `[2]` Run Full Verification (Typecheck + Lint + Unit Tests + Build)
- `[3]` Run Unit & Component Tests (Vitest)
- `[4]` Run Playwright End-to-End Tests (Chromium)
- `[5]` Build Production Bundle
- `[6]` Start Production Server

### 3.2 Manual CLI Setup

Ensure you have **Node.js LTS (v20+)** installed:

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
copy .env.example .env.local

# 3. Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 4. Canonical Command Reference

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run dev` | `next dev` | Starts local Next.js development server on port 3000 with Fast Refresh. |
| `npm run typecheck` | `tsc --noEmit` | Runs strict TypeScript compiler validation (8 strict flags active). |
| `npm run lint` | `eslint .` | Runs ESLint 9 Flat Config across all source modules and configurations. |
| `npm run lint:fix` | `eslint . --fix` | Automatically fixes safe formatting and code-quality issues. |
| `npm run test` | `vitest run` | Runs full Vitest unit, component, and integration test suite once. |
| `npm run test:watch` | `vitest` | Starts interactive Vitest runner with instant file-watching. |
| `npm run test:unit` | `vitest run tests/unit` | Explicitly executes only the unit test suite. |
| `npm run test:e2e` | `playwright test` | Runs Playwright headless Chromium browser end-to-end test suite. |
| `npm run test:e2e:ui` | `playwright test --ui` | Launches Playwright's visual interactive debugging dashboard. |
| `npm run build` | `next build` | Compiles optimized Next.js production bundle with static page generation. |
| `npm run start` | `next start` | Runs production Next.js server on port 3000. |
| `npm run services:up` | `docker compose up -d` | Starts local development PostgreSQL and Redis containers. |
| `npm run services:down` | `docker compose down` | Stops local development containers without removing data volumes. |
| `npm run services:status` | `docker compose ps` | Displays health status and port bindings for development services. |
| `npm run services:logs` | `docker compose logs -f` | Streams output logs from local PostgreSQL and Redis containers. |

---

## 5. Repository Directory Architecture

```text
VerityScout AI/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow (lint, typecheck, test, build, e2e)
├── data/
│   └── benchmark/             # Ground-truth 60-case benchmark dataset & schemas
│       ├── verityscout_benchmark.jsonl
│       ├── verityscout_benchmark.csv
│       └── benchmark.schema.json
├── docs/
│   ├── api/                   # RESTful API specifications & OpenAPI 3.1.0 yaml
│   ├── architecture/          # Architecture overview, ADRs (001–012), data contracts
│   │   ├── adr/               # 12 Architecture Decision Records
│   │   ├── LOCAL_DEVELOPMENT.md     # Comprehensive local setup and verification guide
│   │   └── REPOSITORY_STRUCTURE.md  # Detailed module ownership and import boundaries
│   ├── benchmark/             # Benchmark design, rubric, and dataset guide
│   ├── engineering/           # Engineering policies: TypeScript, Config, Logging
│   │   ├── DEPENDENCY_AND_TYPESCRIPT_POLICY.md
│   │   ├── ENVIRONMENT_CONFIGURATION.md
│   │   └── LOGGING_AND_ERROR_HANDLING.md
│   ├── requirements/          # MVP requirements, acceptance criteria, decision register
│   ├── research/              # Search & extraction provider evaluation
│   └── security/              # Threat model, security requirements, risk register
├── public/
│   └── logo.png               # Official VerityScout AI brand emblem
├── src/
│   ├── app/
│   │   ├── error.tsx          # Root client error boundary
│   │   ├── global-error.tsx   # Global layout error boundary
│   │   ├── globals.css        # Core design tokens and reduced-motion enforcement
│   │   ├── layout.tsx         # Next.js root layout with semantic HTML metadata
│   │   ├── not-found.tsx      # Accessible 404 page
│   │   ├── page.tsx           # Minimal startup experience page
│   │   └── page.module.css    # Scoped component styles
│   ├── components/
│   │   └── README.md          # Shared presentation components architectural boundary
│   ├── features/
│   │   └── README.md          # Cohesive product feature packages architectural boundary
│   ├── lib/
│   │   ├── config/            # Server-only environment validation (Zod schema)
│   │   │   └── server-env.ts
│   │   ├── errors/            # Typed AppError and safe error normalization
│   │   │   └── app-error.ts
│   │   └── logging/           # Structured JSON logger with defensive secret redaction
│   │       └── logger.ts
│   └── server/
│       └── README.md          # Server-only domain, verification, adapters, and worker boundary
├── tests/
│   ├── e2e/                   # Playwright browser end-to-end test suite
│   │   └── home.spec.ts
│   ├── fixtures/              # Synthetic test fixtures for deterministic verification
│   │   └── benchmark/sources/ # 10 ground-truth synthetic edge-case sources
│   ├── unit/                  # Vitest unit tests (config, logging, errors, components)
│   │   ├── config.test.ts
│   │   ├── errors.test.ts
│   │   ├── home.test.tsx
│   │   └── logger.test.ts
│   ├── setup.ts               # Testing Library DOM matchers and mock setup
│   └── README.md              # Testing architecture, commands, and verification guide
├── .env.example               # Safe application environment configuration template
├── .env.services.example      # Safe local services (PostgreSQL & Redis) template
├── .gitignore                 # Excludes secrets, node_modules, build & test artifacts
├── compose.yaml               # Pinned local development services (PostgreSQL 16 & Redis 7)
├── eslint.config.mjs          # ESLint 9 Flat Config (Next.js core-web-vitals, security rules)
├── next.config.ts             # Next.js configuration
├── package.json               # Package manifests and script definitions
├── playwright.config.ts       # Playwright E2E configuration (Chromium, webServer)
├── run.bat                    # Windows interactive launch & verification script
├── tsconfig.json              # Strict TypeScript configuration (@/* alias)
├── vitest.config.mts          # Vitest 5 configuration (React plugin, jsdom)
├── LICENSE                    # MIT License
└── README.md                  # Master project guide
```

---

## 6. Architecture Decisions Register (ADRs 001–012)

All fundamental architectural choices have been frozen and recorded in [`docs/architecture/adr/`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/):

- [`ADR-001`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-001-frontend-framework-and-styling.md): Next.js App Router, React, and Vanilla CSS Modules (Tailwind excluded).
- [`ADR-002`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-002-modular-monolith-architecture.md): Modular monolith with clean downward dependency boundaries.
- [`ADR-003`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-003-data-contract-validation-and-zod-integration.md): Zod-based data contract validation and schema enforcement.
- [`ADR-004`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-004-search-provider-abstraction-and-fallback.md): Pluggable search abstraction (`ISearchProvider`) supporting Tavily and Exa.
- [`ADR-005`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-005-two-tier-webpage-extraction-architecture.md): Two-tier safe extraction (Direct Fetch Tier 1 + Cloud Extraction Tier 2).
- [`ADR-006`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-006-multi-provider-llm-routing-and-budget-governance.md): Multi-provider model catalog and routing (OpenAI, OpenRouter, NVIDIA NIM).
- [`ADR-007`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-007-deterministic-verification-engine.md): Deterministic verification engine separating LLM claims from code-level checks.
- [`ADR-008`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-008-evidence-provenance-and-source-tiering.md): Evidence-first provenance tracking and retailer reliability tiering.
- [`ADR-009`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-009-database-platform-and-rls-security.md): PostgreSQL persistence with Supabase and Row-Level Security (RLS).
- [`ADR-010`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-010-background-worker-and-queue-architecture.md): BullMQ queue architecture over Redis for durable research execution.
- [`ADR-011`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-011-state-management-and-real-time-updates.md): Server-Sent Events (SSE) and React state for real-time progress.
- [`ADR-012`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-012-api-versioning-and-contract-stability.md): API contract versioning under `/api/v1/` with OpenAPI 3.1.0 specification.

---

## 7. Roadmap & Current Implementation Status

The project follows a structured 60-step roadmap across 12 phases:

- [x] **Phase 1: Requirements, Research & Architecture Freeze (Steps 1–5)**
  - `Step 1`: MVP Requirements Baseline (`MVP_REQUIREMENTS.md`, 38 frozen requirements).
  - `Step 2`: Benchmark Dataset & Rubric (60 ground-truth cases in `data/benchmark/`).
  - `Step 3`: Search & Extraction Provider Evaluation (Tavily, Exa, Firecrawl benchmarks).
  - `Step 4`: Security Threat Model & Risk Assessment (`THREAT_MODEL.md`, 10 threats, 38 SEC rules).
  - `Step 5`: Architecture Decisions & Data Contracts (12 ADRs, OpenAPI 3.1.0 yaml, Data Contracts).
- [x] **Phase 2: Project Setup and Toolchain (Steps 6–12)**
  - `Step 6`: Repository Setup & Next.js Foundation (Git init, App Router, brand emblem, startup page).
  - `Step 7`: Strict TypeScript Rules & Linting (8 strict compiler flags, ESLint 9 flat config, engineering policy).
  - `Step 8`: Automated Testing Foundation & CI (Vitest 5, React Testing Library, Playwright Chromium, GitHub Actions).
  - `Step 9`: Environment Validation, Logging & Secret Redaction (Zod + `server-only`, structured JSON logger, typed errors, error boundaries).
  - `Step 10`: Application Module Skeleton, Local Services & Architecture Documentation (Modular skeleton, `compose.yaml`, developer scripts, and architecture docs).
  - `Step 11`: Design Tokens, Typography, Spacing, and Accessible Dark Color Palette (Centralized tokens, WCAG 2.2 AA contrast matrix, `DESIGN_TOKENS.md`).
  - `Step 12`: Dynamic Cyan-to-Violet Transition and Reduced-Motion Preference Control (Brand gradient keyframes, `ReduceMotionControl` component, `MOTION_AND_ACCESSIBILITY.md`).
- [ ] **Phase 3: Core Application Shell & Design Foundations (Steps 13–20)**
  - `Step 13`: Responsive Application Shell, Navigation, Header, and Sidebar (`AppShell`, `AppHeader`, `AppSidebar`, `MobileNavDrawer`, `APP_SHELL_AND_NAVIGATION.md`).
  - `Step 14`: Reusable Design-System Components (Buttons, Cards, Dialogs, Tooltips, Form Controls, Badges, Alerts, States, `COMPONENTS.md`).
  - `Step 15`: Application Page and Route Shells with Fixture Data (`PAGE_SHELLS_AND_FIXTURES.md`, `ROUTE_MAP.md`, 5 route shells, deterministic fixtures).
  - `Step 16`: Research Query Composer & Input Experience *(Next)*.
- [ ] **Phase 4: Deterministic Constraint & Verification Engine (Steps 21–28)**
- [ ] **Phase 5: AI Provider Routing & Analysis Engine (Steps 29–35)**
- [ ] **Phase 6: Persistence, Queue & Background Worker Architecture (Steps 36–42)**
- [ ] **Phase 7: User Experience & Research Interface (Steps 43–48)**
- [ ] **Phase 8: Security Hardening & Secret Governance (Steps 49–51)**
- [ ] **Phase 9: Reliability, Performance & Production Readiness (Steps 52–54)**
- [ ] **Phase 10: Evaluation & Benchmark Validation (Steps 55–56)**
- [ ] **Phase 11: Deployment Architecture & Launch Operations (Steps 57–58)**
- [ ] **Phase 12: Final Release Governance & Handoff (Steps 59–60)**

---

## 8. License

This project is licensed under the terms of the [MIT License](LICENSE).  
Copyright (c) 2026 VerityScout AI Contributors.
