# VerityScout AI — Security Source Register
**Document Version:** 1.0.0-FROZEN  
**Phase:** Phase 1 (Requirements, Research, and Feasibility) — Step 4 of 60  
**Status:** Security Baseline Reference Register  
**Research Date:** October 30, 2026  
**Related Documents:** [Threat Model](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/docs/security/THREAT_MODEL.md), [Security Requirements](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/docs/security/SECURITY_REQUIREMENTS.md)

---

## 1. Overview & Source Selection Rationale

This register documents authoritative external security standards, architectural guides, threat models, and vulnerability defense cheat sheets utilized to establish the VerityScout AI security architecture. Each source is identified with its publishing authority, access date, specific section applied, and the exact VerityScout AI component it governs.

---

## 2. Authoritative Security Standards Register

| Source ID | Document Title & URL | Publisher / Standard | Access Date | Relevant Section / Guidance | VerityScout AI Component Application | Evidence Type |
| :--- | :--- | :--- | :---: | :--- | :--- | :---: |
| **SRC-SEC-001** | **OWASP ASVS v4.0.3**<br>`https://owasp.org/www-project-application-security-verification-standard/` | OWASP Foundation | 2026-10-30 | V2 (Authentication), V3 (Session Management), V4 (Access Control), V5 (Validation/Sanitization), V8 (Data Protection) | Entire Full-Stack Architecture, Next.js API, PostgreSQL RLS | Documented Standard |
| **SRC-SEC-002** | **OWASP Top 10:2021**<br>`https://owasp.org/www-project-top-ten/` | OWASP Foundation | 2026-10-30 | A01: Broken Access Control, A02: Cryptographic Failures, A03: Injection, A07: Identification & Authentication, A10: SSRF | Next.js API route handlers, database queries, client session management | Documented Standard |
| **SRC-SEC-003** | **OWASP API Security Top 10 (2023)**<br>`https://owasp.org/www-project-api-security/` | OWASP Foundation | 2026-10-30 | API1: BOLA (Broken Object Level Authorization), API2: Broken Authentication, API3: BOPLA (Property Level Authorization), API4: Unrestricted Resource Consumption, API7: SSRF | Application REST API endpoints, task cancellation endpoints, export handlers | Documented Standard |
| **SRC-SEC-004** | **OWASP SSRF Prevention Cheat Sheet**<br>`https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html` | OWASP Foundation | 2026-10-30 | Defense-in-depth URL parsing, pre-request DNS resolution, IP address denylisting (IPv4/IPv6 private & link-local), disabling dangerous schemes, enforcing port whitelist (80/443), redirect inspection | Outbound Fetcher, Extraction Proxy, Direct HTTP Scraper | Documented Standard |
| **SRC-SEC-005** | **OWASP XSS Prevention Cheat Sheet**<br>`https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html` | OWASP Foundation | 2026-10-30 | Context-aware HTML escaping, DOMPurify sanitization, preventing `javascript:` URI execution in citation links, Content Security Policy (CSP) configuration | React frontend, evidence excerpt rendering, Markdown preview components | Documented Standard |
| **SRC-SEC-006** | **OWASP Secrets Management Cheat Sheet**<br>`https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html` | OWASP Foundation | 2026-10-30 | Zero secrets in client-side code, environment-variable isolation, encryption at rest for user-supplied provider keys, automatic logging redaction, key lifecycle (rotation/revocation) | Multi-provider settings vault, Next.js environment configurations | Documented Standard |
| **SRC-SEC-007** | **OWASP Logging Cheat Sheet**<br>`https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html` | OWASP Foundation | 2026-10-30 | Automated log sanitization, preventing sensitive data leakage (tokens, passwords, PII) in stdout and error traces, structured JSON logging with correlation IDs | Winston/Pino logger, BullMQ worker error handlers | Documented Standard |
| **SRC-SEC-008** | **NIST SP 800-218: Secure Software Development Framework (SSDF)**<br>`https://csrc.nist.gov/Projects/ssdf` | NIST | 2026-10-30 | PW.1 (Protect Software), PW.2 (Mitigate Vulnerabilities), RV.1 (Verify Code), PO.3 (Follow Least Privilege) | Entire SDLC, automated CI secret scanning, dependency vulnerability audit | Documented Standard |
| **SRC-SEC-009** | **Next.js Security & Deployment Guidance**<br>`https://nextjs.org/docs` | Vercel | 2026-10-30 | Server Actions / Route Handlers authentication boundaries, `NEXT_PUBLIC_*` prefix isolation, Content Security Policy headers, preventing server component data leakage | Frontend / Backend API layer | Documented Guidance |
| **SRC-SEC-010** | **Supabase Security Best Practices**<br>`https://supabase.com/docs/guides/security` | Supabase | 2026-10-30 | Row Level Security (RLS) enforcement, isolating `anon` vs `service_role` keys, database connection pooling security, encrypted storage buckets | PostgreSQL database, session auth, persistence layer | Documented Guidance |
| **SRC-SEC-011** | **BullMQ Security, Sandboxing & Redis Isolation**<br>`https://docs.bullmq.io/` | Taskforce.sh | 2026-10-30 | Worker process sandboxing, TLS/SSL connection to Redis, preventing job payload tampering, idempotent job processing, dead-letter queue isolation | Background research worker, scheduling queue | Documented Guidance |
| **SRC-SEC-012** | **OWASP Top 10 for Large Language Model Applications (2025)**<br>`https://owasp.org/www-project-top-10-for-large-language-model-applications/` | OWASP Foundation | 2026-10-30 | LLM01: Prompt Injection (Direct & Indirect), LLM02: Insecure Output Handling, LLM06: Excessive Agency, LLM07: System Prompt Leakage | AI model orchestrator, query planner, structured extraction verifier | Documented Standard |

---

## 3. Engineering Interpretations & Component Traceability

1. **SSRF Defense (`SRC-SEC-004`):** In VerityScout AI, the research worker dynamically fetches URLs discovered from search engine APIs. Because these URLs originate from third parties, they represent untrusted input. The OWASP SSRF prevention rules dictate that URL string validation alone is insufficient; DNS resolution must be performed prior to socket creation, and resolved IP addresses must be evaluated against private, loopback, link-local, and multicast CIDR ranges.
2. **Indirect Prompt Injection (`SRC-SEC-012`):** VerityScout AI feeds scraped web text into LLMs for attribute extraction. Adversarial pages can embed malicious instructions (`FIX-INJECT-001`). The OWASP LLM guidance dictates strict delimiter encapsulation (XML tags), system instruction immutability, and deterministic programmatic post-validation on all extracted attributes.
3. **Queue Payload Hardening (`SRC-SEC-011`):** BullMQ jobs must not transport raw provider API keys in job data payloads stored in Redis. Jobs must store only resource UUIDs (`runId`, `taskId`), forcing the worker to load encrypted credentials within its own secured memory space.

---
*End of Security Source Register — VerityScout AI*
