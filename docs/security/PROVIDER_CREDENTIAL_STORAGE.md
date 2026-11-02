# Provider Credential Storage, Encryption Boundaries, and Secret Access Controls

**Document Identifier:** SEC-VAULT-001  
**Status:** Approved & Enforced (Step 25)  
**Security Level:** High / Critical Secret Boundary  
**Governing Documents:** ADR-010, SEC-001, SEC-002, VS-THR-001, VS-THR-003  

---

## 1. Executive Summary & Purpose

VerityScout AI enables users to configure their own API credentials for third-party AI synthesis and search providers (Bring-Your-Own-Key / BYOK). Because third-party API keys can grant access to billable compute quotas, private models, and user data, **VerityScout AI treats provider API credentials as a high-risk security boundary**.

In strict accordance with Step 25:
1. **Zero Plaintext at Rest:** Raw API keys are **never stored as plaintext** in any ordinary database field, log file, audit trail, or configuration record.
2. **Authenticated Encryption (AES-256-GCM):** Credentials are encrypted using Node.js authenticated encryption with 256-bit keys, unique 12-byte random initialization vectors (nonces), 16-byte authentication tags, and Associated Authenticated Data (AAD) binding.
3. **Segregated Key Management:** Master encryption keys are managed strictly outside PostgreSQL (via server runtime environment) and are never stored alongside ciphertext.
4. **Metadata Segregation:** Non-secret metadata (`has_credential`, `credential_preview`) is stored separately from the encrypted vault payload.
5. **Restricted Internal Decryption:** Decrypted plaintext is accessible only to authorized server-side provider adapters during outbound execution and is **never returned to browser code, client bundles, or public API responses**.

---

## 2. Approved Provider Ecosystem

The current baseline supported providers for VerityScout AI are:
- **OpenAI (`openai`):** Primary synthesis and reasoning LLM provider.
- **OpenRouter (`openrouter`):** Aggregator for open-source and proprietary foundation models.
- **NVIDIA NIM (`nim`):** Accelerated microservices provider for specialized inference.
- **Tavily (`tavily`), Exa (`exa`), Firecrawl (`firecrawl`):** Approved search and web extraction providers.

Any attempt to store or configure credentials for an unsupported provider is rejected with `UnsupportedProviderError`.

---

## 3. Storage Model & Database Representation

The physical storage architecture cleanly segregates non-secret metadata from encrypted vault payloads:

```
┌────────────────────────────────────────────────────────┐
│ provider_configurations Table (Non-Secret Metadata)   │
├────────────────────────────────────────────────────────┤
│ id (UUIDv4)                                            │
│ user_id (UUIDv4)                                       │
│ provider_id (VARCHAR: 'openai', 'openrouter', 'nim')   │
│ is_enabled (BOOLEAN)                                   │
│ selected_model_id (VARCHAR: 'gpt-4o', etc.)            │
│ custom_base_url (TEXT)                                 │
│ has_credential (BOOLEAN: TRUE / FALSE)                 │
│ credential_preview (VARCHAR: 'sk-...cdef')             │
│ last_connection_test_status (VARCHAR: SUCCESS/FAILED)  │
│ created_at / updated_at                                │
└────────────────────────────────────────────────────────┘
                           │
                           │ 1-to-1 Isolated Reference
                           ▼
┌────────────────────────────────────────────────────────┐
│ provider_vault_secrets Table (Encrypted Secret Vault)  │
├────────────────────────────────────────────────────────┤
│ id (UUIDv4)                                            │
│ user_id (UUIDv4)                                       │
│ provider_id (VARCHAR: 'openai', 'openrouter', 'nim')   │
│ encrypted_blob (BYTEA: AES-256-GCM Ciphertext)         │
│ initialization_vector (BYTEA: 12-Byte Nonce)           │
│ auth_tag (BYTEA: 16-Byte GCM Authentication Tag)       │
│ key_version (INTEGER: e.g. 1, 2)                       │
│ created_at / updated_at                                │
└────────────────────────────────────────────────────────┘
```

- **Row-Level Security:** Both tables are protected by fail-closed RLS policies (`rls_provider_vault_tenant` and `rls_provider_configs_tenant`) enforcing `user_id = app.current_user_id`.
- **Integrity Constraints:** Database-level length constraints enforce `octet_length(initialization_vector) = 12` and `octet_length(auth_tag) = 16`.
- **Unique Constraint:** `uq_provider_vault_user_provider (user_id, provider_id)` guarantees at most one active secret per provider per user tenant.

---

## 4. Encryption Architecture & Boundary

### 4.1 Cryptographic Primitives
- **Cipher:** `aes-256-gcm` (NIST SP 800-38D / RFC 5116 authenticated encryption).
- **Key Length:** Exactly 32 bytes (256 bits).
- **Nonce (IV):** Exactly 12 bytes (96 bits) generated cryptographically via `crypto.randomBytes(12)`. A fresh, unique nonce is generated on every single encryption operation, ensuring probabilistic ciphertext even for identical inputs.
- **Authentication Tag:** Exactly 16 bytes (128 bits) extracted from the GCM cipher. Verified strictly before decipher completion.

### 4.2 Associated Authenticated Data (AAD) Context Binding
To prevent ciphertext relocation attacks—where an attacker might copy another user's encrypted blob or move a secret from one provider to another—the encryption engine cryptographically binds context metadata:
```typescript
const aad = Buffer.from(`verityscout:vault:v1:${userId}:${providerId}:${keyVersion}`, 'utf8');
cipher.setAAD(aad);
```
If an attacker attempts to decrypt a ciphertext under a different `userId`, different `providerId`, or mismatched `keyVersion`, GCM tag verification fails immediately with `VaultDecryptionError`.

---

## 5. Credential Lifecycle & Access Controls

### 5.1 Storage & Replacement
1. Authenticated user submits an API key through server-side boundary.
2. `ProviderCredentialService.storeCredential()` validates format (max 1024 chars, non-empty, no control chars).
3. Plaintext is encrypted with the active version key.
4. Safe preview mask is generated: `sk-...4a89` for OpenAI, `tvly-...7890` for Tavily, or `...4a89`. Short strings (<8 chars) yield `[CONFIGURED]`.
5. Atomic transaction persists ciphertext in `provider_vault_secrets` and updates `has_credential = true` and `credential_preview` in `provider_configurations`.
6. Return value contains only non-secret metadata.

### 5.2 Restricted Internal Decryption
- **Internal Only:** Accessible exclusively via `ProviderCredentialService.getDecryptedCredential()`.
- **Outbound Dispatch:** Reserved solely for future Phase 6+ AI and search adapters to populate the `Authorization: Bearer <token>` header in outbound HTTP requests.
- **Memory Lifetime:** Plaintext lives ephemerally in Node.js memory only for the duration of the outbound call. Never cached, never logged, never returned in DTOs.

### 5.3 Safe Deletion
1. `ProviderCredentialService.deleteCredential()` executes an atomic database transaction.
2. Removes the record from `provider_vault_secrets`.
3. Updates `provider_configurations` setting `has_credential = false` and `credential_preview = null`.

### 5.4 Key Rotation
- Supports zero-downtime key rotation via `rotateCredentialKey()`.
- Decrypts historical ciphertext with the source key version and re-encrypts with a fresh nonce under the target key version.

---

## 6. Audit Logging and Anti-Leakage Controls

1. **Systematic Redaction:** Server structured logger redacts any string matching `sk-[a-zA-Z0-9_-]{20,}` or keys named `apiKey`, `secret`, `authorization`, `password`, `token`.
2. **Safe Operational Events:** Security audit logs emit only non-secret operational facts:
   - `AUTH_PROVIDER_CREDENTIAL_STORED`: Emits `callerUserId`, `providerId`, `keyVersion`.
   - `AUTH_PROVIDER_CREDENTIAL_DECRYPTED`: Emits `callerUserId`, `providerId`, `keyVersion`.
   - `AUTH_PROVIDER_CREDENTIAL_DELETED`: Emits `callerUserId`, `providerId`, `deleted: true/false`.
   - `AUTH_PROVIDER_CREDENTIAL_ROTATED`: Emits `callerUserId`, `providerId`, `sourceKeyVersion`, `destinationKeyVersion`.

---

## 7. Operational Limitations & Boundaries

1. **Host Memory Compromise:** In an application-layer encryption model, an attacker with full root access or arbitrary code execution within the Node.js process could inspect server memory during active encryption/decryption. This threat model is mitigated by process isolation and environment segregation.
2. **External Provider Revocation:** Deleting or rotating a credential inside VerityScout AI removes it from the local database vault, but does **not** revoke the key at OpenAI, OpenRouter, or NVIDIA. Users must revoke compromised keys directly in their provider dashboards.
3. **Step 26 Boundary:** Step 25 implements the storage, cryptographic, and retrieval foundation only. The provider settings user interface, connection test probes, and model selection belong to Step 26.
