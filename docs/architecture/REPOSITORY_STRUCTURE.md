# VerityScout AI — Repository Structure & Module Architecture

**Document ID:** `ARCH-STRUC-001`  
**Version:** `1.0.0`  
**Status:** `ACTIVE / FROZEN`  
**Step Alignment:** Step 10 of 60 (Phase 2: Project Setup and Toolchain)  
**Last Updated:** 2026-10-30  

---

## 1. Top-Level Source Layout

VerityScout AI organizes application source code inside the `src/` directory, adhering to the **Modular Monolith** architecture pattern (`ADR-002`):

```text
src/
├── app/               # Layer 1: App Router route composition, layouts, error boundaries
├── components/        # Layer 1: Reusable presentation-only UI components
├── features/          # Layer 1: High-cohesion product feature UI packages
├── lib/               # Cross-cutting utilities (config, logging, errors)
└── server/            # Layers 3–8: Server-only domain, verification, adapters, persistence
```

---

## 2. Directory Responsibilities & Invariants

### 2.1 `src/app/` (Route Composition & Entry Points)
- **Role:** Handles Next.js App Router route entry points, layouts, metadata, and error handling.
- **Rules:**
  - Route handlers (`route.ts`) act strictly as thin HTTP adaptors.
  - Page components (`page.tsx`) compose features and UI elements; they do **not** directly execute SQL queries or instantiate provider SDKs.
  - Standard error boundaries (`error.tsx`, `global-error.tsx`) and 404 handler (`not-found.tsx`) intercept failures safely.

### 2.2 `src/components/` (Shared Presentation Components)
- **Role:** Contains generic, reusable UI building blocks (buttons, badges, inputs, dialogs, cards).
- **Rules:**
  - Presentation-only; zero business logic.
  - Styled with Vanilla CSS Modules (`[Component].module.css`).
  - Strict WCAG 2.1 AA accessibility and keyboard navigation.
  - Never imports server-only modules (`src/server/*` or `src/lib/config/server-env.ts`).

### 2.3 `src/features/` (Cohesive Feature Packages)
- **Role:** Vertical feature packages encapsulating components, client hooks, and local state.
- **Future Packages:** `research/`, `evidence/`, `candidates/`, `history/`, `settings/`.
- **Rules:**
  - Strict encapsulation; cross-feature imports are prohibited except via explicit public exports.
  - Communicate with backend application services via API routes or typed server actions.

### 2.4 `src/lib/` (Cross-Cutting Foundation Utilities)
- **Role:** Platform utilities shared across the codebase.
- **Active Modules:**
  - `config/server-env.ts`: Zod-validated server environment with `import 'server-only'`.
  - `logging/logger.ts`: Structured JSON logger with defensive secret redaction.
  - `errors/app-error.ts`: Typed `AppError` and safe `normalizeError()` helper.
- **Rules:**
  - Must remain dependency-lean.
  - Server-only utilities inside `lib/` must enforce `import 'server-only'`.

### 2.5 `src/server/` (Privileged Server-Side Application Boundary)
- **Role:** The core domain, verification engine, provider adapters, persistence, and worker integration logic.
- **Subsystems (Planned Phases 3–8):**
  - `domain/`: Pure domain entities and state machines (Layer 3).
  - `verification/`: Deterministic constraint auditor and spec validator (Layer 4).
  - `providers/`: Adapter implementations for search (Tavily/Exa) and LLMs (OpenAI/NIM) (Layer 5).
  - `worker/`: BullMQ background job contracts and processor logic (Layer 6).
  - `persistence/`: PostgreSQL repositories, Supabase client, RLS policies (Layer 7).
  - `security/`: Cryptographic key manager, SSRF guard, rate limiter (Layer 8).
- **Rules:**
  - Strictly `server-only`. Never imported by Client Components or bundled to the browser.
  - Strict downward dependency flow (Domain $\rightarrow$ Verification / Providers $\rightarrow$ Persistence).

---

## 3. Persistent Background Worker Relationship

VerityScout AI separates interactive web serving from heavy autonomous research execution (`ADR-010`):

```text
┌─────────────────────────────────┐        ┌──────────────────────────────────┐
│   Next.js Web / API Server      │        │    Persistent Background Worker   │
│   (App Router, HTTP, SSE)       │        │    (Node.js BullMQ Worker)       │
└─────────────────────────────────┘        └──────────────────────────────────┘
                │                                            │
                │          ┌──────────────────────┐          │
                └────────> │  Redis Job Queue     │ <────────┘
                           │  (BullMQ)            │
                           └──────────────────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │ PostgreSQL Database  │
                           │ (Supabase + RLS)     │
                           └──────────────────────┘
```

1. The Next.js API ingress enqueues research tasks into Redis (`BullMQ`).
2. The persistent Node.js worker consumes jobs, executes search queries, extracts web data, runs verification constraints, and writes evidence to PostgreSQL.
3. The web application streams progress updates to users via Server-Sent Events (SSE).
4. Both run as independent processes but share domain contracts, type schemas, and provider adapters residing in `src/server/`.

---

## 4. Import & Path-Alias Conventions

- **Path Alias:** Single root alias `@/*` maps to `./src/*` in `tsconfig.json`.
- **Import Hierarchy:**
  ```text
  Route (src/app/) ──> Feature (src/features/) ──> Component (src/components/)
         │                      │
         ▼                      ▼
  Server Service (src/server/) ──> Cross-Cutting (src/lib/)
  ```
- **Forbidden Import Vectors:**
  - Client component $\rightarrow$ `src/server/*` (Blocked by Next.js compiler).
  - Feature A $\rightarrow$ Private internals of Feature B (Enforced by architecture policy).
  - Domain layer $\rightarrow$ HTTP / UI / Presentation (Enforced by pure domain rule).
  - Deep relative imports (`../../../../`) $\rightarrow$ Must use `@/*` alias.
