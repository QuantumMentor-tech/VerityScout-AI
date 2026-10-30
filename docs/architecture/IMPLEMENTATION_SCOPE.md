# VerityScout AI — Implementation Scope Freeze & Governance Baseline

**Document Identifier:** VS-SCOPE-FREEZE-v1.0  
**Status:** APPROVED MVP SCOPE BASELINE (Implementation Authorized for Steps 6–60)  
**Phase:** Phase 1 (Step 5 of 60)  
**Author:** Principal Software Architect, Requirements Engineer  
**Traceability:** Mapped to [MVP_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/MVP_REQUIREMENTS.md), [DECISION_REGISTER.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md), and [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md).

---

## 1. Product Identity & Clean-Room Governance

- **Official Application Name:** **VerityScout AI** (superseding working research codename DeepWhale AI).
- **Core Visual Identity:** Verified magnifying-compass emblem with cyan-to-violet accent styling ([`VerityScout AI Logo.png`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/VerityScout%20AI%20Logo.png)).
- **Clean-Room Development Policy:** VerityScout AI is an independent, original application built clean-room from verified requirements. Zero code, proprietary assets, or proprietary text from reference video transcripts or third-party repositories shall be copied into this codebase (`DEC-001`).

---

## 2. In-Scope MVP Capabilities Catalog

The implementation scope for the subsequent 55 roadmap steps (Steps 6 through 60) is strictly bound to the 38 frozen requirements established in Step 1:

### 2.1 Functional Capabilities (UR-001 to UR-026)
- **Natural-Language Research Intake:** Flexible query composer with multi-dimensional product constraints (budget ceiling, condition, brand, dimensions) (`UR-001`, `UR-002`).
- **Multi-Provider AI Architecture:** First-class adapters for **OpenAI, OpenRouter, and NVIDIA NIM** with manual model selection and automated routing (`UR-003`, `UR-004`).
- **Web Discovery & Page Extraction:** Multi-query search orchestration via Tavily/Exa, combined with two-tier extraction (Direct Safe-Fetch Tier 1 + Cloud Extraction Tier 2) (`UR-005`, `UR-006`).
- **Evidence-First Verification:** Source-linked findings with exact URL citations, extraction timestamps, and direct quote excerpts (`UR-007`).
- **Deterministic Hard-Constraint Verification:** Zero-hallucination mathematical verification of prices, conditions, and specifications; negative constraint enforcement (`UR-008`, `UR-009`).
- **Multi-Tier Finding Categorization:** Structured classification into Strong Matches, Near-Matches, Partially Verified, Conflicting, and Excluded tiers (`UR-010`, `DEC-010`).
- **User Interface & Accessibility:** Responsive web interface with cyan/violet theme accents, high-contrast states, and full `prefers-reduced-motion` compliance (`UR-011`, `UR-012`).
- **History & Cascading Management:** Persistent research run history, detailed run inspection, and cascading purge on deletion (`UR-013`, `UR-020`).
- **Multi-Format Export:** Sanitized report exports in JSON, CSV (formula injection neutralized), and Markdown (`UR-014`).
- **Persistent Scheduled Monitoring:** Repeatable background monitoring jobs with change detection and price-drop tracking (`UR-015`, `UR-016`, `UR-017`).
- **Bring-Your-Own-Key (BYOK) Vault:** Server-side AES-256-GCM encrypted credential vault with zero client-side leakage (`UR-018`, `UR-019`).
- **Transparent Usage & Cost Controls:** Hard per-run spending caps, rate-limiting, and detailed cost accounting (`UR-023`, `UR-024`).

### 2.2 Non-Functional Standards (NFR-001 to NFR-012)
- **Factual Accuracy:** $\ge 90\%$ overall benchmark score; 0% budget-exceeding items in Strong Match tier (`NFR-001`).
- **Performance & Latency:** Interactive API response $<200\text{ms}$; complete research run $<90\text{s}$ (`NFR-002`).
- **Accessibility:** 100% WCAG 2.2 Level AA compliance (`NFR-006`).
- **Security & Privacy:** Zero secrets in client bundles; pre-fetch DNS SSRF blocking; DOMPurify XSS sanitization; parameterized SQL queries (`NFR-007`).
- **Resilience:** BullMQ bounded retries (max 3), Dead-Letter Queue quarantine, and automatic recovery on worker restart (`NFR-008`).

---

## 3. Explicit Out-of-Scope Exclusions (OUT)

The following 12 items are **strictly excluded** from the MVP implementation scope. Future coding-agent prompts must not scaffold or introduce these features:

| Exclusion ID | Excluded Capability | Rationale & Governance Rule |
|---|---|---|
| **OUT-001** | Foundational LLM/SLM Model Training | Prohibitive compute expense; redundant with commercial/open-weights APIs. |
| **OUT-002** | Mandatory Local / Offline GPU Inference | Web application baseline must be deployable without requiring consumer GPU hardware. |
| **OUT-003** | Autonomous Checkout & Financial Transactions | Severe liability, banking compliance, and financial risk; research only. |
| **OUT-004** | Anti-Bot Circumvention & CAPTCHA Bypassing | Legal compliance and ethical web scraping standards. |
| **OUT-005** | Unbounded Web Crawlers & Spidering | Runaway cloud costs and server IP blacklisting. |
| **OUT-006** | 100% Scraping Guarantees on Arbitrary Sites | Inherently false for dynamic, volatile, bot-protected live web targets. |
| **OUT-007** | Public Multi-Tenant User Self-Registration | Single-user / team owner deployment baseline for MVP (`ASSUMPTION-001`). |
| **OUT-008** | Third-Party Telemetry & Tracking Pixels | User privacy protection and zero-leakage security boundaries. |
| **OUT-009** | Microservices Architecture & Kubernetes | Excessive operational overhead for single-service modular monolith. |
| **OUT-010** | Vector Databases (Pinecone, Weaviate, Qdrant) | Relational PostgreSQL indexing satisfies MVP search requirements. |
| **OUT-011** | Outbound External Messaging (SMS, Telegram, Email) | In-app alerts provide complete MVP alerting without spam or messaging costs. |
| **OUT-012** | Python Runtime & Polyglot Stack | Unified TypeScript stack avoids cross-runtime deployment friction. |

---

## 4. Subsystem Definition of Done (DoD)

Before any implementation milestone is accepted during subsequent steps, it must satisfy its subsystem Definition of Done:

1. **Frontend Subsystem:**
   - [ ] Semantic HTML5 elements used throughout; zero empty generic `<div>` soup.
   - [ ] Automated `axe-core` accessibility scan yields 0 Critical and 0 High violations.
   - [ ] Respects `prefers-reduced-motion: reduce` across all transitions and animations.
   - [ ] No secrets or sensitive environment variables bundled in client output.

2. **API & Ingress Subsystem:**
   - [ ] 100% of request payloads validated via strict Zod schemas (`.strict()`).
   - [ ] Every private endpoint enforces server-side ownership verification (`WHERE id = :id AND user_id = :userId`).
   - [ ] Standardized error envelopes returned for all 4xx/5xx responses; zero unhandled stack traces.

3. **Domain & Verification Subsystem:**
   - [ ] Numeric constraints evaluated by deterministic TypeScript logic; zero reliance on LLM confidence scores.
   - [ ] Negative constraint violation (`FIX-GPU-001`, price exceeds budget) automatically overrides status to `REFUTED`.
   - [ ] Multi-tier categorization correctly separates exact matches from near-matches and conflicting claims.

4. **Worker & Scheduling Subsystem:**
   - [ ] Long-running research executes exclusively in the worker process outside of web HTTP timeouts.
   - [ ] Atomic database pre-check verifies active task status upon dequeue; paused/deleted tasks are skipped.
   - [ ] Repeatable jobs utilize deterministic idempotency keys (`SHA256(taskId + slot)`).
   - [ ] Failing jobs terminate after exactly 3 retries and quarantine into the Dead-Letter Queue.

5. **Persistence Subsystem:**
   - [ ] PostgreSQL Row Level Security (RLS) active on all user-owned tables.
   - [ ] Foreign keys enforce `ON DELETE CASCADE` across all child research runs and evidence records.
   - [ ] All database queries parameterized; zero raw string interpolation into SQL statements.

6. **Provider Adapter Subsystem:**
   - [ ] All providers implement `ISearchProvider`, `IExtractionProvider`, or `ILLMProvider`.
   - [ ] Tier 1 Direct Safe-Fetch verifies DNS against RFC 1918 private subnets and cloud metadata before connecting.
   - [ ] XML delimiter framing (`<untrusted_web_source>`) applied to all third-party web text in prompts.
   - [ ] Circuit breaker halts external provider calls after 5 consecutive failures.
