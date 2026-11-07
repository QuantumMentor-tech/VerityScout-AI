# VerityScout AI — Playwright End-to-End Test Specifications
**Roadmap Phase:** Phase 11, Quality Assurance and Security  
**Step:** 53 of 60 — Playwright End-to-End Testing  
**Status:** Complete (79 tests passing across 13 test suites)  
**Execution Standard:** Browser-verified, deterministic, zero paid inference calls, accessibility-conscious, and regression-safe  

---

## 1. Executive Summary & Architecture

The VerityScout AI Playwright End-to-End (E2E) testing framework provides automated browser verification of the full user-facing research lifecycle. It validates real DOM rendering, user interactions, asynchronous state transitions, modal dialogs, drawer focus traps, keyboard accessibility, mobile responsive layouts, and multi-format data exports in real Chromium instances.

### Core Architectural Principles
1. **Zero External Network Dependencies & Zero Paid Model Inference:**
   All external AI provider endpoints, search engine scraping APIs, and background queue workers are intercepted at the browser network boundary using Playwright's `page.route()` engine. No live API tokens are transmitted, and zero costs are incurred.
2. **Deterministic Test Execution:**
   Synthetic fixtures and deterministic mock data (`MOCK_E2E_RESEARCH_RUN`, `MOCK_E2E_SCHEDULES`, `MOCK_E2E_NOTIFICATIONS`, `MOCK_E2E_PROVIDERS`) ensure tests execute reliably without flaky timing issues or race conditions.
3. **Accessibility First (WCAG 2.1 AA):**
   Tests enforce semantic ARIA roles, skip-navigation links, focus-trapping inside dialogs, keyboard-driven workflows (Tab, Enter, Escape, Ctrl+Enter), and non-zero color contrast.
4. **Mobile Responsiveness Verification:**
   All key application views (`/`, `/research`, `/history`, `/schedules`, `/settings/providers`) are validated at a compact 375×667 mobile viewport with programmatic assertions ensuring horizontal scroll width does not exceed viewport width (`scrollWidth <= innerWidth + 1`).
5. **Multi-Format Export Verification:**
   In-page evaluation validates JSON schema conformance (`schemaVersion: 1.0.0`), RFC 4180 CSV compliance with formula injection neutralization (`=`, `@`, `+`, `-` quote prefixing), and clean Markdown reporting.

---

## 2. Test Suite Matrix & Acceptance Criteria Traceability

The E2E test suite comprises **79 tests across 13 specification files**:

| Spec File | Test Count | Primary Coverage | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| `tests/e2e/home.spec.ts` | 3 | Startup experience, branding, system status badge, disclaimers | AC-01 |
| `tests/e2e/navigation.spec.ts` | 2 | Step 15 route shells, fixture deep-linking (`demo-run-001`) | AC-01, AC-02 |
| `tests/e2e/shell.spec.ts` | 8 | Responsive layout, desktop & mobile navigation, reduced motion, Escape key | AC-01, AC-12, AC-13 |
| `tests/e2e/auth.spec.ts` | 4 | Login, registration, password confirmation, validation alerts, unauth headers | AC-02 |
| `tests/e2e/query-composer.spec.ts` | 7 | Query composition, example prompts, local validation, Ctrl+Enter shortcuts | AC-03, AC-13 |
| `tests/e2e/research-workflow.spec.ts` | 4 | Asynchronous research submission, progress tracking, run cancellation, queue failure | AC-03, AC-04, AC-05, AC-14 |
| `tests/e2e/evidence-explorer.spec.ts` | 5 | Candidate cards, match tiers, attribute tables, Evidence Drawer, URL sanitization | AC-05, AC-06 |
| `tests/e2e/provider-management.spec.ts` | 5 | Provider vault cards, masked password input, connection test probe, toggle, remove key | AC-07 |
| `tests/e2e/provider-settings.spec.ts` | 13 | Deep provider settings verification, validation errors, modal workflows | AC-07 |
| `tests/e2e/history-and-exports.spec.ts` | 5 | History audit trail, query/status filtering, JSON/CSV/Markdown exports, export errors | AC-08, AC-11, AC-14 |
| `tests/e2e/schedules-and-changes.spec.ts` | 4 | Schedule creation, pause/resume, occurrence ledger history, change diffs | AC-09 |
| `tests/e2e/notifications.spec.ts` | 7 | Header bell badge count, notification center drawer, tabs, mark read, dismiss, links | AC-10, AC-13 |
| `tests/e2e/responsive-and-a11y.spec.ts` | 8 | 375px mobile viewport overflow checks, skip-link focus, keyboard form traversal, dialog focus trap | AC-12, AC-13 |
| `tests/e2e/error-recovery.spec.ts` | 4 | 401 unauthorized handling, 404 missing run handling, 500 form input preservation | AC-14 |

---

## 3. Detailed Specification by Acceptance Criterion

### AC-01: Application Startup & Route Shells
- **Goal:** Verify cold-boot and direct navigation to all top-level routes.
- **Specs:** `home.spec.ts`, `navigation.spec.ts`, `shell.spec.ts`.
- **Assertions:**
  - `h1` main title renders with "VerityScout AI".
  - Foundation status badge is visible with truthful operational state.
  - Direct navigation to `/`, `/research`, `/history`, `/schedules`, and `/settings/providers` succeeds without white screens or hydration errors.
  - Desktop nav links navigate to corresponding pathnames.

### AC-02: Authentication & Session Boundaries
- **Goal:** Verify access control boundaries, registration validation, and login forms.
- **Specs:** `auth.spec.ts`, `error-recovery.spec.ts`.
- **Assertions:**
  - `/login` renders email and password fields with required attributes.
  - Submitting empty inputs prompts HTML5/ARIA validation warnings.
  - `/register` enforces password match checks before dispatch.
  - Header displays "Sign In" button when unauthenticated.
  - Unauthenticated access to protected actions displays clear authorization prompts.

### AC-03: Research Query Composition & Submission
- **Goal:** Verify interactive query preparation and submission flow.
- **Specs:** `query-composer.spec.ts`, `research-workflow.spec.ts`.
- **Assertions:**
  - Query textarea accepts user prompts and provides live character counting.
  - Selecting an example prompt populates the textarea without auto-submitting.
  - Local validation confirms research criteria before dispatch.
  - `Ctrl+Enter` triggers validation and staging; plain `Enter` creates newlines.
  - Staged query displays a confirmation card with task type selector and "Launch Asynchronous Research Run" CTA.

### AC-04: Asynchronous Execution, Progress Tracking & Cancellation
- **Goal:** Verify real-time progress indicators and safe cancellation requests.
- **Specs:** `research-workflow.spec.ts`.
- **Assertions:**
  - Submitting a query enqueues the run (`201 Accepted`) and transitions to `/research/runs/[runId]`.
  - `<RunProgressTracker>` displays the current pipeline stage (INGESTION, SEARCH, EXTRACTION, VERIFICATION, SYNTHESIS) and progress percentage.
  - Clicking "Cancel Run" sends a `POST /api/research/runs/:id/cancel` request, updating the status badge to `CANCELLED` and displaying a cancellation notice.

### AC-05: Candidate Results & Match Tier Evaluation
- **Goal:** Verify deterministic candidate presentation, match tier badges, and constraint flags.
- **Specs:** `research-workflow.spec.ts`, `evidence-explorer.spec.ts`.
- **Assertions:**
  - Candidate cards render with clear product titles, prices, and retailer badges.
  - High-confidence candidates receive the `Strong Match` / `EXACT_MATCH` badge.
  - Partial matches receive the `Near Match` badge with constraint mismatch callouts.
  - Attribute tables display verified specifications with confidence indicators.

### AC-06: Source Explorer & Safe Evidence Verification
- **Goal:** Verify evidence inspection drawer and safe URL sanitization.
- **Specs:** `evidence-explorer.spec.ts`.
- **Assertions:**
  - Clicking an attribute evidence trigger or "Inspect Sources" opens `<EvidenceDrawer>`.
  - Drawer displays quoted snippet, source title, confidence score, and verification timestamp.
  - Links to external sources enforce `rel="noopener noreferrer"`.
  - Untrusted protocols (`javascript:`, `data:`, `vbscript:`) are neutralized to `about:blank`.

### AC-07: Provider Key Vault, Masking & Diagnostics
- **Goal:** Verify credential management without plaintext exposure.
- **Specs:** `provider-management.spec.ts`, `provider-settings.spec.ts`.
- **Assertions:**
  - Provider cards display truthful configuration status (`Configured` vs `Not Configured`).
  - Configure dialog enforces password input masking (`type="password"`).
  - Explicit advisory warns of AES-256-GCM hardware encryption.
  - Plaintext secret is never rendered in DOM attributes or text nodes.
  - Connection probe button triggers `POST /api/providers/:id/test` and displays live latency metrics.
  - Remove key action prompts for explicit confirmation before vault deletion.

### AC-08: Research History & Audit Trail Filtering
- **Goal:** Verify historical run tracking and search capabilities.
- **Specs:** `history-and-exports.spec.ts`.
- **Assertions:**
  - `/history` renders past research runs with execution metadata and timestamps.
  - Query search filter narrows the list in real-time.
  - Status filter dropdown filters by `COMPLETED`, `FAILED`, `CANCELLED`, or `ALL`.
  - Clicking a history item navigates to the detailed research run view.

### AC-09: Recurring Schedules, Occurrences & Change Detection
- **Goal:** Verify schedule lifecycle and diff inspection.
- **Specs:** `schedules-and-changes.spec.ts`.
- **Assertions:**
  - Clicking "Create Monitor" opens the `<ScheduleCreator>` modal.
  - Specifying monitor name, query, and cron recurrence persists the schedule.
  - Active schedules display "Pause" button; paused schedules display "Resume".
  - Occurrence ledger history expands to show execution timestamps and linked run IDs.
  - Detected changes accordion displays `PRICE_DROP` and `STOCK_STATUS_CHANGED` diff records with previous and current values.

### AC-10: In-App Alerts & Notification Center
- **Goal:** Verify header bell alerts and notification drawer actions.
- **Specs:** `notifications.spec.ts`.
- **Assertions:**
  - `<AppHeader>` bell button displays unread badge with exact count (`2`).
  - Clicking bell opens `<NotificationCenter>` drawer with slide-over animation.
  - Filter tabs switch between "All" and "Unread" notifications.
  - "Mark as Read" clears the unread dot indicator and decrements the badge.
  - "Dismiss" removes the alert item.
  - Clicking a notification navigates directly to the target research run.
  - Pressing `Escape` closes the notification center and restores focus.

### AC-11: Multi-Format File Exports
- **Goal:** Verify data integrity across JSON, CSV, and Markdown exports.
- **Specs:** `history-and-exports.spec.ts`.
- **Assertions:**
  - JSON export delivers `schemaVersion: 1.0.0` with verified candidate and source arrays.
  - CSV export conforms to RFC 4180 with commas, quotes, and formula injection protection (escaped leading `=`, `+`, `-`, `@`).
  - Markdown report provides structured headers, executive summary, and candidate sections.
  - Export generation failures return structured HTTP 500 errors with safe error messages.

### AC-12: Responsive Mobile Layouts (375px)
- **Goal:** Verify seamless rendering on small mobile screens without layout breakage.
- **Specs:** `responsive-and-a11y.spec.ts`, `shell.spec.ts`, `query-composer.spec.ts`.
- **Assertions:**
  - Browser viewport configured to `375×667` (iPhone SE dimensions).
  - Verified across `/`, `/research`, `/history`, `/schedules`, and `/settings/providers`.
  - Programmatic DOM check verifies `document.documentElement.scrollWidth <= window.innerWidth + 1`.
  - Mobile hamburger menu toggles mobile drawer cleanly.

### AC-13: Accessibility & Keyboard Navigation (WCAG 2.1 AA)
- **Goal:** Verify keyboard-only operability and ARIA compliance.
- **Specs:** `responsive-and-a11y.spec.ts`, `shell.spec.ts`.
- **Assertions:**
  - "Skip to main content" link is focusable on initial `Tab` and navigates focus to `<main id="main-content">`.
  - Form fields in Query Composer support full Tab traversal and Enter activation.
  - Modal dialogs enforce `role="dialog"` or `role="alertdialog"`, accessible title associations, and focus trapping.
  - `Escape` key dismisses modals and drawers, returning focus to the trigger element.

### AC-14: Fault Recovery & Graceful Error Handling
- **Goal:** Verify resilient error states without unhandled crashes.
- **Specs:** `error-recovery.spec.ts`, `research-workflow.spec.ts`.
- **Assertions:**
  - HTTP 401 Unauthorized returns helpful sign-in prompts rather than blank cards.
  - HTTP 404 Not Found displays "Research run not found" with a return-to-safety button.
  - HTTP 500 queue or scheduler errors retain user inputs in form fields to prevent data loss.
  - History API network failures display non-crashing alert banners.

---

## 4. Execution & Verification Guide

### Quick Execution
```bash
# Run all 79 Playwright E2E tests in headless Chromium
npm run test:e2e

# Run tests with the interactive Playwright UI mode
npm run test:e2e:ui

# Run a specific test suite
npx playwright test tests/e2e/research-workflow.spec.ts

# Inspect test report
npx playwright show-report
```

### CI/CD Regression Pipeline
To execute the full VerityScout AI test pyramid in CI:
```bash
# 1. TypeScript static analysis
npm run typecheck

# 2. ESLint code standard analysis
npm run lint

# 3. Unit test suite (864 tests across 81 files)
npm run test:unit

# 4. Integration test suite (19 tests across database, providers, queue, scheduler)
npm run test:integration

# 5. Provider contract test suite (47 contract tests across AI & search adapters)
npm run test:contracts

# 6. Playwright end-to-end browser suite (79 tests across 13 test files)
npm run test:e2e

# 7. Next.js production build verification
npm run build
```

