# VerityScout AI — Architecture & Requirements Decision Register
**Document Version:** 1.0.0-FROZEN  
**Phase:** Phase 1 (Requirements, Research, and Feasibility) — Step 1 of 60  
**Status:** Requirements Baseline Frozen for Implementation  
**Related Documents:** [MVP Requirements Specification](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/docs/requirements/MVP_REQUIREMENTS.md), [Acceptance Criteria Catalog](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/docs/requirements/ACCEPTANCE_CRITERIA.md)

---

## 1. Governance & Decision Register Purpose

The Decision Register serves as the definitive record of all confirmed technical baselines, open product questions, provisional assumptions, and architectural trade-offs for VerityScout AI. It enforces strict governance throughout the 60-step roadmap:

- **Confirmed Decisions (`DEC`):** Formally approved technical baselines that direct implementation.
- **Recommendations (`REC`):** Architectural or tooling options requiring empirical evidence or formal review before adoption.
- **Open Decisions (`OPEN`):** Unresolved decisions that must **not** be guessed or silently implemented.
- **Provisional Assumptions (`ASSUMPTION`):** Working assumptions accepted for MVP planning; subject to empirical validation.
- **Deferred Decisions (`FUT`):** Confirmed features explicitly scheduled for post-MVP phases.
- **Explicit Exclusions (`OUT`):** Functionality strictly excluded from the project.

---

## 2. Confirmed Technical Decisions (DEC)

| Decision ID | Decision Title | Status | Source / Evidence | Implementation Impact | Planned Step |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEC-001** | **Application Name & Clean-Room Brand Identity** | Confirmed | User Direction & Logo Asset | Approved working name is **VerityScout AI** (superseding research name DeepWhale AI). Visual motif is the verified magnifying-compass emblem (`VerityScout AI Logo.png`) with cyan-to-violet accent styling. Clean-room development: zero copy of proprietary source code or assets. | Step 1, Step 11 |
| **DEC-002** | **Full-Stack TypeScript Technology Stack** | Confirmed | Approved Technical Baseline | Frontend: Next.js (App Router), React, HTML5, Vanilla CSS / CSS Modules (Tailwind avoided). Backend: Node.js (LTS v20+) with TypeScript route handlers. Unified TypeScript contracts across UI, API, and worker. Python eliminated to prevent cross-language friction. | Steps 6–10 |
| **DEC-003** | **Durable Worker & Queue Architecture** | Confirmed | Approved Technical Baseline | Persistent Node.js worker separate from API handlers; BullMQ backed by Redis for multi-step research execution, rate-limiting, and durable scheduling. Browser timers explicitly banned for background jobs. | Step 23, Step 46 |
| **DEC-004** | **Relational Persistence via PostgreSQL** | Confirmed | Approved Technical Baseline | PostgreSQL selected as primary relational store for research runs, structured constraints, extracted sources, and match entities. Supabase designated as planned managed PostgreSQL platform. | Step 21 |
| **DEC-005** | **Multi-Provider AI Architecture** | Confirmed | Approved Technical Baseline | Core AI provider adapters for OpenAI, OpenRouter, and NVIDIA NIM. Secure server-side credential isolation; client-side never receives raw keys. Supports manual model selection and automated routing. | Steps 26–30 |
| **DEC-006** | **Pluggable Search & Two-Tier Extraction Architecture** | Confirmed Baseline | Step 3 Provider Evaluation (`PROVIDER_EVALUATION.md`) | Search abstraction (`ISearchProvider`) supporting Tavily and Exa; Extraction abstraction (`IExtractionProvider`) supporting Tier 1 Direct HTTP Fetch (free/static) and Tier 2 Firecrawl (JS/SPAs). Zero vendor lock-in. | Step 3, Steps 31–33 |
| **DEC-007** | **Testing & Quality Assurance Stack** | Confirmed | Approved Technical Baseline | Vitest for unit and integration testing; Playwright for end-to-end browser and visual regression testing; axe-core for WCAG 2.2 AA accessibility verification. | Step 7, Steps 51–56 |
| **DEC-008** | **Deterministic Constraint Verification** | Confirmed | Section 6.4, 7 & 8 | Verification of price ceilings, condition, brand, and excluded keywords must be performed by deterministic programmatic logic, never by probabilistic LLM confidence scores. Zero budget-exceeding items permitted in Exact Match tier. | Step 38 |
| **DEC-009** | **Granular Field-Level Provenance & Citations** | Confirmed | Section 6.3 | Every product claim, price quote, and availability state must preserve source URL, page title, extraction timestamp, and raw text excerpt. Inaccessible sources cannot be claimed as out of stock. | Steps 36–37 |
| **DEC-010** | **Multi-Tier Categorization & Conflict Preservation** | Confirmed | Section 6.4 | Findings must be separated into Strong Matches, Near-Matches, Partially Verified, Uncertain, Conflicting, Stale, and Excluded tiers. Incompatible claims between sources must be preserved side-by-side, never averaged or concealed. | Steps 39–40 |
| **DEC-011** | **Reduced-Motion & Accent Theming Controls** | Confirmed | Section 6.9 | Cyan/violet accents must be user-controllable, featuring a setting to disable transitions. CSS must strictly honor `prefers-reduced-motion: reduce`. Essential controls must never rely on color alone. | Step 11, Step 56 |
| **DEC-012** | **Sanitized Multi-Format Research Exports** | Confirmed | Section 6.10 | Exports supported in JSON, CSV, and Markdown formats. All exports must preserve source metadata while strictly stripping internal API keys, passwords, and tokens. | Step 24 |

---

## 3. Engineering Recommendations Pending Approval (REC)

| Recommendation ID | Title | Rationale | Trade-offs & Risks | Planned Step | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REC-001** | **Controlled 12-Query Pilot Benchmark for Live APIs** | Execute the frozen 12-case pilot protocol (`PROVIDER_BENCHMARK_PROTOCOL.md`) across Tavily, Exa, and Firecrawl when test budget ($2.00 cap) is authorized. | Consumes ~$0.60–$1.50 in API credits; delivers empirical latency, domain diversity, and reference recovery metrics. | Step 31 | Protocol Frozen; Awaiting Budget Authorization |
| **REC-002** | **Two-Tier Search & Content Caching Architecture** | In-memory LRU cache for short-lived search results (1-hour TTL); Redis cache for scraped Markdown/DOM content (24-hour TTL). | Dramatically lowers third-party API spend and run latency; requires cache invalidation logic for volatile stock/pricing. | Step 34 | Recommended |
| **REC-003** | **Redis AOF Persistence & Dead-Letter Queue (DLQ)** | Configure Redis with `appendonly yes` and BullMQ dead-letter queues. | Slight disk I/O overhead on Redis server, but guarantees 100% job recovery after unexpected server reboots. | Step 23 | Recommended |
| **REC-004** | **Predefined Research Depth Profiles** | Offer 3 user-facing presets: *Quick* (10 URLs, ~15s), *Balanced* (30 URLs, ~45s), *Deep* (100 URLs, ~180s). | Constrains arbitrary user inputs to predictable quota and latency profiles. | Step 16 | Recommended |
| **REC-005** | **Markdown Content Trimming & Token Optimization** | Strip HTML boilerplate, navigation headers, footers, and scripts before tokenizing for LLM extraction. | Reduces input tokens by up to 70%, accelerating inference and reducing OpenRouter/OpenAI API costs. | Step 33 | Recommended |
| **REC-006** | **Client-Side WebCrypto Session Vault for Local Desktop** | Provide an optional encrypted browser session mode where API keys are encrypted with WebCrypto and never stored on disk. | Enhances user privacy for self-hosted instances; requires user to re-enter passphrase on fresh sessions. | Step 25 | Recommended |
| **REC-007** | **Synthetic Deterministic Chaos Fixture Suite** | Build a mock server capable of injecting HTTP 429 rate limits, HTTP 504 timeouts, Cloudflare challenges, and conflicting prices. | Enables continuous CI testing of edge cases without consuming live third-party API quotas. | Step 7 | Recommended |
| **REC-008** | **In-App Real-Time Run Cost Estimator** | Calculate and display estimated run cost based on token counts and search provider query costs. | Increases cost transparency for users; requires maintaining an up-to-date provider pricing table. | Step 44 | Recommended |
| **REC-009** | **Pre-Fetch DNS Resolution & SSRF Blocklist Filter** | Pre-resolve DNS in safe-fetch client before TCP connect to block loopback, RFC 1918 private, link-local, and cloud metadata (`169.254.169.254`) addresses, intercepting redirects up to 3 hops. | Protects internal services and cloud metadata from SSRF; prevents DNS rebinding attacks. | Step 32 | Recommended (SEC-012, SEC-013) |
| **REC-010** | **AES-256-GCM Vault for Server-Side Provider Key Storage** | Store user-supplied AI and search provider API keys in PostgreSQL using AES-256-GCM authenticated encryption with a server-managed master key. | Prevents plaintext credential leakage in database dumps and backups; keys decrypted only in-memory during active HTTP calls. | Step 25 | Recommended (SEC-002) |

---

## 4. Open Decisions Pending Resolution (OPEN)

These decisions are intentionally unresolved and must **not** be assumed or prematurely closed:

| Decision ID | Open Question | Options Considered | Resolution Plan / Blocker | Target Step |
| :--- | :--- | :--- | :--- | :--- |
| **OPEN-001** | **Default Launch Market, Region & Currency** | 1. US / USD (default fallback)<br>2. Dynamic browser geolocation detection<br>3. Mandatory user selection on onboarding | To be evaluated based on target user audience during Step 2 / Step 16 query composer design. | Step 16 |
| **OPEN-002** | **Final Production Search & Extraction Provider Adoption** | 1. Tavily (Search + Extract)<br>2. Exa (Search + Contents)<br>3. Hybrid: Exa Search + Firecrawl Extract<br>4. Pluggable Dual-Provider Adapter with Two-Tier Extraction | Step 3 evaluation completed via official documentation and cost modeling (`PROVIDER_EVALUATION.md`). Final production selection will be confirmed in Step 31 upon empirical pilot completion. | Step 31 |
| **OPEN-003** | **Default Research Depth & Source Extraction Limits** | 1. Default 20 sources, max 50<br>2. Default 30 sources, max 100<br>3. Tiered by user account mode | Benchmark data in Step 2 will determine latency and cost curves before setting defaults. | Step 2, Step 32 |
| **OPEN-004** | **Baseline Numeric Accuracy, Latency & Cost Targets** | 1. Strict SLA (e.g., $< 30\text{s}$, $< \$0.05/\text{run}$)<br>2. Flexible best-effort SLA | Requires live measurement in Step 2 benchmark across sample workloads. | Step 2 |
| **OPEN-005** | **Automated Model Routing Prioritization Weights** | 1. Cost-first optimization<br>2. Latency-first optimization<br>3. Quality/Accuracy-first (defaulting to flagship reasoning models) | Needs user configuration preference model; to be designed in Step 41. | Step 41 |
| **OPEN-006** | **Production Cloud Hosting & Infrastructure Budget** | 1. Vercel (Frontend/API) + Railway/Render (Worker + Redis)<br>2. Unified AWS / DigitalOcean droplet<br>3. Supabase self-hosted | Dependent on deployment budget authorization from user in Step 58. | Step 58 |
| **OPEN-007** | **Inclusion of External Notification Channels in Phase 2** | 1. In-app notifications only (MVP baseline)<br>2. Discord / Telegram bot webhooks<br>3. Resend / SendGrid email alerts | Excluded from MVP; to be reviewed for Phase 2 roadmap in Step 46. | Step 46 |
| **OPEN-008** | **User Authentication Architecture for Single-User MVP** | 1. Local master password / passkey protection<br>2. Supabase Auth (email magic link / OAuth)<br>3. Zero-auth private localhost deployment | Dependent on whether application is deployed locally or hosted on public cloud; resolved in Step 25. | Step 25 |
| **OPEN-009** | **Historical Data Retention & Auto-Archival Policy** | 1. Indefinite local retention until manual deletion<br>2. 30-day rolling purge for raw HTML extracts<br>3. Configurable retention window | Policy decision to be confirmed during database schema design in Step 22. | Step 22 |
| **OPEN-010** | **Open-Source Software License & Commercial Distribution** | 1. MIT License<br>2. Apache 2.0 (patent protection)<br>3. AGPLv3 (copyleft SaaS protection)<br>4. Proprietary Closed Source | Legal and commercial strategy to be finalized prior to release in Step 60. | Step 60 |
| **OPEN-011** | **Target Legal Jurisdiction & Privacy Compliance Baseline** | 1. US-only commercial launch (CCPA/CPRA focus)<br>2. Global / EU launch (Mandatory GDPR DPAs, cookie consents, DPO evaluation) | Requires formal legal review prior to public launch or processing payments (documented in `PRIVACY_AND_DATA_FLOW.md`). | Step 60 |

---

## 5. Provisional Assumptions (ASSUMPTION)

| Assumption ID | Working Assumption Statement | Validation Strategy | Impact if Invalidated |
| :--- | :--- | :--- | :--- |
| **ASSUMPTION-001** | **Single-User / Owner Deployment Baseline:** Initial MVP serves a single operator or team with shared credentials; multi-tenant tenant isolation is not required for MVP. | Confirmed via project scope boundaries. | If multi-tenancy is required later, database schema will require tenant foreign keys (`organization_id`). |
| **ASSUMPTION-002** | **Unrestricted Outbound HTTPS Egress:** The hosting environment permits outbound HTTPS connections to external search, extraction, and LLM endpoints without corporate proxy filtering. | Tested during Step 6 environment validation. | If proxy required, HTTP clients must support `https-proxy-agent`. |
| **ASSUMPTION-003** | **Accessible Public E-Commerce DOMs:** Major public retailers provide extractable product pricing and specifications in accessible HTML/JSON-LD structures. | Tested in Step 2 benchmark across top 10 retail platforms. | If sites employ heavy obfuscation, fallback to search engine snippet summaries or extraction API rendering is required. |
| **ASSUMPTION-004** | **Node.js LTS (v20+) & Redis Availability:** Production and development environments support Node.js LTS and a standard Redis instance for BullMQ queue management. | Validated in Step 6 development foundation. | If Redis is unavailable, must evaluate in-memory SQLite queues (suboptimal for distributed persistence). |
| **ASSUMPTION-005** | **Modern Evergreen Browser Support:** Target users utilize modern browsers supporting CSS Grid, Flexbox, CSS Custom Properties, and ES2022. | Validated via Playwright cross-browser testing. | Zero legacy IE11 support required. |

---

## 6. Explicit MVP Exclusions (OUT)

The following 12 items are strictly excluded from the MVP scope:

| Exclusion ID | Excluded Feature / Scope | Rationale for Exclusion |
| :--- | :--- | :--- |
| **OUT-001** | **Foundational LLM/SLM Training from Scratch** | Prohibitive compute expense, timeline incompatibility, and redundancy with high-performance commercial/open-weights APIs. |
| **OUT-002** | **Mandatory Local / Offline GPU Inference** | MVP targets accessible web deployment without mandating high-end consumer GPU hardware. |
| **OUT-003** | **Autonomous Checkout & Financial Transactions** | Extreme liability, banking compliance risks, and security exposure; research and verification only. |
| **OUT-004** | **Anti-Bot Circumvention & CAPTCHA Bypassing** | Legal compliance, term-of-service adherence, and ethical web scraping standards. |
| **OUT-005** | **Unbounded Web Crawlers & Spidering** | Risk of runaway cloud costs, infinite redirect loops, and server IP blacklisting. |
| **OUT-006** | **100% Scraping Guarantees & Perfect Accuracy Claims** | Inherently untestable and false for dynamic, volatile, bot-protected live web targets. |
| **OUT-007** | **Public Multi-Tenant User Registration** | Premature complexity before single-user verification engine is hardened and proven. |
| **OUT-008** | **Third-Party Telemetry & Tracking Pixels** | User privacy protection and adherence to strict zero-leakage security boundaries. |
| **OUT-009** | **Microservices Architecture & Kubernetes** | Unnecessary operational overhead for single-service Next.js + worker application. |
| **OUT-010** | **Vector Database (Pinecone, Weaviate, Qdrant)** | Premature infrastructure addition; relational Postgres indexing satisfies MVP research search requirements. |
| **OUT-011** | **Outbound External Alerts (SMS, Telegram, Email)** | In-app alerts provide complete MVP alerting without third-party messaging costs or spam risks. |
| **OUT-012** | **Python Runtime & Polyglot Stack** | Introduces multi-runtime deployment friction, duplicate data contracts, and dependency divergence. |

---

## 7. Deferred Post-MVP Features (FUT)

| Future ID | Feature Title | Planned Phase | Prerequisites |
| :--- | :--- | :--- | :--- |
| **FUT-001** | Multi-User Workspaces, RBAC & Shared Research Folders | Phase 2 | Database tenant schemas (`Step 21`) |
| **FUT-002** | External Webhooks & Alert Dispatchers (Telegram, Discord, Email) | Phase 2 | In-app notification center (`Step 47`) |
| **FUT-003** | Native Desktop App (Tauri / Electron) & Mobile Shells | Phase 3 | Hardened responsive web shell (`Step 11`) |
| **FUT-004** | Local Model Provider Support (Ollama, LM Studio, vLLM) | Phase 2 | Unified LLM adapter interface (`Step 26`) |
| **FUT-005** | Persistent Vector Knowledge Graph & Longitudinal RAG | Phase 3 | Historical database archives (`Step 22`) |
| **FUT-006** | Predictive Price Drop Modeling & Deal Forecasting | Phase 3 | Accumulated price delta snapshots (`Step 47`) |
| **FUT-007** | Browser Extension for One-Click Active Tab Verification | Phase 3 | REST API verification endpoints (`Step 38`) |
| **FUT-008** | Commercial Affiliate Referral Engine & Billing Tier | Phase 3 | Monetization strategy sign-off (`OPEN-010`) |

---

## 8. Discovered Technical and Operational Risks

> [!NOTE]
> The preliminary risks identified during Step 1 have been expanded into a comprehensive 26-scenario operational risk register in [RISK_REGISTER.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/RISK_REGISTER.md) during Step 4. See that document for full likelihood/impact scorings, mitigation controls, and residual risk assessments.

| Preliminary Risk ID | Summary Description | Initial Severity | Formal Register Reference |
| :--- | :--- | :--- | :--- |
| **PR-001** | Anti-Bot Blocking on Tier-1 E-Commerce Sites | High | [RISK-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/RISK_REGISTER.md#operational-risk-register-catalog) |
| **PR-002** | Volatile Pricing & Stale Search Indexing | High | [RISK-007](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/RISK_REGISTER.md#operational-risk-register-catalog) |
| **PR-003** | Third-Party API Rate Limits & Cost Runaway | Medium | [RISK-010](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/RISK_REGISTER.md#operational-risk-register-catalog) |
| **PR-004** | Indirect Prompt Injection via Malicious Webpages | High | [RISK-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/RISK_REGISTER.md#operational-risk-register-catalog) |
| **PR-005** | Worker Zombie Tasks on Browser Disconnect | Medium | [RISK-011](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/RISK_REGISTER.md#operational-risk-register-catalog) |

---

## 9. Architecture Decision Records (ADR) Index

The formal architectural decisions established in Step 5 are recorded in [`docs/architecture/adr/`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/):

| ADR ID | Decision Title | Status | Primary Focus | Related DEC / OPEN | Target Steps |
|---|---|---|---|---|---|
| **ADR-001** | Frontend Architecture & TypeScript Strategy | APPROVED | Next.js App Router, React, TypeScript, Vanilla CSS Modules | DEC-002 | Steps 6–17 |
| **ADR-002** | Modular Monolith & Persistent Worker Separation | APPROVED | Decoupled web API and durable worker processes | DEC-003 | Steps 23, 43 |
| **ADR-003** | Persistent Relational Database & Data Access | APPROVED | PostgreSQL (Supabase candidate), RLS, cascade deletions | DEC-004 | Steps 21, 22, 24 |
| **ADR-004** | Background Queue & Recurring Scheduling | APPROVED | BullMQ over Redis, idempotency, bounded backoff, DLQ | DEC-003 | Steps 23, 43, 46 |
| **ADR-005** | Search & Two-Tier Extraction Abstraction | APPROVED / PENDING | `ISearchProvider`, Safe-Fetch Tier 1, Cloud Tier 2 | DEC-006, OPEN-002 | Steps 31–34 |
| **ADR-006** | LLM Provider Abstraction & Model Routing | APPROVED | `ILLMProvider` (OpenAI, OpenRouter, NIM), whitelist routing | DEC-005, OPEN-005 | Steps 26–30, 42 |
| **ADR-007** | Evidence-First & Deterministic Constraints | APPROVED | Code-level math verification, multi-tier categorization | DEC-008, 009, 010 | Steps 35–40 |
| **ADR-008** | RESTful API Design & Contract Versioning | APPROVED | `/api/v1/*` base path, strict Zod schemas, standard errors | DEC-012 | Steps 7, 23 |
| **ADR-009** | Progress Transport & Run Recovery | APPROVED | SSE progress streams (`/events`), DB snapshot polling | DEC-003 | Steps 12, 43 |
| **ADR-010** | Auth, Secrets & Owner Isolation | APPROVED | Cookie sessions, AES-256-GCM vault, dual-layer RLS | DEC-004 | Steps 9, 23, 24, 25 |
| **ADR-011** | Automated Testing & Quality Gates | APPROVED | Vitest (unit/int), Playwright (E2E/a11y), 60-case benchmark | DEC-007 | Steps 8, 51–56 |
| **ADR-012** | Deployment Topology & Cost Control | PROPOSED / PENDING | 2-process Docker/cloud baseline, $0.25/run cap, 6h min interval | OPEN-006 | Steps 45, 57–59 |

---

*End of Architecture & Requirements Decision Register — VerityScout AI*
