# VerityScout AI - Operational Risk Register

**Document Identifier:** VS-RISK-REG-v1.0  
**Status:** DRAFT / APPROVED BASELINE FOR IMPLEMENTATION  
**Phase:** Phase 1 (Step 4 of 60)  
**Author:** Principal Application Security Architect & Technical Risk Analyst  
**Traceability:** Mapped to [THREAT_MODEL.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/THREAT_MODEL.md), [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md), and [DECISION_REGISTER.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md).

---

## 1. Executive Summary & Scoring Methodology

This document tracks the material technical, security, operational, provider, and quality risks identified for VerityScout AI. Each risk scenario is evaluated using a structured 5x5 Likelihood and Impact matrix, assigned an initial risk score, mapped to concrete engineering controls, assigned a target roadmap step, and assessed for residual risk.

### Risk Rating Scale:
- **Likelihood (L):** 1 (Rare), 2 (Unlikely), 3 (Moderate), 4 (Likely), 5 (Almost Certain / Frequent)
- **Impact (I):** 1 (Negligible), 2 (Minor), 3 (Moderate), 4 (Major), 5 (Catastrophic / Severe)
- **Risk Score = L × I (Range 1 to 25)**
  - **Low:** 1 to 4
  - **Medium:** 5 to 9
  - **High:** 10 to 15
  - **Critical:** 16 to 25

> [!IMPORTANT]
> **Mandatory High/Critical Overrides:**
> Regardless of numerical score calculation, risks involving API key theft, cross-user unauthorized data access (BOLA), SSRF into internal/cloud metadata networks, or prompt injection overriding security bounds are assigned an automatic minimum rating of **High** or **Critical**.

---

## 2. Operational Risk Register Catalog

| Risk ID | Risk Category | Risk Title & Scenario | Initial L | Initial I | Score & Rating | Proposed Mitigation Controls | Target Step | Residual Risk | Approval Status |
|---|---|---|---|---|---|---|---|---|---|
| **RISK-001** | Security | **Provider API-Key Disclosure**<br>Exposure of BYOK or platform keys via client bundles, logs, or error dumps. | 3 | 5 | **15 (Critical)** *(Override)* | SEC-001 (Server isolation), SEC-002 (AES-256 vault), SEC-003 (Log redaction), SEC-005 (No keys in Redis). | Step 9, 25 | Low (Keys exist only in ephemeral server memory). | APPROVED PROPOSAL |
| **RISK-002** | Security | **Unauthorized Cross-User Data Access (BOLA/IDOR)**<br>User accesses or deletes another user's research tasks or reports by guessing UUIDs. | 3 | 4 | **12 (High)** *(Override)* | SEC-006 (Signed cookies), SEC-007 (Server owner validation), SEC-008 (PostgreSQL RLS). | Step 23, 24 | Low (Dual-layer authorization: API + DB RLS). | APPROVED PROPOSAL |
| **RISK-003** | Security | **SSRF via Submitted or Discovered URLs**<br>Scraper makes requests to cloud metadata (`169.254.169.254`) or internal subnets (`10.0.0.0/8`). | 3 | 5 | **15 (Critical)** *(Override)* | SEC-011 (HTTP/HTTPS only), SEC-012 (Pre-fetch DNS IP blocklist), SEC-015 (Ports 80/443 only). | Step 32 | Low (Socket connections to private IPs blocked at DNS level). | APPROVED PROPOSAL |
| **RISK-004** | Security | **DNS Rebinding and Redirect Manipulation**<br>Target URL redirects to internal IP after initial DNS check passes (TOCTOU). | 2 | 5 | **10 (High)** *(Override)* | SEC-013 (Per-hop redirect inspection, max 3 hops, IP pinning on connect). | Step 32 | Low (Every hop validated before connection). | APPROVED PROPOSAL |
| **RISK-005** | AI / Security | **Indirect Prompt Injection in Retrieved Webpages**<br>Malicious web page injects commands into LLM context to falsify report or execute actions. | 4 | 4 | **16 (Critical)** | SEC-016 (XML delimiter framing), SEC-017 (Deterministic post-verification), SEC-019 (Sandboxed read-only tools). | Step 30, 36, 37 | Medium (LLM may be misled textually, but deterministic specs and tools are locked). | APPROVED PROPOSAL |
| **RISK-006** | Quality | **Inaccurate or Misleading Price and Stock Claims**<br>Scraper extracts outdated cached prices, sponsored ads, or confusing variant pricing. | 4 | 3 | **12 (High)** | SEC-017 (Deterministic spec validation), multi-source consensus, clear timestamp tracking. | Step 35, 37 | Medium (Dependent on website markup complexity; mitigated by direct quote snippets). | APPROVED PROPOSAL |
| **RISK-007** | Quality | **Stale Product Evidence Presented as Current**<br>Price change occurs, but old cached result is shown without refresh indicator. | 4 | 2 | **8 (Medium)** | Evidence TTL tracking (max 24h), prominent extraction timestamps on UI cards, manual re-run trigger. | Step 14, 35 | Low (UI explicitly displays "Extracted X hours ago"). | APPROVED PROPOSAL |
| **RISK-008** | Provider | **Downstream Provider Outages (OpenAI / Tavily)**<br>Search or LLM API experiences prolonged HTTP 5xx downtime or network partition. | 3 | 4 | **12 (High)** | SEC-031 (Privacy-aware fallback), SEC-038 (Circuit breakers), user-friendly graceful degradation. | Step 27, 42 | Medium (If user configures single provider, outages temporarily halt research). | APPROVED PROPOSAL |
| **RISK-009** | Provider | **API Quota and Rate Limit Exhaustion**<br>Provider tier rate limits (TPM/RPM) exceeded, leading to 429 throttling and dropped runs. | 4 | 3 | **12 (High)** | Request token accounting, exponential backoff retries, user notification of quota exhaustion. | Step 27, 45 | Low (Retries queue jobs without data loss; user prompted to upgrade key). | APPROVED PROPOSAL |
| **RISK-010** | Financial | **Unexpected Cost Increases and Runaway Queries**<br>High-token prompts or looping search queries exhaust user or platform balance. | 3 | 4 | **12 (High)** | SEC-035 (Hard per-run spending cap $0.25, max 16k tokens, max 5 searches), SEC-037 (Concurrency bounds). | Step 45 | Low (Hard stop prevents any single run from exceeding budget). | APPROVED PROPOSAL |
| **RISK-011** | Operational | **Queue Backlog or Retry Storm in Redis**<br>Worker crashes cause failing jobs to loop indefinitely, overwhelming Redis and CPU. | 3 | 4 | **12 (High)** | SEC-028 (Max 3 retries, exponential backoff 5s-20s, Dead-Letter Queue quarantine). | Step 43 | Low (Poison pills isolated to DLQ after 3 failures). | APPROVED PROPOSAL |
| **RISK-012** | Operational | **Duplicate Scheduled Job Executions**<br>Clock drift or BullMQ worker re-balance triggers multiple parallel runs for the same task. | 2 | 3 | **6 (Medium)** | SEC-027 (Deterministic idempotency key `SHA256(taskId + slot)` and DB unique constraints). | Step 46 | Low (Redis rejects duplicate IDs; DB enforces uniqueness). | APPROVED PROPOSAL |
| **RISK-013** | Operational | **Schedule Execution After Task Pause or Deletion**<br>Task paused by user, but pre-queued delayed job runs anyway, consuming credits. | 3 | 3 | **9 (Medium)** | SEC-026 (Mandatory atomic DB pre-check on dequeue; job skipped if paused). | Step 46 | Low (Atomic check guarantees 0 provider calls after pause). | APPROVED PROPOSAL |
| **RISK-014** | Infrastructure| **Database Corruption or Migration Failure**<br>Schema migration fails midway during deployment, leaving tables in an inconsistent state. | 2 | 4 | **8 (Medium)** | Transactional DDL migrations, automated migration rollback scripts, pre-migration automated backup. | Step 22, 57 | Low (Standard transactional migration tooling). | APPROVED PROPOSAL |
| **RISK-015** | Infrastructure| **Database Backup Compromise**<br>Unencrypted automated database dumps leaked or accessed by unauthorized party. | 1 | 5 | **5 (Medium)** | Automated backups encrypted at rest with separate KMS key, strict IAM bucket permissions, zero public read. | Step 57 | Low (Standard cloud storage AES-256 encryption). | APPROVED PROPOSAL |
| **RISK-016** | Operational | **Disaster Recovery / Restore Failure**<br>Backups exist but fail to restore cleanly due to missing dependencies or unverified dumps. | 2 | 4 | **8 (Medium)** | Documented recovery runbook, scheduled quarterly test restore into staging environment. | Step 57, 59 | Low (Verified restore procedure). | APPROVED PROPOSAL |
| **RISK-017** | Privacy | **User Data Deletion Failure (Orphaned Records)**<br>Task deleted in UI, but foreign records remain in database or Redis, leaking data. | 3 | 3 | **9 (Medium)** | SEC-033 (PostgreSQL `ON DELETE CASCADE` foreign keys and atomic BullMQ repeatable job purge). | Step 24, 48 | Low (Relational integrity enforces immediate purge). | APPROVED PROPOSAL |
| **RISK-018** | Supply Chain | **Dependency Supply-Chain Compromise**<br>Malicious package introduced via npm supply-chain attack (`node_modules`). | 2 | 4 | **8 (Medium)** | Strict lockfile enforcement (`package-lock.json`), automated `npm audit` / Dependabot in CI, pinned versions. | Step 7, 55 | Medium (Inherent ecosystem risk; mitigated by minimal dependencies). | APPROVED PROPOSAL |
| **RISK-019** | Security | **Malicious Extracted HTML (Stored XSS)**<br>Webpage contains `<script>` payloads that execute in user browser when report is viewed. | 3 | 4 | **12 (High)** *(Override)* | SEC-021 (DOMPurify sanitization of markdown/excerpts), SEC-022 (Strict Content Security Policy). | Step 7, 15 | Low (No unescaped HTML rendered; CSP blocks inline execution). | APPROVED PROPOSAL |
| **RISK-020** | Security | **Unauthorized Data Export**<br>Attacker accesses or triggers bulk export of research tasks without ownership rights. | 2 | 4 | **8 (Medium)** | SEC-007 (Server-side ownership verification on export endpoints), SEC-025 (Safe filenames). | Step 24, 49 | Low (Direct owner check strictly enforced). | APPROVED PROPOSAL |
| **RISK-021** | Security | **Information Leakage in Server Logs**<br>Unsanitized URLs or error objects print user queries or API tokens to log streams. | 3 | 3 | **9 (Medium)** | SEC-003 (Structured logger with regex-based token and key redaction). | Step 9 | Low (Redaction middleware filters all console output). | APPROVED PROPOSAL |
| **RISK-022** | Infrastructure| **Excessive Worker Resource Usage (OOM / CPU)**<br>Complex DOM parsing of massive web pages causes Node.js heap exhaustion. | 3 | 3 | **9 (Medium)** | SEC-014 (5MB max response limit), SEC-029 (Worker process max-old-space-size=1024MB and auto-restart). | Step 34, 43 | Low (Oversized streams aborted before parsing). | APPROVED PROPOSAL |
| **RISK-023** | Quality | **Notification Misdelivery or Spamming**<br>Flapping price values trigger dozens of false-positive change alerts to the user. | 3 | 2 | **6 (Medium)** | Change threshold filtering (minimum 2% price change required), alert debouncing (max 1 alert per 6h). | Step 48, 50 | Low (Dampening logic prevents notification storms). | APPROVED PROPOSAL |
| **RISK-024** | Operational | **Weak Staging / Production Separation**<br>Development or staging environment accidentally points to production database or queue. | 2 | 4 | **8 (Medium)** | Distinct environment variables per tier, isolated database instances, separate Redis namespaces. | Step 9, 58 | Low (Isolated infrastructure configs verified by CI). | APPROVED PROPOSAL |
| **RISK-025** | Operational | **Incomplete Incident Detection and Silent Failures**<br>Scraper fails silently for days without alerting operators or users. | 3 | 3 | **9 (Medium)** | Structured error logging, health check probe (`GET /api/health`), task failure state tracking in UI. | Step 9, 57 | Low (Every failed run records explicit status and error code). | APPROVED PROPOSAL |
| **RISK-026** | Operational | **Lack of Fast Rollback Procedure**<br>Bad release deployed to production cannot be cleanly reverted, prolonging outage. | 2 | 4 | **8 (Medium)** | Containerized immutable releases, backward-compatible database migrations, documented Git tag rollback. | Step 57, 59 | Low (Standard container deployment rollbacks). | APPROVED PROPOSAL |

---

## 3. Risk Summary by Category

| Category | Total Identified | Critical (16-25) | High (10-15) | Medium (5-9) | Low (1-4) |
|---|---|---|---|---|---|
| **Security** | 8 | 2 | 4 | 2 | 0 |
| **AI / Model Safety** | 1 | 1 | 0 | 0 | 0 |
| **Provider / External** | 2 | 0 | 2 | 0 | 0 |
| **Operational / Queue** | 6 | 0 | 2 | 4 | 0 |
| **Quality / Integrity** | 3 | 0 | 1 | 2 | 0 |
| **Financial / Abuse** | 1 | 0 | 1 | 0 | 0 |
| **Infrastructure / DevOps** | 5 | 0 | 0 | 5 | 0 |
| **TOTAL** | **26** | **3** | **10** | **13** | **0** |

*Note: With mandatory overrides applied, 3 risks are rated Critical and 10 risks are rated High.*

---

## 4. Release Blocker Protocol

Prior to tagging Release Candidate 1.0 (Step 60), the following conditions must be satisfied:
1. **Zero Open Critical Risks:** All 3 Critical risks (`RISK-001`, `RISK-003`, `RISK-005`) must have their proposed mitigations implemented and verified via automated test suites.
2. **Zero Unmitigated High Risks:** All 10 High risks must have functional mitigations active and passing integration tests.
3. **Formal Approval of Residual Risks:** Any remaining Medium residual risks must be reviewed and accepted by project leadership in `DECISION_REGISTER.md`.
