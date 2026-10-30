# VerityScout AI — Local Development & Environment Guide

**Document ID:** `ARCH-DEV-001`  
**Version:** `1.0.0`  
**Status:** `ACTIVE / FROZEN`  
**Step Alignment:** Step 10 of 60 (Phase 2: Project Setup and Toolchain)  
**Last Updated:** 2026-10-30  

---

## 1. Prerequisites & Runtime Policy

To develop and test VerityScout AI locally, the following toolchain is required:

| Requirement | Supported Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.x` or `v22.x` (LTS) / `v26.x` (Active) | `node --version` | Runtime must be a supported LTS or verified modern release. |
| **npm** | `v10.x` or `v11.x` | `npm --version` | Single authoritative package manager for this repository. |
| **Git** | `v2.40+` | `git --version` | Required for version control and submodule governance. |
| **Docker & Compose** | Optional for Phase 2 | `docker compose version` | Required starting in Phase 6 for local PostgreSQL & Redis. |

---

## 2. Fresh Checkout Setup Walkthrough

### Step 2.1: Clone and Enter Repository
```bash
git clone <repository-url> "VerityScout AI"
cd "VerityScout AI"
```

### Step 2.2: Install Dependencies
```bash
# Clean, deterministic installation enforcing package-lock.json
npm install
```

### Step 2.3: Configure Local Environment
```bash
# Copy the safe environment template
cp .env.example .env.local
```
*Note:* The default values in `.env.example` point to `http://localhost:3000` with `NODE_ENV=development` and `LOG_LEVEL=info`. No secrets are needed to run the local application foundation.

---

## 3. Launching the Application

### Option A: Windows Interactive Launcher (`run.bat`)
For Windows developers, launch the interactive console:
```cmd
run.bat
```
Select `[1]` to launch the Next.js development server.

### Option B: Command Line Interface
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to inspect the application.

---

## 4. Verification & Testing Workflow

Before committing changes, execute the 5-step local quality gate:

```bash
# 1. Strict TypeScript Compiler Check (0 errors required)
npm run typecheck

# 2. ESLint 9 Flat Config Check (0 errors, 0 warnings required)
npm run lint

# 3. Fast In-Memory Unit & Component Tests (Vitest 5)
npm run test

# 4. Optimized Production Build Verification
npm run build

# 5. Headless Browser End-to-End Tests (Playwright Chromium)
npm run test:e2e
```

---

## 5. End-to-End Testing & Browser Installation

Playwright browser binaries are downloaded once to local cache:
```bash
# Download the pinned Chromium browser engine
npx playwright install chromium

# In Linux CI environments with missing system libraries:
npx playwright install --with-deps chromium
```

To run Playwright tests in interactive UI mode with visual step-through:
```bash
npm run test:e2e:ui
```

---

## 6. Optional Local Services (PostgreSQL & Redis)

Under [`ADR-009`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-009-database-platform-and-rls-security.md) (PostgreSQL) and [`ADR-010`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-010-background-worker-and-queue-architecture.md) (Redis/BullMQ), local services are configured via [`compose.yaml`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/compose.yaml).

> **Important:** Docker is **optional** during Phase 2 foundation work. Web pages, unit tests, and builds run 100% locally without running containers. Services will be utilized starting in Phase 6.

### 6.1 Managing Local Containers
```bash
# Start background services
npm run services:up

# Check container health status
npm run services:status

# Stream service logs
npm run services:logs

# Stop services (preserves data volumes)
npm run services:down
```

### 6.2 Data Persistence
Local service data is stored in isolated Docker named volumes:
- `verityscout_dev_postgres_data` (PostgreSQL `/var/lib/postgresql/data`)
- `verityscout_dev_redis_data` (Redis `/data`)

`npm run services:down` does **not** destroy volumes. To wipe development databases completely:
```bash
docker compose down -v
```

---

## 7. Common Troubleshooting

| Issue | Root Cause | Remediation |
| :--- | :--- | :--- |
| **Port 3000 EADDRINUSE** | An orphaned Node.js process is holding port 3000. | Terminate the stale Node process: `taskkill /F /IM node.exe` (Windows) or `lsof -i :3000` (Unix). |
| **Playwright Browser Missing** | Chromium binary has not been downloaded yet. | Run `npx playwright install chromium`. |
| **ConfigValidationError** | An environment variable failed schema constraints. | Inspect terminal output for invalid field names; verify values in `.env.local`. |
| **Docker Not Recognized** | Docker Desktop is not installed or not running. | Containers are optional for Phase 2. Continue with `npm run dev`. |

---

## 8. Subsystems Implemented vs. Deferred

| Subsystem | Current Status | Notes |
| :--- | :--- | :--- |
| **Next.js App Router** | **IMPLEMENTED** | Root page, layout, error boundaries, 404 active. |
| **Strict Typecheck & Lint** | **IMPLEMENTED** | TypeScript 5.7 strict flags, ESLint 9 flat config active. |
| **Vitest & Playwright** | **IMPLEMENTED** | 23 unit tests and 3 browser E2E tests passing. |
| **Environment & Logging** | **IMPLEMENTED** | Zod validation, structured JSON logger, defensive redaction active. |
| **Search Providers** | `DEFERRED TO PHASE 3` | Tavily / Exa search adapters to be implemented in Steps 13–18. |
| **Verification Engine** | `DEFERRED TO PHASE 4` | Deterministic constraint auditor to be implemented in Steps 21–28. |
| **AI LLM Routing** | `DEFERRED TO PHASE 5` | OpenAI, OpenRouter, NVIDIA NIM to be implemented in Steps 29–35. |
| **Database & Queue** | `DEFERRED TO PHASE 6` | Supabase, PostgreSQL schemas, and BullMQ worker in Steps 36–42. |
