import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  encryptProviderSecret,
  decryptProviderSecret,
  generateCredentialPreview,
  buildVaultAAD,
  VaultDecryptionError,
  VaultInvalidKeyError,
  VaultCryptoError,
  VAULT_IV_LENGTH_BYTES,
  VAULT_AUTH_TAG_LENGTH_BYTES,
  VAULT_KEY_LENGTH_BYTES,
} from '@/server/crypto/provider-vault.crypto';

describe('Provider Vault Cryptographic Primitives (Step 25 / SEC-001, SEC-002, ADR-010)', () => {
  const masterKey = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES);
  const userA = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const userB = 'b1ffcd88-8d1c-3fe7-aa5c-5aa8ac270b22';
  const providerId = 'openai';
  const context = { userId: userA, providerId };
  const syntheticApiKey = 'sk-proj-CANARY-SUPER-SECRET-API-KEY-9999';

  describe('1. Authenticated Encryption & Decryption Roundtrip', () => {
    it('CRYPTO-001: Successfully encrypts and decrypts a synthetic API key', () => {
      const encrypted = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);

      expect(encrypted).toBeDefined();
      expect(encrypted.encryptedBlob).toBeInstanceOf(Buffer);
      expect(encrypted.initializationVector).toHaveLength(VAULT_IV_LENGTH_BYTES);
      expect(encrypted.authTag).toHaveLength(VAULT_AUTH_TAG_LENGTH_BYTES);
      expect(encrypted.keyVersion).toBe(1);

      // Decryption produces exact original string
      const decrypted = decryptProviderSecret(encrypted, context, masterKey);
      expect(decrypted).toBe(syntheticApiKey);
    });

    it('CRYPTO-002: Does not store or contain the plaintext secret within the encrypted blob', () => {
      const encrypted = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);
      const ciphertextUtf8 = encrypted.encryptedBlob.toString('utf8');

      expect(ciphertextUtf8).not.toContain(syntheticApiKey);
      expect(ciphertextUtf8).not.toContain('CANARY');
      expect(ciphertextUtf8).not.toContain('SUPER-SECRET');
    });

    it('CRYPTO-003: Fresh nonce generated on every encryption (probabilistic ciphertext)', () => {
      const enc1 = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);
      const enc2 = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);

      // Nonces must be distinct
      expect(enc1.initializationVector).not.toEqual(enc2.initializationVector);
      // Resulting ciphertexts must be distinct despite identical plaintext and key
      expect(enc1.encryptedBlob).not.toEqual(enc2.encryptedBlob);
      // Both decrypt back to the identical plaintext
      expect(decryptProviderSecret(enc1, context, masterKey)).toBe(syntheticApiKey);
      expect(decryptProviderSecret(enc2, context, masterKey)).toBe(syntheticApiKey);
    });
  });

  describe('2. Integrity & Anti-Tampering Verification', () => {
    it('CRYPTO-004: Rejects tampered ciphertext with VaultDecryptionError', () => {
      const encrypted = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);
      // Flip a bit in the ciphertext
      const tamperedBlob = Buffer.from(encrypted.encryptedBlob);
      tamperedBlob[0] = (tamperedBlob[0] ?? 0) ^ 0xff;

      const tamperedPayload = { ...encrypted, encryptedBlob: tamperedBlob };

      expect(() => {
        decryptProviderSecret(tamperedPayload, context, masterKey);
      }).toThrow(VaultDecryptionError);
    });

    it('CRYPTO-005: Rejects tampered authentication tag with VaultDecryptionError', () => {
      const encrypted = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);
      // Alter the authentication tag
      const tamperedTag = Buffer.from(encrypted.authTag);
      const lastIndex = tamperedTag.length - 1;
      tamperedTag[lastIndex] = (tamperedTag[lastIndex] ?? 0) ^ 0x01;

      const tamperedPayload = { ...encrypted, authTag: tamperedTag };

      expect(() => {
        decryptProviderSecret(tamperedPayload, context, masterKey);
      }).toThrow(VaultDecryptionError);
    });

    it('CRYPTO-006: Rejects decryption under incorrect key with VaultDecryptionError', () => {
      const wrongKey = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES);
      const encrypted = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);

      expect(() => {
        decryptProviderSecret(encrypted, context, wrongKey);
      }).toThrow(VaultDecryptionError);
    });
  });

  describe('3. Associated Authenticated Data (AAD) Binding & Tenant Isolation', () => {
    it('CRYPTO-007: Prevents cross-tenant ciphertext relocation (User B cannot decrypt User A ciphertext)', () => {
      const encrypted = encryptProviderSecret(syntheticApiKey, { userId: userA, providerId }, masterKey, 1);

      // Attempting to decrypt with User B context must fail due to AAD mismatch
      expect(() => {
        decryptProviderSecret(encrypted, { userId: userB, providerId }, masterKey);
      }).toThrow(VaultDecryptionError);
    });

    it('CRYPTO-008: Prevents cross-provider ciphertext relocation (cannot decrypt OpenAI key as NIM)', () => {
      const encrypted = encryptProviderSecret(syntheticApiKey, { userId: userA, providerId: 'openai' }, masterKey, 1);

      // Attempting to decrypt under provider 'nim' must fail
      expect(() => {
        decryptProviderSecret(encrypted, { userId: userA, providerId: 'nim' }, masterKey);
      }).toThrow(VaultDecryptionError);
    });

    it('CRYPTO-009: buildVaultAAD generates deterministic context buffer', () => {
      const aad1 = buildVaultAAD({ userId: userA, providerId: 'openrouter' }, 2);
      const aad2 = buildVaultAAD({ userId: userA, providerId: 'openrouter' }, 2);
      expect(aad1.toString()).toBe(`verityscout:vault:v1:${userA}:openrouter:2`);
      expect(aad1).toEqual(aad2);
    });
  });

  describe('4. Strict Parameter Length Validation', () => {
    it('CRYPTO-010: Rejects keys with invalid byte length', () => {
      const shortKey = Buffer.alloc(16); // 16 bytes instead of 32
      expect(() => {
        encryptProviderSecret(syntheticApiKey, context, shortKey, 1);
      }).toThrow(VaultInvalidKeyError);

      const validEncrypted = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);
      expect(() => {
        decryptProviderSecret(validEncrypted, context, shortKey);
      }).toThrow(VaultInvalidKeyError);
    });

    it('CRYPTO-011: Rejects malformed initialization vector or auth tag length', () => {
      const validEncrypted = encryptProviderSecret(syntheticApiKey, context, masterKey, 1);

      // Bad IV length
      const badIvPayload = { ...validEncrypted, initializationVector: Buffer.alloc(16) };
      expect(() => {
        decryptProviderSecret(badIvPayload, context, masterKey);
      }).toThrow(VaultDecryptionError);

      // Bad Auth Tag length
      const badTagPayload = { ...validEncrypted, authTag: Buffer.alloc(12) };
      expect(() => {
        decryptProviderSecret(badTagPayload, context, masterKey);
      }).toThrow(VaultDecryptionError);
    });

    it('CRYPTO-012: Rejects empty or invalid plaintext input', () => {
      expect(() => {
        encryptProviderSecret('', context, masterKey, 1);
      }).toThrow(VaultCryptoError);
    });
  });

  describe('5. Safe Credential Preview Generation', () => {
    it('CRYPTO-013: Correctly masks OpenAI and Anthropic key formats', () => {
      expect(generateCredentialPreview('sk-proj-1234567890abcdef')).toBe('sk-...cdef');
      expect(generateCredentialPreview('sk-ant-api03-abcdefghijklmn1234')).toBe('sk-...1234');
      expect(generateCredentialPreview('sk-1234567890abcdef')).toBe('sk-...cdef');
    });

    it('CRYPTO-014: Correctly masks Tavily and NVIDIA key formats', () => {
      expect(generateCredentialPreview('tvly-abcdef1234567890')).toBe('tvly-...7890');
      expect(generateCredentialPreview('nvapi-abcdef1234567890')).toBe('nvapi-...7890');
    });

    it('CRYPTO-015: Handles arbitrary tokens safely and guards short inputs', () => {
      expect(generateCredentialPreview('my-custom-provider-token-xyz')).toBe('...-xyz');
      // Very short input is masked completely to prevent leaking tiny test strings
      expect(generateCredentialPreview('short')).toBe('[CONFIGURED]');
      expect(generateCredentialPreview('')).toBe('[CONFIGURED]');
    });
  });
});
