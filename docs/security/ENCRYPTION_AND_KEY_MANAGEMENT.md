# Encryption Architecture and Key Management Specification

**Document Identifier:** SEC-KEY-001  
**Status:** Approved & Enforced (Step 25)  
**Security Level:** High / Cryptographic Controls  
**Governing Documents:** ADR-010, SEC-001, SEC-002, VS-THR-001, VS-THR-003  

---

## 1. Cryptographic Architecture

VerityScout AI uses **authenticated symmetric encryption** based on the **AES-256-GCM** (Galois/Counter Mode) standard as defined in NIST SP 800-38D.

### 1.1 Cryptographic Parameters
- **Algorithm:** `aes-256-gcm`
- **Key Length:** 32 bytes (256 bits).
- **Initialization Vector (IV / Nonce):** 12 bytes (96 bits) cryptographically random generated per encryption via `node:crypto.randomBytes(12)`.
- **Authentication Tag:** 16 bytes (128 bits) computed over ciphertext and Associated Authenticated Data (AAD).
- **Associated Authenticated Data (AAD):** `verityscout:vault:v1:<userId>:<providerId>:<keyVersion>`

### 1.2 Separation of Duties & Cryptographic Boundaries
- **Database Boundary:** PostgreSQL stores only the encrypted payload: `encrypted_blob`, `initialization_vector`, `auth_tag`, and `key_version`. No keys or derivation seeds are persisted in PostgreSQL.
- **Application Boundary:** The 32-byte master key resides strictly in server-side process memory supplied via secure runtime environment configuration (`VAULT_MASTER_KEY`).
- **Client Boundary:** Browser clients never receive encryption keys, initialization vectors, authentication tags, or decrypted secrets.

---

## 2. Key Provisioning and Configuration

### 2.1 Server Environment Variables
All key configurations are strictly server-only (`import 'server-only'`):
- `VAULT_MASTER_KEY`: 64-character hexadecimal string representing the active 256-bit AES master key.
- `VAULT_ACTIVE_KEY_VERSION`: Integer indicating the current active version used for new encryptions (default: `1`).
- `VAULT_KEYRING`: Optional JSON string mapping historical key versions to 64-character hex strings:
  ```json
  {"1": "<64_hex_chars>", "2": "<64_hex_chars>"}
  ```

### 2.2 Local Development Key Provisioning
For local development, developers generate a cryptographically random 32-byte key via the following command:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
The resulting 64-character string is placed in `.env.local`:
```env
VAULT_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
VAULT_ACTIVE_KEY_VERSION=1
```
*Note: Never commit `.env.local` to version control.*

---

## 3. Key Versioning and Rotation Lifecycle

### 3.1 Versioned Keyring Resolution
1. Each row in `provider_vault_secrets` records its `key_version: INTEGER`.
2. Upon decryption, `VaultKeyManager.getKeyForVersion(row.key_version)` resolves the matching historical key from the keyring.
3. If an unconfigured key version is encountered, the system **fails closed** with `VaultKeyNotFoundError`. It never attempts fallback ciphers or insecure defaults.

### 3.2 Zero-Downtime Key Rotation Procedure
To rotate the master encryption key without system downtime or data loss:
1. **Stage 1 (Provision New Key):**
   - Generate new 256-bit key `Key_v2`.
   - Update deployment configuration:
     - `VAULT_MASTER_KEY=<Key_v2_hex>`
     - `VAULT_ACTIVE_KEY_VERSION=2`
     - `VAULT_KEYRING={"1": "<Key_v1_hex>", "2": "<Key_v2_hex>"}`
2. **Stage 2 (Re-Encryption):**
   - Execute controlled re-encryption via `ProviderCredentialService.rotateCredentialKey(userId, providerId, 2)`.
   - The engine reads the ciphertext using `Key_v1`, decrypts it in memory, and immediately encrypts it with a fresh random 12-byte IV using `Key_v2`.
   - The database record is updated with the new ciphertext, new IV, new auth tag, and `key_version = 2`.
3. **Stage 3 (Retirement):**
   - Once all rows have migrated to `key_version = 2`, `Key_v1` is safely retired and removed from `VAULT_KEYRING`.

---

## 4. Threat Model & Inherent Residual Risks

1. **Total Application Server Host Compromise:**
   - If an adversary achieves root execution within the Node.js application process, they can theoretically dump process memory and inspect active runtime environment variables.
   - *Mitigation:* In enterprise/cloud production, `VAULT_MASTER_KEY` should be sourced from an external Hardware Security Module (HSM) or dedicated KMS (AWS KMS, GCP Cloud KMS, HashiCorp Vault). Application-level encryption serves as primary defense-in-depth against database breaches, SQL injection, unauthorized database dumps, and untrusted storage volumes.
2. **Database Superuser Breach:**
   - A compromised database superuser account can read `provider_vault_secrets`, but cannot decrypt API keys without the application's external `VAULT_MASTER_KEY`.
3. **Lost Encryption Key:**
   - If all copies of a master key version are lost or deleted, the corresponding encrypted API credentials become mathematically unrecoverable. Users must re-enter their provider API keys.
