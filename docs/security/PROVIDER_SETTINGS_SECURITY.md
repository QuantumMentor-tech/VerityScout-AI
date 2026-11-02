# AI Provider Settings and Credential Security Architecture

## 1. Scope and Objective

This specification details the security controls, threat mitigations, and secret lifecycle governing Step 26: **AI Provider Settings CRUD, Secure Credential Configuration UI, and Provider Connection Tests**.

---

## 2. Threat Analysis & Mitigations

| Threat ID | Threat Description | Severity | Mitigation Strategy in Step 26 |
| :--- | :--- | :--- | :--- |
| **THREAT-01** | **Shoulder Surfing / Client Secret Exposure** (API key visible on screen or in DOM after saving). | High | Password-type input (`type="password"`) with zero prefill of stored credentials. Plaintext key is cleared from client state immediately following successful save. Only sanitized masks (`sk-...4321`) are ever returned in DTOs. |
| **THREAT-02** | **Cross-Tenant Credential Tampering / Hijacking** (User B accesses or deletes User A's API key). | Critical | Dual-layer authorization: server session resolution via `requireAuthenticatedCaller()`, parameter validation scoping all vault queries to verified `user_id`, and PostgreSQL Row-Level Security isolation. |
| **THREAT-03** | **Server-Side Request Forgery (SSRF)** (Attacker alters test endpoint to probe AWS metadata `169.254.169.254` or internal LAN). | Critical | Strict hardcoded destination allowlist (`APPROVED_PROVIDER_TEST_ENDPOINTS`). URLs validated before dispatch; arbitrary endpoints or non-HTTPS schemes are rejected. |
| **THREAT-04** | **Token Exfiltration via Redirects** (Compromised provider or MITM issues 302 redirect to attacker-controlled server). | High | Bounded `fetch` request uses `redirect: 'manual'`, strictly forbidding automatic token-forwarding across HTTP redirects. |
| **THREAT-05** | **Plaintext Storage in PostgreSQL** (Direct database write leaks unencrypted API keys). | Critical | All credentials must pass through `ProviderCredentialService.storeCredential()`, which enforces authenticated AES-256-GCM encryption with fresh 96-bit IVs and key versioning before persisting to PostgreSQL. |
| **THREAT-06** | **Credential Leakage in Server Logs / APM** (API key logged during error handling or probe). | High | Structured logging utility (`logger`) masks sensitive payloads. API keys are never passed as log context. Error normalization catches provider responses and strips raw authorization headers. |
| **THREAT-07** | **Accidental AI Inference Billing** (Connection test consumes paid tokens or triggers model generation). | Medium | Tests strictly use official non-inference metadata endpoints (`/v1/models`, `/v1/auth/key`). Zero LLM prompt completions or token generation requests are executed. |

---

## 3. Server-Only Secret Access Boundary

```
[Browser UI]
     │  (POST /api/settings/providers: transmits apiKey over TLS once)
     ▼
[Next.js Server Route Handler]
     │
     ▼
[ProviderCredentialService] (server-only)
     │  (AES-256-GCM authenticated encryption with active key version)
     ▼
[PostgreSQL provider_vault_secrets] (stores ciphertext, IV, auth_tag, key_version)
```

- Plaintext API keys exist only in ephemeral server memory during encryption and probe execution.
- `getDecryptedCredential(userId, providerId)` is tagged as a **RESTRICTED INTERNAL METHOD** and is prohibited from being imported or referenced in UI components, client DTOs, or browser route responses.

---

## 4. Residual Risks & Future Roadmap Controls

1. **Step 27 Abstraction Alignment:** The narrow connection tester seam implemented in Step 26 will be migrated cleanly to the common provider abstraction layer in Step 27 without architectural breakage.
2. **Key Rotation Lifecycle:** Automated key rotation functions were implemented in Step 25 (`rotateCredentialKey`) and remain available for scheduled administrative key-version migration.
3. **Upstream Key Revocation:** Deleting a credential from VerityScout AI deletes the local encrypted vault secret; it does not revoke the API key in the provider's external developer portal. Clear user guidance is rendered in the deletion confirmation modal.
