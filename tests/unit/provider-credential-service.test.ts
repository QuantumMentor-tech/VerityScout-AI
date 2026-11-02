import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  ProviderCredentialService,
  UnsupportedProviderError,
  InvalidCredentialFormatError,
} from '@/server/services/provider-credential.service';
import { VaultKeyManager } from '@/server/crypto/key-manager';
import { ProviderVaultRepository } from '@/server/persistence/repositories/provider-vault.repository';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import { VAULT_KEY_LENGTH_BYTES } from '@/server/crypto/provider-vault.crypto';

describe('Provider Credential Storage Service (Step 25 / SEC-001, SEC-002, ADR-010)', () => {
  const userA = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const userB = 'b1ffcd88-8d1c-3fe7-aa5c-5aa8ac270b22';

  const hexKeyV1 = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES).toString('hex');
  const hexKeyV2 = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES).toString('hex');

  let keyManager: VaultKeyManager;
  let mockVaultRepo: ProviderVaultRepository;
  let mockConfigRepo: ProviderConfigRepository;
  let service: ProviderCredentialService;

  // In-memory fake database tables to test realistic persistence behavior
  let vaultTable: Map<string, any>;
  let configTable: Map<string, any>;

  const syntheticCanaryKey = 'sk-proj-CANARY-SUPER-SECRET-API-KEY-1234567890';

  beforeEach(() => {
    vaultTable = new Map();
    configTable = new Map();

    keyManager = new VaultKeyManager({
      activeVersion: 1,
      masterKeyHex: hexKeyV1,
      keyringHex: {
        1: hexKeyV1,
        2: hexKeyV2,
      },
    });

    mockVaultRepo = {
      storeSecret: vi.fn().mockImplementation(async (userId, providerId, payload, preview) => {
        const row = {
          id: 'vault-uuid-1',
          user_id: userId,
          provider_id: providerId,
          encrypted_blob: payload.encryptedBlob,
          initialization_vector: payload.initializationVector,
          auth_tag: payload.authTag,
          key_version: payload.keyVersion,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        vaultTable.set(`${userId}:${providerId}`, row);
        configTable.set(`${userId}:${providerId}`, {
          user_id: userId,
          provider_id: providerId,
          has_credential: true,
          credential_preview: preview,
        });
        return row;
      }),

      getSecret: vi.fn().mockImplementation(async (userId, providerId) => {
        return vaultTable.get(`${userId}:${providerId}`) ?? null;
      }),

      deleteSecret: vi.fn().mockImplementation(async (userId, providerId) => {
        const existed = vaultTable.delete(`${userId}:${providerId}`);
        const config = configTable.get(`${userId}:${providerId}`);
        if (config) {
          config.has_credential = false;
          config.credential_preview = null;
        }
        return existed;
      }),

      updateSecretCiphertext: vi.fn().mockImplementation(async (userId, providerId, payload) => {
        const row = vaultTable.get(`${userId}:${providerId}`);
        if (!row) return null;
        row.encrypted_blob = payload.encryptedBlob;
        row.initialization_vector = payload.initializationVector;
        row.auth_tag = payload.authTag;
        row.key_version = payload.keyVersion;
        row.updated_at = new Date().toISOString();
        return row;
      }),

      listSecretsForOwner: vi.fn().mockImplementation(async (userId) => {
        const rows = [];
        for (const [key, val] of vaultTable.entries()) {
          if (key.startsWith(`${userId}:`)) rows.push(val);
        }
        return rows;
      }),
    } as unknown as ProviderVaultRepository;

    mockConfigRepo = {
      findByProvider: vi.fn().mockImplementation(async (userId, providerId) => {
        return configTable.get(`${userId}:${providerId}`) ?? null;
      }),
    } as unknown as ProviderConfigRepository;

    service = new ProviderCredentialService(mockVaultRepo, mockConfigRepo, keyManager);
  });

  describe('1. Input Validation & Whitelist Enforcement', () => {
    it('SRV-001: Rejects unsupported provider identifiers', async () => {
      await expect(
        service.storeCredential(userA, 'unsupported_ai_vendor', syntheticCanaryKey)
      ).rejects.toThrow(UnsupportedProviderError);
    });

    it('SRV-002: Accepts supported AI and search providers', async () => {
      for (const provider of ['openai', 'openrouter', 'nim', 'tavily'] as const) {
        const metadata = await service.storeCredential(userA, provider, syntheticCanaryKey);
        expect(metadata.hasCredential).toBe(true);
        expect(metadata.providerId).toBe(provider);
      }
    });

    it('SRV-003: Rejects empty, whitespace-only, or oversized credentials', async () => {
      await expect(service.storeCredential(userA, 'openai', '')).rejects.toThrow(InvalidCredentialFormatError);
      await expect(service.storeCredential(userA, 'openai', '    ')).rejects.toThrow(InvalidCredentialFormatError);
      await expect(service.storeCredential(userA, 'openai', 'a'.repeat(1025))).rejects.toThrow(
        InvalidCredentialFormatError
      );
    });

    it('SRV-004: Rejects credentials containing illegal control characters', async () => {
      await expect(service.storeCredential(userA, 'openai', 'sk-proj-test\0bad')).rejects.toThrow(
        InvalidCredentialFormatError
      );
      await expect(service.storeCredential(userA, 'openai', 'sk-proj-test\nbad')).rejects.toThrow(
        InvalidCredentialFormatError
      );
    });
  });

  describe('2. Secure Credential Storage & Safe Metadata Output', () => {
    it('SRV-005: Encrypts credential before persisting and returns safe metadata DTO', async () => {
      const metadata = await service.storeCredential(userA, 'openai', syntheticCanaryKey);

      expect(metadata).toEqual({
        providerId: 'openai',
        hasCredential: true,
        credentialPreview: 'sk-...7890',
        keyVersion: 1,
        updatedAt: expect.any(String),
      });

      // Assert repository was passed ciphertext, NOT the plaintext canary string
      expect(mockVaultRepo.storeSecret).toHaveBeenCalledWith(
        userA,
        'openai',
        expect.objectContaining({
          encryptedBlob: expect.any(Buffer),
          initializationVector: expect.any(Buffer),
          authTag: expect.any(Buffer),
          keyVersion: 1,
        }),
        'sk-...7890'
      );

      // Verify the stored encrypted blob does not contain the canary string
      const storedRow = vaultTable.get(`${userA}:openai`);
      expect(storedRow.encrypted_blob.toString('utf8')).not.toContain(syntheticCanaryKey);
    });
  });

  describe('3. Restricted Internal Decryption', () => {
    it('SRV-006: Decrypts credential correctly for authorized internal operations', async () => {
      await service.storeCredential(userA, 'openrouter', syntheticCanaryKey);

      const decrypted = await service.getDecryptedCredential(userA, 'openrouter');
      expect(decrypted).toBe(syntheticCanaryKey);
    });

    it('SRV-007: Returns null when requesting an unconfigured provider credential', async () => {
      const decrypted = await service.getDecryptedCredential(userA, 'nim');
      expect(decrypted).toBeNull();
    });
  });

  describe('4. Cross-Tenant Isolation & Ownership Boundaries', () => {
    it('SRV-008: User B cannot retrieve or decrypt User A credential', async () => {
      await service.storeCredential(userA, 'openai', syntheticCanaryKey);

      // User B attempts to get User A's credential
      const resultForUserB = await service.getDecryptedCredential(userB, 'openai');
      expect(resultForUserB).toBeNull();
    });

    it('SRV-009: User B cannot delete User A credential', async () => {
      await service.storeCredential(userA, 'openai', syntheticCanaryKey);

      const deleted = await service.deleteCredential(userB, 'openai');
      expect(deleted).toBe(false);

      // User A's credential remains safely intact
      const stillThere = await service.getDecryptedCredential(userA, 'openai');
      expect(stillThere).toBe(syntheticCanaryKey);
    });
  });

  describe('5. Credential Deletion & Metadata Synchronization', () => {
    it('SRV-010: Deletes credential and resets configuration metadata', async () => {
      await service.storeCredential(userA, 'tavily', 'tvly-secret-1234567890');

      const deleted = await service.deleteCredential(userA, 'tavily');
      expect(deleted).toBe(true);

      expect(await service.getDecryptedCredential(userA, 'tavily')).toBeNull();
      const metadata = await service.getCredentialMetadata(userA, 'tavily');
      expect(metadata).toBeNull();
    });
  });

  describe('6. Zero-Downtime Key Rotation', () => {
    it('SRV-011: Rotates credential to target key version without losing access', async () => {
      // 1. Initial storage under Key Version 1
      await service.storeCredential(userA, 'openai', syntheticCanaryKey);
      const preRotationRow = vaultTable.get(`${userA}:openai`);
      expect(preRotationRow.key_version).toBe(1);
      const preRotationIv = Buffer.from(preRotationRow.initialization_vector);

      // 2. Perform rotation to Key Version 2
      const rotatedMetadata = await service.rotateCredentialKey(userA, 'openai', 2);
      expect(rotatedMetadata.keyVersion).toBe(2);

      const postRotationRow = vaultTable.get(`${userA}:openai`);
      expect(postRotationRow.key_version).toBe(2);
      expect(postRotationRow.initialization_vector).not.toEqual(preRotationIv);

      // 3. Verify internal decryption still reproduces original plaintext under Version 2 key
      const decrypted = await service.getDecryptedCredential(userA, 'openai');
      expect(decrypted).toBe(syntheticCanaryKey);
    });
  });

  describe('7. Secret Canary Leakage Prevention', () => {
    it('SRV-012: Canary secret never appears in metadata or audit events', async () => {
      const canary = 'sk-proj-CANARY-CANNOT-LEAK-SUPER-SECRET-XYZ-999';
      const metadata = await service.storeCredential(userA, 'openai', canary);

      const metadataString = JSON.stringify(metadata);
      expect(metadataString).not.toContain(canary);
      expect(metadataString).not.toContain('CANARY');
      expect(metadataString).not.toContain('SUPER-SECRET');

      // The preview preserves only prefix and trailing 4 chars
      expect(metadata.credentialPreview).toBe('sk-...-999');
    });
  });
});
