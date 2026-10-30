# VerityScout AI — Testing Architecture & Verification Guide

**Document ID:** `TEST-GUIDE-001`  
**Version:** `1.0.0`  
**Status:** `ACTIVE / FROZEN`  
**Step Alignment:** Step 8 of 60 (Phase 2: Project Setup and Toolchain)  
**Last Updated:** 2026-10-30  

---

## 1. Test Architecture and Supported Layers

VerityScout AI employs a three-tier automated testing strategy designed to balance rapid developer feedback, deterministic domain validation, and faithful browser-level verification.

```text
┌────────────────────────────────────────────────────────────────┐
│                   Level 3: End-to-End (E2E)                    │
│   Playwright • Headless Chromium • Full App Router & Build     │
│   Verifies real HTTP routes, layouts, branding, accessibility   │
├────────────────────────────────────────────────────────────────┤
│                   Level 2: Integration Tests                   │
│   Vitest • In-process real modules • Synthetic fixtures        │
│   Verifies cross-module contracts, validators, state machines   │
├────────────────────────────────────────────────────────────────┤
│                Level 1: Unit & Component Tests                 │
│   Vitest • React Testing Library • jsdom                       │
│   Verifies isolated functions, utilities, and UI components    │
└────────────────────────────────────────────────────────────────┘
```

| Layer | Runner & Framework | Environment | Target Files | Primary Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Unit & Component** | Vitest 5.x + React Testing Library | `jsdom` | `tests/unit/**/*.test.{ts,tsx}` | Isolated function logic, component rendering, accessibility roles, and semantic HTML structure. |
| **Integration** | Vitest 5.x | Node.js / `jsdom` | `tests/integration/**/*.integration.test.ts` | Interaction between domain services, provider adapters, persistence, and verification pipeline. |
| **End-to-End** | Playwright 1.x | Real Browser (Chromium) | `tests/e2e/**/*.spec.ts` | Real user interactions, routing, visual stability, asset loading, and server responsiveness. |

---

## 2. Unit-Test Location and Naming Conventions

- **Directory:** `tests/unit/`
- **Naming Pattern:** `*.test.ts` (pure TypeScript functions/utilities) or `*.test.tsx` (React components).
- **Setup File:** `tests/setup.ts` (loads `@testing-library/jest-dom/vitest` matchers).
- **Execution Mode:** Isolated, deterministic, non-networked. Tests must execute in milliseconds without external side-effects.

---

## 3. Component-Testing Conventions

Component tests use **React Testing Library** configured in `vitest.config.mts`:

1. **Accessible Role Queries First:**
   Always query elements by semantic role and accessible name:
   ```tsx
   // Recommended
   const heading = screen.getByRole('heading', { level: 1, name: /verityscout ai/i });
   const badge = screen.getByRole('status');
   ```
2. **Avoid Internal Class Selectors:**
   Never query by generated CSS Module class names (e.g. `._title_78b82c`). Test user-observable outcomes, not styling implementation details.
3. **No Redundant Test IDs:**
   Do not add `data-testid` attributes unless an element lacks accessible semantics and cannot be modified.
4. **Server Component Handling:**
   Synchronous Server Components are rendered directly via `render(<Component />)`. Asynchronous Server Components with external data fetching are validated via Playwright E2E tests.

---

## 4. Integration-Test Location and Conventions

- **Directory:** `tests/integration/`
- **Naming Pattern:** `*.integration.test.ts`
- **Scope:** Multi-module interactions across domain boundaries (e.g., query parser $\rightarrow$ candidate filter $\rightarrow$ verification engine).
- **Isolation:**
  - Tests run in-process using real domain modules.
  - External network calls (OpenAI, Tavily, Supabase) are substituted with verified synthetic test doubles conforming strictly to `IProviderAdapter` contracts (`ADR-004`).
  - No real API keys or paid services are ever invoked during test execution.

---

## 5. When Real Integrations vs. Mocks Are Justified

| Scenario | Strategy | Rationale |
| :--- | :--- | :--- |
| **Domain Logic & Verification** | **Real Modules** | Price comparison, spec checks, and constraint checking must run against real code without mocks. |
| **Ground-Truth Fixtures** | **Real Synthetic JSON** | Use synthetic fixtures from `tests/fixtures/benchmark/sources/` for reproducible testing. |
| **Search & LLM APIs** | **Contract Test Doubles** | Network calls are nondeterministic, cost money, and require secrets. Test doubles implement identical interfaces. |
| **Database & Redis** | **In-Memory / Test Schema** | Unit tests must not require active database servers. Dedicated integration environments use isolated schemas. |

---

## 6. End-to-End Test Location and Browser Requirements

- **Directory:** `tests/e2e/`
- **Naming Pattern:** `*.spec.ts`
- **Target Browser:** Chromium (Desktop Chrome profile).
- **Base URL:** `http://localhost:3000` (configurable via `PLAYWRIGHT_TEST_BASE_URL`).
- **Web Server Strategy:**
  - In local development, reuses existing server or launches `npm run start` (or `npm run dev`).
  - In CI, builds production bundle via `npm run build` and serves via `npm run start`.

---

## 7. Canonical Testing Commands

| Command | Action | Scope |
| :--- | :--- | :--- |
| `npm run test` | `vitest run` | Runs all unit and integration tests once in non-watch mode. |
| `npm run test:watch` | `vitest` | Starts Vitest in interactive watch mode for rapid local development. |
| `npm run test:unit` | `vitest run tests/unit` | Explicitly executes only the unit test suite. |
| `npm run test:e2e` | `playwright test` | Runs the Playwright headless browser test suite. |
| `npm run test:e2e:ui` | `playwright test --ui` | Launches Playwright's interactive visual UI runner. |

---

## 8. Installing Browser Dependencies

Playwright requires browser binaries to be downloaded:
```bash
# Install Chromium browser binary only (resource-efficient)
npx playwright install chromium

# In Linux/CI environments with missing OS libraries:
npx playwright install --with-deps chromium
```

---

## 9. Local Web Server Lifecycle

Playwright automatically manages the application server lifecycle via `playwright.config.ts`:
- **Command:** `npm run start`
- **Readiness URL:** `http://localhost:3000`
- **Timeout:** 120 seconds for production server initialization.
- **Teardown:** Automatically terminates the spawned server process upon test completion.

To run against an already active dev server:
```bash
# Terminal 1:
npm run dev

# Terminal 2:
npm run test:e2e
```

---

## 10. Full Local Verification Sequence

Before submitting changes or pushing code, run the standard 5-step verification pipeline:
```bash
# 1. Static Type Checking (Strict Compiler)
npm run typecheck

# 2. Linting & Formatting
npm run lint

# 3. Unit & Component Tests
npm run test

# 4. Production Application Build
npm run build

# 5. Browser End-to-End Tests
npm run test:e2e
```

---

## 11. Diagnosing Common Test Failures

1. **`TestingLibraryElementError: Unable to find an accessible element`:**
   Inspect the accessible tree dumped in the console output. Verify that the element's ARIA role and accessible name match the query.
2. **`playwright.config.ts exactOptionalPropertyTypes error`:**
   Do not pass `prop: undefined` explicitly. Use conditional object spread `...(condition ? { prop: value } : {})`.
3. **`Playwright browser not found`:**
   Run `npx playwright install chromium` to fetch the required browser binary.
4. **`Port 3000 EADDRINUSE`:**
   Another process is holding port 3000. Terminate the stale Node.js process before re-running tests.

---

## 12. Current Test Coverage (Step 8 Baseline)

The baseline test suite validates the verified Step 6 and Step 7 foundation:
- **Unit Suite (`tests/unit/home.test.tsx`):**
  - H1 page heading rendering ("VerityScout AI").
  - Platform description subtitle.
  - Status badge role and text ("Foundation Initialized & Verified").
  - Official brand logo with alt text ("VerityScout AI Emblem").
  - Implementation notice section and H2 heading.
  - Negative disclosure stating research engine is not yet operational.
- **E2E Suite (`tests/e2e/home.spec.ts`):**
  - `E2E-001`: HTTP 200 response and card visibility.
  - `E2E-002`: Document title, header identity, and logo visibility.
  - `E2E-003`: Accessible badge and explicit research disclaimers.

---

## 13. Deferred Test Areas (Future Implementation Steps)

The following areas are intentionally **not covered** because their application subsystems belong to later roadmap steps:
- **Search & Scraping Providers:** Deferred to Phase 3 (Steps 13–18).
- **Deterministic Verification Engine:** Deferred to Phase 4 (Steps 21–28).
- **AI Model Catalog & Routing:** Deferred to Phase 5 (Steps 29–35).
- **Database & Queue Integration:** Deferred to Phase 6 (Steps 36–42).
- **Multi-Source Research UI:** Deferred to Phase 7 (Steps 43–48).

---

## 14. Continuous Integration (GitHub Actions)

The repository workflow is defined in `.github/workflows/ci.yml`:
- **Triggers:** Pushes and pull requests on `main` and feature branches.
- **Concurrency:** Cancels stale in-progress runs on the same branch.
- **Permissions:** `contents: read` (strictly least-privilege).
- **Failure Artifacts:** Preserves `playwright-report/` artifacts for 7 days upon failure.
- **Zero Tolerance:** No failed step may be ignored via `continue-on-error`.
