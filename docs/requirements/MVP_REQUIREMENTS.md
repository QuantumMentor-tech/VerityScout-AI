# VerityScout AI — MVP Requirements Specification
**Document Version:** 1.0.0-FROZEN  
**Phase:** Phase 1 (Requirements, Research, and Feasibility) — Step 1 of 60  
**Status:** Requirements Baseline Frozen for Implementation  
**Approved Application Name:** VerityScout AI  
**Former Research Working Titles:** DeepWhale AI (Research Spec v1.0), Blue Whale QPIS Inspiration  

---

## 1. Document Overview & Project Identity

### 1.1 Project Purpose
**VerityScout AI** is a professional-grade, web-based, multi-source AI research and verification application. It accepts natural-language research questions and product-search queries, converts them into explicit, structured constraints, executes bounded web-scale discovery across real search and extraction engines, verifies candidate findings against user constraints with deterministic precision, and presents evidence-backed, provenance-linked results.

The system is designed to eliminate AI hallucination in critical research, procurement, and market intelligence tasks by enforcing a strict separation between verifiable facts and unverified claims, preserving field-level source citations, and preventing inaccurate or fabricated data from entering matched results.

### 1.2 Authoritative Source Hierarchy
Where interpretations differ, technical and product direction must adhere strictly to the following precedence order:
1. **Explicit User Requirements & Direct Project Decisions** established for VerityScout AI.
2. **Supplied DeepWhale AI QPIS v1.0 Research Specification**.
3. **Original Blue Whale QPIS Specification**, where providing historical context and workflow rationale.
4. **Hindi YouTube Video Transcript & Workflow Analysis** describing the demonstrated research workflow and core user interactions.
5. **Approved 60-Step Architecture and Implementation Roadmap** for VerityScout AI.
6. **Engineering Recommendations and Research Findings**, clearly designated as recommendations (`REC`) pending approval, never as mandatory user requirements.

### 1.3 Intellectual Property & Clean-Room Boundaries
VerityScout AI is an independent, clean-room implementation inspired by the demonstrated research workflow of the creator's Blue Whale application. VerityScout AI does **not** copy, incorporate, or redistribute proprietary source code, internal assets, personal branding, or private credentials from the original creator. All code, schemas, prompts, and visual assets are developed independently.

The approved visual emblem is the project's official compass-and-eye magnifying glass motif (`VerityScout AI Logo.png`), featuring an iridescent cyan-to-violet accent palette.

---

## 2. Requirements Classification & Governance System

Every requirement, constraint, recommendation, and exclusion in this specification is governed by a formal classification and stable identifier:

| Classification Prefix | Definition | Governance Rule |
| :--- | :--- | :--- |
| **UR-xxx** | **User Requirement** | Explicit functional capability required by user/stakeholder. Must be fulfilled or formally amended. |
| **NFR-xxx** | **Non-Functional Requirement** | Quality attribute (security, performance, reliability, accessibility, maintainability). |
| **REC-xxx** | **Engineering Recommendation** | Architecture or tooling suggestion requiring formal review before adoption. |
| **OPEN-xxx** | **Open Decision** | Critical decision pending benchmarking, policy review, or user sign-off. Cannot be assumed. |
| **ASSUMPTION-xxx** | **Provisional Assumption** | Working assumption accepted for MVP planning; subject to validation. |
| **FUT-xxx** | **Future Requirement** | Confirmed feature deferred beyond MVP scope (Phase 2+). |
| **OUT-xxx** | **Explicit Exclusion** | Explicitly out-of-scope capability; strictly prohibited in MVP. |

### 2.1 Priority Definitions
- **P0 (Critical / Blocker):** Must be fully implemented, verified, and passing acceptance criteria for a minimally usable, trustworthy MVP. Missing P0 constitutes release failure.
- **P1 (High / Essential Core):** Core requirement for initial release. Built upon P0 foundations; non-blocking for early architectural milestones but required for Step 60 release.
- **P2 (Medium / Polish):** Valuable functional enhancement or operational improvement. Does not block core verification workflows.
- **P3 (Low / Optional):** Nice-to-have capability or future enhancement candidate.

### 2.2 Traceability Model
Every requirement traces through a strict chain of custody:
$$\text{Source Document} \longrightarrow \text{Requirement ID} \longrightarrow \text{Acceptance Criteria (AC-xxx)} \longrightarrow \text{Roadmap Step (1–60)} \longrightarrow \text{Automated Test / Verification}$$

---

## 3. Approved Technical Architecture Baseline

The planned technical stack for VerityScout AI consists of the following components (to be implemented according to the 60-step roadmap; no runtime scaffolding or dependencies are installed during Step 1):

- **Web Frontend:** Next.js (App Router), React, HTML5, Vanilla CSS3 / CSS Modules (TailwindCSS avoided unless explicitly requested), TypeScript. Responsive layouts supporting mobile, tablet, and desktop viewports.
- **Backend Application API:** Node.js (LTS v20+) with TypeScript, utilizing lightweight Next.js route handlers for synchronous user requests and session management.
- **Background Worker & Task Processing:** Dedicated Node.js TypeScript worker process orchestrating multi-step research pipelines, rate-limited outbound fetchers, and recurring tasks.
- **Job Queue & Scheduling:** BullMQ backed by Redis for durable, distributed job execution, concurrency control, failure isolation, and cron-based recurrence.
- **Database & Persistence:** PostgreSQL (with Supabase as the planned managed database, storage, and authentication platform).
- **AI Model Providers:** Multi-provider architecture integrating:
  1. OpenAI (Direct API)
  2. OpenRouter (Unified routing and open-weights access)
  3. NVIDIA NIM (Enterprise-grade accelerated inference)
- **Web Search & Extraction Candidates:** Tavily and Firecrawl, evaluated systematically in Step 2 benchmark before final provider selection.
- **Testing & Quality Assurance:** Vitest for unit/integration testing, Playwright for end-to-end browser and visual regression testing, axe-core for WCAG accessibility verification.

---

## 4. User Workflows & Operational Scenarios

### Workflow 1: Ad-Hoc Product & Market Discovery
1. **Intake:** User inputs a natural-language query (e.g., *"Find me an RTX 4080 Super GPU under $950 in new condition with at least 3 display ports, excluding refurbished or third-party open-box sellers"*).
2. **Constraint Extraction:** LLM parser converts input into a deterministic JSON query specification containing hard constraints (price ceiling $\le 950$, condition = New, required ports $\ge 3$) and negative filters (exclude open-box/refurbished).
3. **Execution Planning:** Router selects query terms, search endpoints, and bounded source target ($N \le 100$ candidate URLs).
4. **Search & Fetch:** Outbound worker executes parallel searches via approved search API, deduplicates URLs, filters out domain blacklists, and fetches page contents via extraction proxy.
5. **Extraction & Verification:** Extractor extracts product attributes, price, currency, availability, and seller details, retaining raw text snippets and timestamps. Deterministic validator tests constraints.
6. **Result Categorization:** Results are sorted into *Strong Matches*, *Near-Matches*, *Partially Verified*, *Uncertain*, *Conflicting*, and *Excluded*.
7. **Presentation & Citation:** User views live stream of findings, clicks any claim to inspect the source excerpt, URL, and fetch time, and exports data to CSV/JSON/Markdown.

### Workflow 2: Persistent Scheduled Research & Delta Monitoring
1. **Schedule Configuration:** User configures an existing research query to run on an automated recurring schedule (e.g., every 6 hours or custom 15-minute interval where quota allows).
2. **Durable Storage:** Task specification, schedule expression, and baseline results are persisted in PostgreSQL. BullMQ scheduler registers the recurring job.
3. **Worker Execution:** At scheduled trigger, the background worker executes research independently of whether the user has a browser tab open.
4. **Diff & Change Detection:** Worker retrieves previous run's snapshot, detects price fluctuations, stock availability transitions, or newly discovered candidates.
5. **In-App Notification:** Summary of changes is appended to research history; user is alerted via in-app notification indicators upon next visit.

---

## 5. Functional Requirements Catalog

### 5.1 Natural-Language Query Intake & Constraint Extraction

#### UR-001: Natural-Language Query Submission
- **Title:** Free-form Research Query Intake
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 16
- **Description:** The system must provide a primary search interface where users can submit natural-language queries without requiring manual SQL-like syntax.
- **Value:** Enables intuitive, conversational inquiry for general research and product sourcing.
- **Dependencies:** None.
- **Expected Behavior:** Accepts single-line or multi-line natural language text up to 1,000 characters.
- **Acceptance Criteria:** `AC-001`
- **Verification:** Unit test parser & E2E query submission.

#### UR-002: Structured Constraint & Attribute Extraction
- **Title:** Structured Query Specification Parsing
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 17
- **Description:** For product and constraint-heavy queries, the application must extract structured attributes into a typed schema: target product/entity, maximum price ceiling, minimum price floor, target currency, target geographic market/region, item condition (New, Used, Refurbished), mandatory specifications, excluded attributes/keywords, and preferred/disallowed seller domains.
- **Value:** Prevents ambiguous or loose matching by converting narrative queries into enforceable deterministic rules.
- **Dependencies:** `UR-001`.
- **Expected Behavior:** Returns a validated JSON schema containing all detected constraints and flags missing/optional attributes.
- **Acceptance Criteria:** `AC-002`
- **Verification:** Unit test against prompt test suites with diverse edge-case inputs.

#### UR-003: Ambiguity Handling & Region/Currency Clarification
- **Title:** Interactive Constraint Disambiguation
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 18
- **Description:** The application must never silently invent missing critical constraints (such as currency or geographic purchasing region). If currency or location is omitted and materially impacts pricing or availability, the UI must either prompt the user for clarification or mark the parameter as unresolved while applying explicit default fallback rules documented in the interface.
- **Value:** Eliminates false matches caused by currency symbol confusion (e.g., USD vs CAD vs AUD vs GBP) or cross-border shipping impossibilities.
- **Dependencies:** `UR-002`.
- **Expected Behavior:** Highlights ambiguous parameters with a visual indicator and prompt for user confirmation before executing live search.
- **Acceptance Criteria:** `AC-003`
- **Verification:** E2E user flow test on ambiguous inputs.

---

### 5.2 Real Multi-Source Web Research & Content Extraction

#### UR-004: Multi-Source Search Integration & Query Expansion
- **Title:** Multi-Engine Search Query Expansion
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 31
- **Description:** The system must formulate multiple diversified search queries from the user's structured constraints and query candidate search APIs (e.g., Tavily, Firecrawl, or approved fallbacks).
- **Value:** Overcomes keyword bias and uncovers sources across different retailers, review platforms, and documentation sites.
- **Dependencies:** `UR-002`.
- **Expected Behavior:** Produces 2 to 5 targeted search query variants targeting specific domains, aggregators, and exact model names.
- **Acceptance Criteria:** `AC-004`
- **Verification:** Integration test with mocked and live search adapter.

#### UR-005: Bounded Discovery & URL Deduplication
- **Title:** Bounded Source Target and Canonical Deduplication
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 32
- **Description:** The system must discover, normalize, and deduplicate candidate source URLs. The aspiration to inspect up to 100 candidate URLs per run must function as a configurable, strictly enforced upper bound (defaulting to a safe, quota-controlled baseline), not an unconstrained crawl or guaranteed page count.
- **Value:** Controls API execution costs, protects worker memory, and eliminates redundant scraping of duplicate URLs.
- **Dependencies:** `UR-004`.
- **Expected Behavior:** Normalizes URLs (stripping tracking parameters like `utm_*`, `ref`, session IDs), deduplicates canonical URLs, and truncates candidates to the active run's configured limit.
- **Acceptance Criteria:** `AC-005`
- **Verification:** Unit test URL canonicalization engine with 50+ tracking-parameter variations.

#### UR-006: Accessible Content Extraction & Provable Parsing
- **Title:** Structured Source Extraction & Metadata Retrieval
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 33
- **Description:** The system must extract clean text, page title, published/updated timestamps, currency symbols, numerical pricing, and structured product specifications from accessible candidate web pages via approved extraction services.
- **Value:** Provides verifiable factual grounding directly from target pages rather than relying on search engine snippet summaries alone.
- **Dependencies:** `UR-005`.
- **Expected Behavior:** Successfully extracts DOM/Markdown content, title, and published metadata, storing extraction status (`SUCCESS`, `ACCESS_DENIED`, `NOT_FOUND`, `TIMEOUT`, `PARSING_ERROR`).
- **Acceptance Criteria:** `AC-006`
- **Verification:** Integration test against synthetic and cached real-world HTML fixtures.

#### UR-007: Resilient Retrieval & Partial Result Handling
- **Title:** Fault-Tolerant Partial Research Execution
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 34
- **Description:** When individual source pages fail due to timeouts, HTTP 403/404/429/500 errors, or network interruptions, the research run must not crash or abort entirely. It must record the failure reason for the specific source, continue processing surviving sources, and render partial results with complete diagnostic visibility.
- **Value:** Guarantees user receives valuable findings even in the presence of unreliable third-party web hosts.
- **Dependencies:** `UR-006`.
- **Expected Behavior:** Unresponsive or blocked URLs transition to failed states while the overall run finishes with `PARTIAL_SUCCESS`.
- **Acceptance Criteria:** `AC-007`
- **Verification:** Chaos integration test injecting 50% simulated HTTP failure rate.

#### UR-008: Real-Time Research Execution Progress & State Reporting
- **Title:** Progressive Research Telemetry & Phase Updates
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 19
- **Description:** The system must emit genuine, live progress events indicating exact operational phases: `INTAKE`, `QUERY_PLANNING`, `SEARCHING`, `URL_DEDUPLICATION`, `FETCHING`, `EXTRACTING`, `VERIFYING`, and `COMPLETED`. The UI must display accurate metrics for Discovered, Attempted, Fetched, Extracted, Failed, Duplicate, and Verified sources.
- **Value:** Delivers full transparency into execution state; eliminates fake spinning loaders and builds user confidence.
- **Dependencies:** `UR-001`, `UR-006`.
- **Expected Behavior:** Event stream or WebSocket/polling updates UI counter values and active phase label within 500ms of backend transition.
- **Acceptance Criteria:** `AC-008`
- **Verification:** End-to-end telemetry verification test.

---

### 5.3 Evidence, Provenance & Verification

#### UR-009: Provenance Recording & Granular Field-Level Citation
- **Title:** Granular Citation & Source Snippet Provenance
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 36
- **Description:** Every substantive product attribute, price claim, and availability state must preserve a verifiable reference to: source URL, page title, exact extraction timestamp, supporting text snippet/excerpt, and extraction method.
- **Value:** Allows users to verify claims independently with a single click, eliminating black-box trust.
- **Dependencies:** `UR-006`.
- **Expected Behavior:** Every rendered attribute in the result card or table features an interactive citation popover or sidebar link pointing to the exact excerpt.
- **Acceptance Criteria:** `AC-009`
- **Verification:** Automated schema assertion validating that zero un-cited claims exist in the output model.

#### UR-010: Freshness, Timestamping & Unreachable Source Semantics
- **Title:** Temporal Grounding and Non-Destructive Fetch Semantics
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 37
- **Description:** Retrieval timestamps must be recorded for every fetch attempt. A search snippet alone must not qualify a volatile price or stock claim as fully verified. Crucially, an unreachable or timed-out source must **never** be interpreted as proof that an item is out of stock or unavailable; it must be classified as `UNREACHABLE_SOURCE`.
- **Value:** Prevents false-negative conclusions regarding product inventory caused by technical network errors.
- **Dependencies:** `UR-007`, `UR-009`.
- **Expected Behavior:** Marks unreachable URLs as `INSPECTION_FAILED` without altering inventory hypotheses.
- **Acceptance Criteria:** `AC-010`
- **Verification:** Unit test verification engine with simulated network drops.

#### UR-011: Strict Deterministic Constraint Matching & Ceiling Enforcement
- **Title:** Deterministic Constraint Evaluation Engine
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 38
- **Description:** Constraint verification must be performed using deterministic programmatic logic rather than probabilistic LLM guesswork. Specifically:
  1. A price strictly greater than the user's maximum budget cannot be classified as an exact match under any circumstances.
  2. An item with condition conflicting with user requirement (e.g., Used vs New required) cannot be an exact match.
  3. A missing or unknown required specification cannot be marked as verified.
  4. An LLM's internal confidence score must never be used as independent factual proof.
- **Value:** Enforces 100% mathematical certainty on numeric and categorical user constraints.
- **Dependencies:** `UR-002`, `UR-009`.
- **Expected Behavior:** Rejects items exceeding price ceiling by even $0.01 from Strong Match status.
- **Acceptance Criteria:** `AC-011`
- **Verification:** Comprehensive unit test suite with 100 boundary test cases.

#### UR-012: Multi-Tier Result Classification
- **Title:** Categorized Match Results Hierarchy
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 39
- **Description:** Research findings must be partitioned into mutually exclusive, clearly labeled presentation buckets:
  1. **Strong Matches:** Satisfies all mandatory constraints with verifiable supporting evidence.
  2. **Near-Matches:** Meets core intent but explicitly deviates on one or more non-critical parameters (e.g., budget exceeded by 5%, or color variation). Deviations must be explicitly highlighted.
  3. **Partially Verified:** Some constraints verified; others unconfirmed due to missing page details.
  4. **Uncertain / Insufficient Support:** Evidence ambiguous or contradictory.
  5. **Conflicting Results:** Different reliable sources assert incompatible facts (e.g., conflicting prices).
  6. **Stale Results:** Evidence is older than user-specified freshness threshold.
  7. **Excluded:** Failed hard negative filters (e.g., blacklisted seller or excluded keyword), with recorded reason.
- **Value:** Gives users an immediate, nuanced picture of market reality without obscuring imperfect options.
- **Dependencies:** `UR-011`.
- **Expected Behavior:** UI renders distinct tabs or visual sections for each classification tier.
- **Acceptance Criteria:** `AC-012`
- **Verification:** Unit and UI snapshot tests for all 7 classification states.

#### UR-013: Contradiction & Conflict Preservation
- **Title:** Transparent Discrepancy Reporting
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 40
- **Description:** When two or more sources provide conflicting information for the same product entity (e.g., Store A lists $799, Store B lists $999, or conflicting warranty terms), the system must preserve and display both claims side-by-side rather than silently averaging or guessing the "correct" value.
- **Value:** Protects users from making purchasing or business decisions on hidden discrepancies.
- **Dependencies:** `UR-012`.
- **Expected Behavior:** Creates a `CONFLICT_DETECTED` badge with an expandable conflict resolution comparison view.
- **Acceptance Criteria:** `AC-013`
- **Verification:** Integration test verifying conflict detection logic across conflicting fixtures.

---

### 5.4 AI Provider Management & Routing

#### UR-014: Secure Multi-Provider Credential Management
- **Title:** Provider API Key Storage & Isolation
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 26
- **Description:** The system must support configuration of user credentials for OpenAI, OpenRouter, and NVIDIA NIM. Credentials must be stored securely on the server (or in an encrypted session vault), never committed to Git, and never exposed in client-side bundles, URLs, server access logs, or analytics.
- **Value:** Allows users to bring their own API keys and switch between preferred AI backends securely.
- **Dependencies:** None.
- **Expected Behavior:** Settings view accepts API keys, stores them securely, and displays only a masked preview (e.g., `sk-...4a89`).
- **Acceptance Criteria:** `AC-014`
- **Verification:** Security audit and automated secret-leak test in network payloads.

#### UR-015: Credential Validation & Connection Testing
- **Title:** Zero-Cost Provider Health & Auth Check
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 27
- **Description:** The settings interface must allow the user to test the connectivity of any configured provider. The validation must perform a minimal, lightweight authenticated request (e.g., retrieving model list or a 1-token test prompt) and return unambiguous success or error statuses (e.g., `INVALID_KEY`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`).
- **Value:** Prevents silent failures during research execution by validating credentials up front.
- **Dependencies:** `UR-014`.
- **Expected Behavior:** Displays instant green checkmark or descriptive red error banner without disclosing secret values.
- **Acceptance Criteria:** `AC-015`
- **Verification:** Integration test against valid and mock invalid provider endpoints.

#### UR-016: Provider Error & Rate-Limit Handling
- **Title:** Exponential Backoff and Graceful Rate-Limit Degradation
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 28
- **Description:** Outbound LLM requests must implement exponential backoff with jitter for HTTP 429 (Rate Limit) and HTTP 503 (Service Unavailable) responses. If retry limits are exhausted, the system must surface a clean, user-friendly explanation rather than an uncaught exception stack trace.
- **Value:** Protects research runs from transient cloud provider hiccups.
- **Dependencies:** `UR-014`.
- **Expected Behavior:** Retries up to 3 times before transitioning the step to `PROVIDER_RATE_LIMITED`.
- **Acceptance Criteria:** `AC-016`
- **Verification:** Unit test with simulated HTTP 429 response sequence.

#### UR-017: Manual Model Selection & Capability Catalog
- **Title:** Explicit Model Selector & Capability Filtering
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 29
- **Description:** Users must be able to view a categorized catalog of available models across their configured providers and explicitly select a preferred model for Query Planning, Extraction, and Summarization tasks.
- **Value:** Empowers advanced users to optimize for speed, intelligence, context length, or cost.
- **Dependencies:** `UR-014`.
- **Expected Behavior:** Dropdown displays available models, their context window sizes, and capability tags (e.g., `Fast`, `Reasoning`, `Vision`).
- **Acceptance Criteria:** `AC-017`
- **Verification:** UI component test verifying dynamic model listing based on configured keys.

#### UR-018: Auto-Pick Best Model Routing & Rationale Transparency
- **Title:** Context-Aware Automated Model Routing
- **Classification:** UR | **Priority:** P1 | **Roadmap Step:** Step 41
- **Description:** When the user enables "Auto-Pick Best Model", the routing engine must analyze task complexity (token length, structured extraction difficulty, reasoning depth), filter out unconfigured or unavailable providers, apply latency/cost heuristics, and dispatch the subtask to the most suitable model. The UI must explicitly display which model was chosen and the rationale for the selection.
- **Value:** Automates model selection for non-technical users while maintaining full operational transparency.
- **Dependencies:** `UR-017`.
- **Expected Behavior:** Displays badge: *"Routed to Claude 3.5 Sonnet: Selected for high-accuracy structured schema extraction"*.
- **Acceptance Criteria:** `AC-018`
- **Verification:** Unit test routing matrix with varying task difficulty profiles.

#### UR-019: Safe Model Fallback with Constraint & Privacy Invariance
- **Title:** Privacy-Preserving Fallback Pipeline
- **Classification:** UR | **Priority:** P1 | **Roadmap Step:** Step 42
- **Description:** If a designated primary model fails or experiences service outage, the router may fall back to an authorized alternative provider **only if** the user's configured privacy and provider restrictions are not violated. It must never silently dispatch queries to a disallowed vendor.
- **Value:** Ensures system resilience without breaching user compliance boundaries.
- **Dependencies:** `UR-018`.
- **Expected Behavior:** If OpenRouter is restricted by user policy, fallback dispatches only to permitted OpenAI or NVIDIA NIM endpoints.
- **Acceptance Criteria:** `AC-019`
- **Verification:** Security and routing integration test asserting zero unauthorized provider calls.

---

### 5.5 Research History, Lifecycle & Persistence

#### UR-020: Research Run Persistence, Lifecycle & Cancellation
- **Title:** Durable Research Run Lifecycle & User Cancellation
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 21
- **Description:** Every research run must be assigned a unique UUIDv4 and have its full lifecycle state (`PENDING`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`) persisted in PostgreSQL. Users must be able to cancel an active run at any time, immediately terminating pending background fetches and preserving partial findings up to the cancellation moment.
- **Value:** Prevents data loss on accidental browser closure and prevents wasted API spend when a user spots an error early.
- **Dependencies:** None.
- **Expected Behavior:** Clicking "Cancel Research" halts BullMQ worker tasks within 1.5 seconds and commits partial results with status `CANCELLED_BY_USER`.
- **Acceptance Criteria:** `AC-020`
- **Verification:** Integration test asserting worker process abort on cancellation signal.

#### UR-021: Research History Browsing & Detail Inspection
- **Title:** Historical Run Catalog and Snapshot Replay
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 22
- **Description:** The system must provide a searchable, filterable history view showing all past research runs, input queries, execution timestamps, duration, source counts, and match totals. Selecting any past run must load its complete result snapshot, source citations, and configuration.
- **Value:** Enables retrospective review, longitudinal comparison, and auditability.
- **Dependencies:** `UR-020`.
- **Expected Behavior:** Loads historical research detail page in under 500ms from local database.
- **Acceptance Criteria:** `AC-021`
- **Verification:** E2E history navigation and snapshot verification test.

---

### 5.6 Persistent Scheduled Research & Delta Monitoring

#### UR-022: Persistent Scheduled Research Execution
- **Title:** Durable Background Recurrence via Worker Queue
- **Classification:** UR | **Priority:** P1 | **Roadmap Step:** Step 46
- **Description:** Users must be able to configure any research task to execute automatically on recurring schedules (hourly, daily, weekly, or custom cron intervals, including 15-minute intervals when API quotas permit). Scheduled jobs must be managed by a persistent BullMQ/Redis worker process that runs independently of open browser tabs, recovers gracefully across server restarts, and enforces idempotent execution.
- **Value:** Transforms VerityScout AI into an autonomous market intelligence and deal-monitoring radar.
- **Dependencies:** `UR-020`.
- **Expected Behavior:** Scheduled job triggers at designated timestamp, executes research headlessly, and commits results to PostgreSQL even with all client browsers offline.
- **Acceptance Criteria:** `AC-022`
- **Verification:** Integration test simulating backend restart and verifying scheduled job resumption.

#### UR-023: Schedule Lifecycle & In-App Change Detection
- **Title:** Schedule Management & Price/Stock Delta Detection
- **Classification:** UR | **Priority:** P1 | **Roadmap Step:** Step 47
- **Description:** Users must be able to create, pause, resume, edit, run-now, and delete recurring schedules. Upon completion of a scheduled run, the system must perform an automated diff against the previous successful run, identifying:
  1. Price decreases or increases (with exact delta value and percentage).
  2. Stock status changes (e.g., In Stock $\rightarrow$ Backordered).
  3. Newly discovered matching items.
  4. Vanished or delisted items.
  Deltas must be highlighted in the UI research view and summarized in an in-app change log.
- **Value:** Immediately alerts users to market shifts without requiring manual side-by-side inspection.
- **Dependencies:** `UR-022`.
- **Expected Behavior:** Highlights changed items with a green price drop tag (e.g., `-$45.00 (-5.2%)`) or inventory alert badge.
- **Acceptance Criteria:** `AC-023`
- **Verification:** Unit test delta comparison engine against before-and-after snapshot pairs.

---

### 5.7 User Interface, Design System & Accessibility

#### UR-024: Responsive UI, Cyan/Violet Theming & Motion Preferences
- **Title:** Accessible Design System with Controllable Cyan/Violet Accents
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 11
- **Description:** The user interface must be fully responsive across mobile (375px+), tablet, and desktop viewports. It must implement the approved VerityScout AI brand identity using the official logo (`VerityScout AI Logo.png`) and a sleek dark-mode glassmorphic theme. A configurable cyan-to-violet accent gradient must be featured on primary interactive highlights. A user setting must allow disabling dynamic accent transitions, and the CSS must strictly honor `prefers-reduced-motion: reduce`.
- **Value:** Delivers an ultra-premium, modern visual aesthetic while guaranteeing usability and comfort for motion-sensitive users.
- **Dependencies:** None.
- **Expected Behavior:** When "Disable Dynamic Accents" is toggled on or OS reduced-motion is detected, transitions and glowing pulses immediately freeze to static accessible color tokens.
- **Acceptance Criteria:** `AC-024`
- **Verification:** Playwright visual regression test and accessibility media-query audit.

---

### 5.8 Export & Data Management

#### UR-025: Sanitized Multi-Format Research Export
- **Title:** Export to JSON, CSV, and Markdown Formats
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 24
- **Description:** Users must be able to export research findings into three standard formats:
  1. **JSON:** Complete structured metadata, constraints, matches, and full citation trees.
  2. **CSV:** Flattened comparison table containing entity name, verified price, currency, condition, retailer, URL, match tier, and retrieval timestamp.
  3. **Markdown:** Formatted executive research report with executive summary, match tables, discrepancy notes, and source bibliography.
  Exports must strictly sanitize all internal API keys, database connection strings, and server tokens.
- **Value:** Facilitates downstream data analysis, team presentations, and external record keeping.
- **Dependencies:** `UR-012`, `UR-009`.
- **Expected Behavior:** Browser triggers instant file download with correct MIME type and zero secret exposure.
- **Acceptance Criteria:** `AC-025`
- **Verification:** Automated export generation test asserting presence of citations and absence of secrets.

#### UR-026: User Research Task & Data Deletion
- **Title:** Research History Purge & Data Retention Control
- **Classification:** UR | **Priority:** P0 | **Roadmap Step:** Step 25
- **Description:** Users must be able to permanently delete individual research runs or purge their entire research history. Deletion must perform a cascading hard delete of associated search records, raw extraction snapshots, and queued schedule triggers in PostgreSQL and Redis.
- **Value:** Guarantees user privacy, allows clearing clutter, and complies with data minimization principles.
- **Dependencies:** `UR-020`.
- **Expected Behavior:** Removed records disappear immediately from the UI and are unrecoverable from the database.
- **Acceptance Criteria:** `AC-026`
- **Verification:** Database query assertion verifying 0 orphaned rows following deletion.

---

## 6. Non-Functional Requirements (NFR)

### 6.1 Correctness & Integrity

#### NFR-001: Deterministic Constraint Evaluation & Fact-Checking Rigor
- **Title:** Zero-Hallucination Match Verification
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 38
- **Description:** All numerical constraints (price ceiling, dimensions, memory capacity) and boolean filters (condition, brand, excluded sellers) must be evaluated using deterministic mathematical and logical operators. An LLM must never be permitted to classify an entity as an "Exact Match" if it violates any explicit constraint.
- **Target Metric:** 100% deterministic compliance across all evaluated constraints in automated test suites.
- **Acceptance Criteria:** `AC-027`

### 6.2 Reliability & Fault Tolerance

#### NFR-002: Failure Isolation, Worker Crash Resilience & Idempotent Recovery
- **Title:** Worker Process Fault Isolation
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 23
- **Description:** The background worker must process jobs in isolated sandbox boundaries. An unhandled exception or memory crash in one research task must never take down the API server or abort concurrent research tasks. Resumed jobs must execute idempotently without duplicating side-effects.
- **Target Metric:** 0 worker cascade failures; 100% recovery of pending jobs upon worker restart.
- **Acceptance Criteria:** `AC-028`

#### NFR-003: Network & External API Fault Tolerance
- **Title:** Outbound Circuit Breaking and Timeout Envelopes
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 35
- **Description:** All external HTTP requests to search providers, extraction proxies, and AI inference endpoints must be wrapped in strict timeout envelopes (search: $\le 15\text{s}$, extraction: $\le 20\text{s}$, LLM: $\le 45\text{s}$). Stalled connections must be terminated promptly to preserve worker thread pool health.
- **Target Metric:** Zero hanging threads exceeding timeout boundaries by $> 1.0\text{s}$.
- **Acceptance Criteria:** `AC-029`

### 6.3 Performance & Responsiveness

#### NFR-004: Concurrency Bounding & Progressive Streaming Responsiveness
- **Title:** Bounded Resource Allocation and UI Interactivity
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 43
- **Description:** The system must enforce bounded concurrency on outbound page extractions (configurable default: $\le 10$ simultaneous requests) to avoid IP throttling and memory bloat. The web UI must maintain $\ge 60\text{fps}$ scrolling and interaction response times while streaming live progress events.
- **Target Metric:** Time-to-first-visible-progress $< 1,500\text{ms}$; browser main thread blocking time $< 50\text{ms}$.
- **Acceptance Criteria:** `AC-030`

### 6.4 Cost & Quota Management

#### NFR-005: Provider Spending Caps, Rate Limiting & Resource Quotas
- **Title:** Hard Execution Cost & Request Ceilings
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 44
- **Description:** Every research run must have strict configurable bounds on maximum candidate search queries ($\le 5$), maximum fetched URLs ($\le 100$), and maximum LLM token consumption. Recurring jobs must support a monthly/daily run cap to prevent runaway billing.
- **Target Metric:** Zero runs exceeding configured resource limits.
- **Acceptance Criteria:** `AC-031`

### 6.5 Accessibility (a11y)

#### NFR-006: Accessibility Compliance (WCAG 2.2 Level AA)
- **Title:** Comprehensive Keyboard & Screen Reader Usability
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 56
- **Description:** The entire web application must conform to WCAG 2.2 Level AA standards. Every interactive element must possess a visible focus indicator and full keyboard navigability (`Tab`, `Enter`, `Space`, `Escape`, Arrow keys). Status updates must be announced via ARIA live regions (`aria-live="polite"`). Text contrast must meet or exceed $4.5:1$ for normal text and $3:1$ for large text. Information must never be conveyed solely through color.
- **Target Metric:** 0 axe-core automated accessibility violations on core pages.
- **Acceptance Criteria:** `AC-032`

### 6.6 Security & Threat Defense

#### NFR-007: Secrets Protection & Zero-Client Credential Leakage
- **Title:** Strict Server-Side Secret Isolation
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 25
- **Description:** Provider API keys, database credentials, and session signing secrets must be accessible only to server-side Node.js execution environments. Next.js public bundles, client-accessible state, and browser network payloads must never contain raw API secrets under any condition.
- **Target Metric:** 0 secret exposures across all client bundles and network inspect payloads.
- **Acceptance Criteria:** `AC-033`

#### NFR-008: Prompt Injection Defense & Untrusted Content Sanitization
- **Title:** Adversarial Web Content Isolation
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 45
- **Description:** All scraped webpage text, user input strings, and third-party metadata must be treated as untrusted data. Prompts must employ strict structural delimiter framing (e.g., XML/JSON sandboxing) and system instructions asserting that target web content cannot override core research instructions or exfiltrate system secrets.
- **Target Metric:** 100% interception of simulated indirect prompt injection test vectors.
- **Acceptance Criteria:** `AC-034`

#### NFR-009: SSRF Prevention, Safe Egress & Protocol Hardening
- **Title:** Server-Side Request Forgery Defense
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 35
- **Description:** The extraction proxy and worker fetchers must validate all destination URLs before issuing requests. Outbound requests to `localhost`, loopback addresses (`127.0.0.0/8`), private IPv4 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local addresses (`169.254.0.0/16`), IPv6 loopbacks (`::1`), or non-standard ports (allowing only 80 and 443) must be immediately rejected with an SSRF error.
- **Target Metric:** 100% rejection rate for internal IP and dangerous URI scheme attempts.
- **Acceptance Criteria:** `AC-035`

#### NFR-010: Ethical Scraping & Term Compliance
- **Title:** Respectful Web Scraping & Anti-Bot Bypass Prohibition
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 33
- **Description:** The system must not include CAPTCHA solvers, anti-bot protection circumventors, credential stuffers, paywall bypassers, or deceptive residential proxy networks. If a website denies access (HTTP 401/403 or Cloudflare challenge), the page must be recorded as `ACCESS_DENIED` and bypassed without aggressive countermeasures.
- **Target Metric:** Zero unauthorized circumvention libraries in dependency manifest.
- **Acceptance Criteria:** `AC-036`

### 6.7 Code Quality, Maintainability & Observability

#### NFR-011: Strict TypeScript Contracts & Modular Architecture
- **Title:** End-to-End Type Safety & Component Decoupling
- **Classification:** NFR | **Priority:** P1 | **Roadmap Step:** Step 6
- **Description:** All codebase modules must be written in TypeScript with strict mode enabled (`"strict": true`, `"noImplicitAny": true`). Shared data models (Run, Constraint, Match, Source, Evidence) must be defined in shared validation schemas (e.g., Zod). Provider adapters must implement unified interface contracts (`ISearchProvider`, `IExtractionProvider`, `ILLMProvider`).
- **Target Metric:** 0 TypeScript compile errors; 100% schema validation on external payloads.
- **Acceptance Criteria:** `AC-037`

#### NFR-012: Structured Operational Logging & Secret Redaction
- **Title:** Structured JSON Logging with Automatic Redaction
- **Classification:** NFR | **Priority:** P0 | **Roadmap Step:** Step 8
- **Description:** The application and worker must emit structured JSON logs tagged with correlation IDs (`runId`, `jobId`). All log formatters must pass output through an automated redaction filter that strips patterns resembling API keys, bearer tokens, passwords, and sensitive cookies before writing to stdout or disk.
- **Target Metric:** Zero unmasked API key tokens discovered in log streams during audit.
- **Acceptance Criteria:** `AC-038`

---

## 7. Security, Privacy & Prohibited Behaviors (Non-Negotiable Constraints)

The following 15 security and ethical rules are permanent, non-negotiable project constraints:

1. **No Hardcoded Secrets:** Credentials, keys, passwords, and private tokens must never be hardcoded or committed to version control.
2. **Zero Client-Side Exposure:** Provider secrets must never be passed to the browser or stored in client-accessible local storage.
3. **Untrusted Web Content:** Retrieved web pages must be parsed strictly as untrusted text, never as privileged operational instructions.
4. **Indirect Prompt Injection Defense:** Models must be instructed and structurally constrained to prevent web pages from altering research constraints or exfiltrating data.
5. **Output Schema Validation:** All model-generated structured outputs must be strictly validated against Zod schemas before being accepted.
6. **SSRF Hardening:** Fetch infrastructure must block all requests to private, loopback, or cloud-metadata IP addresses and non-HTTP(S) protocols.
7. **Resource Bounds:** Concurrency, memory allocations, request counts, payload sizes, and timeouts must be hard-capped.
8. **Anti-Bypass Compliance:** Never implement CAPTCHA-bypassing, paywall evasion, or terms-of-service violating countermeasures.
9. **Zero Fabrication:** Never synthesize or fake source URLs, product prices, stock status, citations, or execution metrics.
10. **Zero Autonomous Commerce:** Never execute financial transactions, checkout flows, or automated product purchases.
11. **Zero Credential Collection:** Never prompt for, collect, or store retailer/merchant user account passwords.
12. **No Unapproved Telemetry:** Do not include third-party tracking pixels, marketing scripts, unapproved analytics, or outbound diagnostic telemetry.
13. **Data Protection & Minimization:** Research data and user session state must be protected by database-level constraints and user-controlled deletion.
14. **Invariant Privacy during Fallback:** Privacy boundaries must remain active during model or provider failover; never route restricted queries to unauthorized providers.
15. **Explicit Authorization for Paid Services:** Do not automatically configure or charge commercial third-party accounts without explicit user confirmation.

---

## 8. Explicit MVP Exclusions (OUT Scope)

The following features and architectures are explicitly excluded from the MVP baseline. Introducing them during the 60-step roadmap without formal authorization is prohibited:

- **OUT-001: Foundational Model Training:** Training or fine-tuning custom LLMs/SLMs from scratch.
- **OUT-002: Mandatory Local Inference:** Requiring local GPU hardware or local-only model execution for MVP operation.
- **OUT-003: Autonomous Purchasing & Checkout Automation:** Placing orders, inputting payment details, or booking items autonomously.
- **OUT-004: Anti-Bot & Paywall Circumvention:** Bypassing Cloudflare Turnstile, reCAPTCHA, paywalls, or login portals.
- **OUT-005: Unbounded Web Crawlers:** Implementing recursive, depth-unlimited web crawling spiders.
- **OUT-006: Perfect Accuracy & 100-Site Guarantees:** Promising 100% research completeness or guaranteeing that any arbitrary site can be scraped.
- **OUT-007: Public Multi-Tenant Registration:** Open public user sign-ups, team workspaces, or multi-tenant billing.
- **OUT-008: Third-Party Telemetry & Analytics:** Google Analytics, Mixpanel, Segment, or ad-tracking scripts.
- **OUT-009: Microservices & Kubernetes:** Premature infrastructure decomposition into separate microservice repositories or Kubernetes clusters.
- **OUT-010: Vector Databases (RAG):** Adding Pinecone, Weaviate, or Qdrant before empirical retrieval needs demand vector indexing.
- **OUT-011: Unapproved External Alerting:** Sending SMS, Telegram, Discord, or automated email blasts (in-app alerts only for MVP).
- **OUT-012: Python Runtime Stack:** Introducing Python services or dependencies into the unified TypeScript/Node.js stack.

---

## 9. Future Enhancements (FUT Scope)

The following planned capabilities are documented for architectural compatibility but deferred to post-MVP releases:
- **FUT-001:** Team workspaces, shared research libraries, and role-based access control (RBAC).
- **FUT-002:** External notification webhooks (Discord, Telegram, Slack, Webhook, Email).
- **FUT-003:** Native desktop (Tauri/Electron) and mobile applications.
- **FUT-004:** Local / Offline LLM inference support (Ollama, LM Studio, vLLM).
- **FUT-005:** Domain-specific vector embeddings and persistent semantic RAG archives.
- **FUT-006:** Automated price drop push notifications and deal prediction models.
- **FUT-007:** Chrome/Firefox browser extension for one-click verification of active shopping tabs.
- **FUT-008:** Monetization engine, affiliate referral attribution, and commercial subscription billing.

---

## 10. Engineering Recommendations (REC)

The following technical recommendations are documented for evaluation in upcoming roadmap steps:
- **REC-001:** Conduct a rigorous head-to-head empirical benchmark of Tavily vs Firecrawl in Step 2 across 50 representative commercial and technical research queries to decide search/extraction provider.
- **REC-002:** Implement a two-tier caching architecture (in-memory LRU for short-lived search results, Redis for page extracts with 24-hour TTL) to reduce outbound search costs by up to 60%.
- **REC-003:** Deploy Redis in Append-Only File (AOF) persistence mode with an isolated Dead-Letter Queue (DLQ) to ensure zero scheduled job loss during crashes.
- **REC-004:** Establish 3 predefined research depth presets: *Quick* (up to 10 URLs, ~15s), *Balanced* (up to 30 URLs, ~45s), and *Exhaustive Deep* (up to 100 URLs, ~180s).
- **REC-005:** Utilize dynamic HTML-to-Markdown summarization with token trimming before submitting scraped context to LLMs to minimize context-window token burn.
- **REC-006:** Provide a zero-backend "local-only encrypted browser session" option for single-user desktop deployments where all keys reside in the client's Web Crypto-encrypted session vault.
- **REC-007:** Construct a standalone deterministic fixture runner to simulate network drops, rate limits, and conflicting vendor prices during integration testing.
- **REC-008:** Provide an in-app "Token & Search Cost Counter" displaying estimated dollar cost per run based on published provider rates.

---

## 11. Open Decisions & Baseline Assumptions

### 11.1 Open Decisions Pending Resolution (OPEN)
- **OPEN-001:** Target market, default currency, and geographic locale settings for default search queries (to be resolved in Step 2/Step 16).
- **OPEN-002:** Selection between Tavily, Firecrawl, or hybrid search/extraction architecture (to be decided in Step 2 benchmark).
- **OPEN-003:** Default research depth parameters and URL extraction limits for standard research runs (Step 2/Step 31).
- **OPEN-004:** Baseline numeric accuracy, speed, and cost metrics (to be established via empirical benchmark in Step 2).
- **OPEN-005:** Automated model routing heuristics and provider prioritization weights (Step 41).
- **OPEN-006:** Production cloud deployment host and infrastructure budget envelope (Step 58).
- **OPEN-007:** Inclusion of outbound webhooks or email alerts for price drops in Phase 2 (Step 46).
- **OPEN-008:** User authentication model (single-user owner passkey vs Supabase auth session) (Step 25).
- **OPEN-009:** Historical data retention period and automated archival policy (Step 22).
- **OPEN-010:** Open-source software license selection (MIT vs Apache 2.0 vs Commercial Proprietary) (Step 60).

### 11.2 Provisional Assumptions (ASSUMPTION)
- **ASSUMPTION-001:** Single-user / private owner deployment model is sufficient for the initial MVP release.
- **ASSUMPTION-002:** Outbound network connectivity allows HTTPS egress to external AI and search APIs without enterprise proxy interference.
- **ASSUMPTION-003:** Public e-commerce product pages contain extractable pricing and specification text in accessible DOM structures.
- **ASSUMPTION-004:** Host environment supports Node.js LTS (v20+) and has an operational Redis instance for job queue processing.
- **ASSUMPTION-005:** Target client browsers support modern ECMAScript, CSS Grid/Flexbox, and CSS Custom Properties.

---

## 12. Complete Requirement Traceability Matrix

| Requirement ID | Title | Priority | Target Step | Acceptance Criteria ID | Verification Method |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **UR-001** | Free-form Query Intake | P0 | Step 16 | `AC-001` | Unit / E2E |
| **UR-002** | Structured Constraint Parsing | P0 | Step 17 | `AC-002` | Unit / Integration |
| **UR-003** | Constraint Disambiguation | P0 | Step 18 | `AC-003` | E2E Flow |
| **UR-004** | Search Query Expansion | P0 | Step 31 | `AC-004` | Integration |
| **UR-005** | Bounded Source & Deduplication | P0 | Step 32 | `AC-005` | Unit / Integration |
| **UR-006** | Structured Content Extraction | P0 | Step 33 | `AC-006` | Integration |
| **UR-007** | Partial Result Fault Tolerance | P0 | Step 34 | `AC-007` | Chaos Integration |
| **UR-008** | Progressive Research Telemetry | P0 | Step 19 | `AC-008` | E2E Streaming |
| **UR-009** | Granular Provenance Citation | P0 | Step 36 | `AC-009` | Schema / UI Audit |
| **UR-010** | Temporal Grounding & Fetch Semantics | P0 | Step 37 | `AC-010` | Unit / Integration |
| **UR-011** | Strict Deterministic Matching | P0 | Step 38 | `AC-011` | Automated Unit Suite |
| **UR-012** | Multi-Tier Result Classification | P0 | Step 39 | `AC-012` | Unit / Snapshot |
| **UR-013** | Contradiction & Conflict Preservation | P0 | Step 40 | `AC-013` | Integration |
| **UR-014** | Multi-Provider Key Management | P0 | Step 26 | `AC-014` | Security Audit |
| **UR-015** | Credential Health Check | P0 | Step 27 | `AC-015` | Integration |
| **UR-016** | Provider Rate-Limit Handling | P0 | Step 28 | `AC-016` | Unit Backoff Test |
| **UR-017** | Manual Model Selector Catalog | P0 | Step 29 | `AC-017` | UI Component Test |
| **UR-018** | Auto-Pick Model Routing | P1 | Step 41 | `AC-018` | Unit Routing Test |
| **UR-019** | Privacy-Preserving Fallback | P1 | Step 42 | `AC-019` | Security E2E |
| **UR-020** | Run Persistence & Cancellation | P0 | Step 21 | `AC-020` | Integration / Worker |
| **UR-021** | Research History Catalog | P0 | Step 22 | `AC-021` | E2E Navigation |
| **UR-022** | Persistent Scheduled Research | P1 | Step 46 | `AC-022` | Worker Resilience |
| **UR-023** | Schedule Lifecycle & Delta Detection | P1 | Step 47 | `AC-023` | Unit Snapshot Diff |
| **UR-024** | Accessible UI & Theming Controls | P0 | Step 11 | `AC-024` | Visual / A11y Audit |
| **UR-025** | Sanitized Multi-Format Export | P0 | Step 24 | `AC-025` | Export Schema Audit |
| **UR-026** | Research Purge & Cascading Deletion | P0 | Step 25 | `AC-026` | Database Assertion |
| **NFR-001** | Zero-Hallucination Verification | P0 | Step 38 | `AC-027` | Unit Matrix |
| **NFR-002** | Worker Process Fault Isolation | P0 | Step 23 | `AC-028` | Worker Resilience |
| **NFR-003** | Outbound Circuit Breaking & Timeouts | P0 | Step 35 | `AC-029` | Chaos Integration |
| **NFR-004** | Bounded Concurrency & Streaming | P0 | Step 43 | `AC-030` | Performance Benchmark |
| **NFR-005** | Resource Quotas & Spending Caps | P0 | Step 44 | `AC-031` | Quota Integration |
| **NFR-006** | WCAG 2.2 Level AA Accessibility | P0 | Step 56 | `AC-032` | axe-core Automated |
| **NFR-007** | Zero-Client Secret Leakage | P0 | Step 25 | `AC-033` | Bundle & Payload Scan |
| **NFR-008** | Prompt Injection Defense | P0 | Step 45 | `AC-034` | Security Red-Team Test |
| **NFR-009** | SSRF Defense & Egress Hardening | P0 | Step 35 | `AC-035` | Security Net-Audit |
| **NFR-010** | Ethical Web Scraping Compliance | P0 | Step 33 | `AC-036` | Dependency Audit |
| **NFR-011** | Strict TypeScript Type Safety | P1 | Step 6 | `AC-037` | CI Typecheck |
| **NFR-012** | Structured Logging & Redaction | P0 | Step 8 | `AC-038` | Log Scan Test |

---
*End of MVP Requirements Specification — VerityScout AI*
