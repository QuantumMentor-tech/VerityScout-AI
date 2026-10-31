# VerityScout AI — Page Shells & Fixture Data Architecture

**Document Identifier:** VS-DOC-PAGES-FIXTURES-v1.0  
**Phase:** Phase 3 — Core Application Shell & Design Foundations  
**Step:** Step 15 of 60  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Governed by:** ADR-001 (Next.js App Router), Step 11 Design Tokens, Step 12 Motion Controls, Step 13 Application Shell, Step 14 UI Primitives  

---

## 1. Executive Summary & Objective

Step 15 establishes the page-level structure of VerityScout AI across all primary workspace and system routes using typed, strictly deterministic fixture data. These routes connect the visual foundation (Step 11), motion preferences (Step 12), application shell (Step 13), and reusable UI primitives (Step 14) into a cohesive research application shell.

**Critical Architectural Principle:** All pages in Step 15 are **presentation shells only**, not operational implementations. Every fixture dataset is clearly segregated from production logic, carries explicit visual disclosures, and avoids any live external network calls, database connections, or AI provider invocations.

---

## 2. Implemented Routes & Responsibilities

| Route | App Directory Location | Page Title | Primary Responsibility | Data Source | Disclosure Notice |
|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | VerityScout AI — Overview | High-level workspace summary, platform health, recent activity preview, and preserved startup status card | `src/fixtures/overview-fixtures.ts` | Visible `Alert` (variant: info) |
| `/research` | `src/app/research/page.tsx` | Research Workspace | Scaffolding for research query intake with designated reserved slots for query composer & constraints | `src/fixtures/research-fixtures.ts` | Visible `Alert` (variant: info) |
| `/research/runs/[runId]` | `src/app/research/runs/[runId]/page.tsx` | Research Run Detail | Structural preview of single run evaluation: status, candidate matches, verified attributes, and confidence scores | Deterministic ID `demo-run-001` via `getDemoRunById()` | Visible `Alert` (variant: info) |
| `/history` | `src/app/history/page.tsx` | Research History | Structural preview of historical research runs with synthetic timestamps, statuses, and links to runs | `src/fixtures/history-fixtures.ts` | Visible `Alert` (variant: info) |
| `/schedules` | `src/app/schedules/page.tsx` | Scheduled Monitors | Structural preview of recurring autonomous price and stock monitor jobs with synthetic cron cadences | `src/fixtures/schedule-fixtures.ts` | Visible `Alert` (variant: info) |
| `/settings/providers` | `src/app/settings/providers/page.tsx` | Provider Settings | Structural preview of AI model and search provider configuration cards with explicit deferred status | `src/fixtures/provider-fixtures.ts` | Visible `Alert` (variant: warning) |

---

## 3. Shared Application Shell Integration

All newly created routes integrate seamlessly with the global application shell (`src/components/shell/AppShell.tsx`) established in Step 13:

- **Root Layout (`src/app/layout.tsx`):** Wraps all page content in `<AppShell>`, providing the `<AppHeader>`, `<AppSidebar>`, skip navigation links (`#main-content`), and the `<MobileNavDrawer>`.
- **Zero Shell Duplication:** Individual page components (`src/app/**/page.tsx`) do NOT render their own headers, sidebars, or drawer overlays. They strictly output their route-specific content within the designated main content viewport.
- **Active Navigation Calculation:** The `AppSidebar` and `MobileNavDrawer` dynamically match the current pathname (`usePathname()`) to highlight the active navigation item using `aria-current="page"`.
- **Navigation Configuration (`src/components/navigation/navigation-config.ts`):** All implemented routes have `isImplemented: true` and active `href` attributes, eliminating broken anchors or dead links. Remaining future destinations (such as `Evidence Explorer`) remain marked `isImplemented: false` with explicit milestone badges (`Step 23`).

---

## 4. Fixture Architecture & Segregation

To ensure clean-room isolation and prevent test data from contaminating future backend services, all fixture datasets reside in a dedicated directory:

```
src/fixtures/
├── types.ts                # Presentation interfaces and types
├── overview-fixtures.ts    # Sample overview metrics & activity
├── research-fixtures.ts    # Deterministic demo run (demo-run-001)
├── history-fixtures.ts     # Sample audit trail records
├── schedule-fixtures.ts    # Sample monitor schedule records
├── provider-fixtures.ts    # Sample provider preview items
├── fixtures.test.ts        # Automated integrity tests
└── index.ts                # Explicit public export barrel
```

### 4.1 Strict Fixture Policies

1. **No Live Connections:** Zero HTTP fetching, zero third-party API calls (OpenAI, OpenRouter, NVIDIA NIM, Search APIs), and zero database queries.
2. **Deterministic Identifiers:** All fixture IDs use explicit synthetic prefixes: `demo-run-001`, `demo-history-001`, `demo-schedule-001`, `prov-openai`.
3. **No Secrets or Credentials:** Fixtures contain no real API keys, bearer tokens, passwords, cookies, or personally identifiable information (PII).
4. **No Silent Fallbacks:** Production services in future steps must NOT silently fall back to fixture data on network failure.
5. **No Fake Backend Abstractions:** No fake in-memory repositories or mock service layers simulating database persistence were created.

---

## 5. User Trust & Fixture Disclosure Mandate

To maintain strict compliance and user trust, **every page rendering synthetic fixture data includes a visible disclosure notice** using the shared `Alert` component (`src/components/ui/alert/Alert.tsx`):

- **Disclosure Badge/Alert:** Placed prominently below the page title and description.
- **Standard Disclosure Language:**
  > *"Sample Data & Scaffolding Notice: This screen is an application shell rendered with synthetic fixture data. Research query parsing, constraint compilation, and live execution will be enabled in Steps 16–22."*
- **No Fabricated Status Claims:** Status badges on fixture runs and monitors are explicitly marked as illustrative examples rather than claiming live operational execution.

---

## 6. Dynamic Route Handling & 404 Boundaries

The research run detail page (`/research/runs/[runId]`) implements strict Next.js dynamic route resolution:

1. **Deterministic Resolution:** Only known fixture IDs (specifically `demo-run-001`) resolve to synthetic run data.
2. **Native 404 Trigger:** Any unknown, arbitrary, or invalid `runId` immediately triggers Next.js's native `notFound()` function:
   ```typescript
   const run = getDemoRunById(runId);
   if (!run) {
     notFound();
   }
   ```
3. **Server-Side Safety:** No stack traces, file paths, or internal execution states are exposed to the client.

---

## 7. Deferred Functionality Boundaries (Steps 16–60)

The following capabilities are **explicitly forbidden in Step 15** and remain deferred to their designated roadmap milestones:

- **Step 16 (Query Composer):** Natural language search input, query tokenization, multi-line research prompt intake.
- **Step 17 (Constraints Editor):** Budget ceiling, condition filters, attribute verification checkboxes.
- **Step 18–20 (Run Execution Shell):** Execution buttons, cancel/abort triggers, progress streaming.
- **Step 21–22 (Telemetry):** Live BullMQ event streaming, websocket connection, progress bars.
- **Step 23–25 (Evidence Verification):** Multi-tier source scrapers, headless browser verification, candidate scoring.
- **Step 35–37 (Persistence):** PostgreSQL audit persistence, run export to CSV/JSON, search history querying.
- **Step 46–48 (BYOK Provider Vault):** AES-256 encrypted credential storage, model parameter tuning, provider test pings.
- **Step 50–52 (Scheduled Monitoring):** Cron job scheduler, background polling workers, cross-run delta alerts.

---

## 8. Verification & Automated Test Suites

### 8.1 Unit & Component Tests (`vitest`)
Run all unit and component tests:
```bash
npm run test
```
- `src/fixtures/fixtures.test.ts`: Verifies fixture schema, determinism, and getter integrity.
- `tests/unit/pages.test.tsx`: Validates rendering, heading hierarchies, fixture notices, and `notFound()` behavior.
- `src/components/shell/AppShell.test.tsx`: Validates shell integration and active navigation highlighting.

### 8.2 End-to-End Tests (`playwright`)
Run all end-to-end browser tests:
```bash
npm run test:e2e
```
- `tests/e2e/navigation.spec.ts`: Validates direct navigation, sidebar navigation transitions, dynamic route resolution (`demo-run-001`), 404 boundary on unknown run IDs, and mobile 375px responsive layout integrity.
- `tests/e2e/shell.spec.ts`: Validates application shell landmarks, skip link, desktop sidebar, and mobile drawer.
- `tests/e2e/home.spec.ts`: Validates root page startup card preservation and motion preferences.
