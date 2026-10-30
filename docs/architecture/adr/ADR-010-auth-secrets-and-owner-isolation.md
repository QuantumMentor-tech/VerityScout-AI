# ADR-010: Authentication, Authorization, Secret Storage & Owner Isolation

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Security Architect  
**Related Requirements:** UR-013, UR-018, UR-019, UR-020, NFR-007  
**Traceability:** Implements [SEC-001](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-001-server-side-secret-isolation), [SEC-002](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-002-encrypted-storage-of-user-supplied-provider-keys), [SEC-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-006-cryptographically-enforced-session-lifecycle), [SEC-007](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-007-server-side-object-level-ownership-enforcement-bola-prevention), [SEC-008](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-008-defense-in-depth-database-row-level-security-rls)

---

## 1. Context and Problem Statement

VerityScout AI handles sensitive data: user research interests, commercial queries, proprietary product constraints, and third-party AI provider API keys (OpenAI, OpenRouter, NVIDIA NIM, Tavily). The platform must guarantee absolute multi-tenant cross-user isolation, eliminate credential exposure in client runtimes or server logs, and secure the session lifecycle.

## 2. Considered Alternatives

1. **Alternative 1: Secure Cookie Sessions + Dual-Layer Authorization (API + PostgreSQL RLS) + AES-256-GCM Vault** *(Chosen)*
2. **Alternative 2: Client-Side JWT Stored in Browser LocalStorage**
3. **Alternative 3: Single Global Admin Key for All Users without Isolation**

## 3. Decision Outcome & Chosen Approach

We adopt a **zero-trust, dual-layer defense-in-depth authorization and secret management architecture**:
1. **Cryptographically Signed Session Cookies:** Sessions managed via cryptographically signed HTTP cookies configured with `HttpOnly`, `Secure`, `SameSite=Lax`, and 7-day sliding expiration (`SEC-006`). JavaScript cannot access session tokens.
2. **Dual-Layer Authorization:**
   - **Layer 1 (Application API):** Every endpoint resolving user resources executes an explicit ownership check: `WHERE id = :id AND user_id = :authUserId` (`SEC-007`).
   - **Layer 2 (Database RLS):** PostgreSQL Row Level Security enabled on all user-owned tables, enforcing `user_id = auth.uid()` (`SEC-008`).
3. **Encrypted Provider Key Vault:**
   - User-supplied API keys (BYOK) are stored in PostgreSQL encrypted with **AES-256-GCM** using a server-managed master key (`VAULT_MASTER_KEY`).
   - Ciphertext, IV, and auth tag are segregated; keys are decrypted only in ephemeral Node.js memory during the active HTTP request to the external provider (`SEC-002`, `VS-THR-001`).
   - Settings UI and API GET routes return only masked previews (`sk-...4a89`); raw keys are never returned (`SEC-001`).
4. **Cascading Erasure:** Deleting a task executes an atomic cascade across all related runs, evidence, and queued BullMQ jobs (`SEC-033`).

## 4. Consequences and Trade-offs

- **Benefits:**
  - Complete protection against BOLA/IDOR: a compromised client token or enumerated UUID cannot read another tenant's records.
  - Database dumps and backup compromises do not expose usable plaintext API keys.
- **Trade-offs:**
  - Requires managing a secure server master key (`VAULT_MASTER_KEY`) in the deployment environment.

## 5. Security & Privacy Implications

- Eliminates top OWASP threats: Broken Access Control (A01:2021) and Cryptographic Failures (A02:2021).
- Outbound logging streams redact all recognized API key patterns (`SEC-003`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 9 (Env Secrets), Step 23 (Auth), Step 24 (Authorization & RLS), Step 25 (Vault Storage).
- **Validation Criteria:** Integration test suite asserting HTTP 404/403 across 100% of multi-tenant endpoints and verifying raw database columns contain zero plaintext keys (`SEC-TEST-002`, `SEC-TEST-004`).
