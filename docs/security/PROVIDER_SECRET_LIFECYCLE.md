# Provider Secret Lifecycle and Operational Incident Procedures

**Document Identifier:** SEC-LIFECYCLE-001  
**Status:** Approved & Enforced (Step 25)  
**Security Level:** High / Operational Security  
**Governing Documents:** ADR-010, SEC-001, SEC-002, SEC-003, SEC-004  

---

## 1. Provider Secret Lifecycle Overview

The following state machine governs all user-supplied provider API credentials in VerityScout AI:

```
    ┌───────────────────────────┐
    │     Unconfigured State    │
    │  has_credential: FALSE    │
    └─────────────┬─────────────┘
                  │
                  │ User submits raw API key via POST
                  │ - Encrypt with AES-256-GCM
                  │ - Generate safe mask (sk-...a1b2)
                  ▼
    ┌───────────────────────────┐
    │     Configured State      │◄───────────────────────────┐
    │  has_credential: TRUE     │                            │
    │  ciphertext in vault      │                            │ Key rotation (Step 25)
    └──────┬─────────────┬──────┘                            │ Re-encrypt under
           │             │                                   │ new master key
           │             │ Internal dispatch (Phase 6+)      │
           │             ├───────────────────────────────────┘
           │             ▼
           │     ┌───────────────────────────┐
           │     │ Ephemeral Node.js Memory  │
           │     │ Decrypted Bearer token    │
           │     │ Sent to OpenAI/NIM/etc.   │
           │     │ Immediately garbage coll. │
           │     └───────────────────────────┘
           │
           │ User deletes credential / changes key
           ▼
    ┌───────────────────────────┐
    │     Erased / Reset State  │
    │  Vault row deleted        │
    │  has_credential: FALSE    │
    └───────────────────────────┘
```

---

## 2. Operational Procedures by Lifecycle Phase

### 2.1 Credential Creation and Replacement
- **Entry Point:** Server Action / API Handler in Step 26.
- **Validation:** Credential length (1 to 1024 characters), absence of illegal ASCII control characters (`[\x00-\x1F\x7F]`), and provider whitelist enforcement (`openai`, `openrouter`, `nim`, `tavily`, `exa`, `firecrawl`).
- **Atomic Persistence:** Ciphertext is inserted into `provider_vault_secrets` while `provider_configurations.has_credential` and `credential_preview` are updated in the same transaction.

### 2.2 Authorized Internal Retrieval
- **Rule of Least Privilege:** Plaintext credentials are **never exposed to client-side code** or serialized into JSON responses.
- **Consumption:** When a research run begins, the research engine requests the token via `ProviderCredentialService.getDecryptedCredential(userId, providerId)`.
- **Scope:** The token is placed directly into the outbound HTTPS request headers (`Authorization: Bearer <token>`) and discarded immediately upon completion.

### 2.3 Safe Metadata Presentation (No Secret Disclosure)
- API responses querying provider settings return:
  ```json
  {
    "providerId": "openai",
    "hasCredential": true,
    "credentialPreview": "sk-...1234",
    "lastConnectionTestStatus": "SUCCESS"
  }
  ```
- The original secret cannot be reconstructed from the preview.

### 2.4 Credential Removal vs. Upstream Revocation
- **Application-Side Deletion:** Calling `ProviderCredentialService.deleteCredential()` removes the database ciphertext and resets configuration flags.
- **Critical Distinction:** Deleting a credential inside VerityScout AI **does not revoke the key at OpenAI, OpenRouter, or NVIDIA**. If a credential was exposed or compromised outside VerityScout AI, the user must explicitly log into the provider's developer console and revoke the key.

---

## 3. Incident Response: Suspected Key Exposure

If an encryption key or user API credential is suspected of compromise:

1. **Host Master Key Exposure (`VAULT_MASTER_KEY`):**
   - Immediately generate a new 256-bit master key (`Key_v2`).
   - Place `Key_v2` as `VAULT_MASTER_KEY` and configure `VAULT_KEYRING` with the compromised key to permit automated re-encryption.
   - Run `ProviderCredentialService.rotateCredentialKey()` across all configured user credentials.
   - Once all rows are re-encrypted, immediately destroy the compromised key from the keyring.
2. **User Provider API Key Exposure:**
   - Immediately delete the credential from the VerityScout AI vault via `deleteCredential()`.
   - Advise the user to immediately revoke the exposed token within the upstream provider's portal (e.g. `platform.openai.com`).
   - Guide the user to generate and configure a fresh API key.
3. **Audit Log Inspection:**
   - Query application logs for `AUTH_PROVIDER_CREDENTIAL_*` events to determine if unauthorized access attempts occurred.
