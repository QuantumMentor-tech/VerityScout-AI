import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  VaultKeyManager,
  parseHexKey,
  VaultKeyNotFoundError,
} from '@/server/crypto/key-manager';
import {
  encryptProviderSecret,
  decryptProviderSecret,
  VaultDecryptionError,
  VAULT_KEY_LENGTH_BYTES,
} from '@/server/crypto/provider-vault.crypto';

describe('Vault Key Management & Rotation (Step 25 / SEC-001, SEC-002, ADR-010)', () => {
  const hexKeyV1 = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES).toString('hex');
  const hexKeyV2 = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES).toString('hex');
  const hexKeyV3 = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES).toString('hex');

  const userA = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const providerId = 'openrouter';
  const context = { userId: userA, providerId };
  const rawKey = 'sk-or-v1-CANARY-SECRET-TOKEN-123456';

  describe('1. Hexadecimal Key Parsing & Validation', () => {
    it('KEY-001: Correctly parses 64-character hex string into 32-byte Buffer', () => {
      const buffer = parseHexKey(hexKeyV1);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer).toHaveLength(32);
      expect(buffer.toString('hex')).toBe(hexKeyV1);
    });

    it('KEY-002: Rejects malformed hex strings or non-32-byte lengths', () => {
      expect(() => parseHexKey('short')).toThrow('Invalid encryption key format');
      expect(() => parseHexKey('zz'.repeat(32))).toThrow('Invalid encryption key format');
      expect(() => parseHexKey('')).toThrow('Invalid encryption key format');
    });
  });

  describe('2. Active & Historical Keyring Management', () => {
    it('KEY-003: Resolves active encryption key version and buffer', () => {
      const manager = new VaultKeyManager({
        activeVersion: 2,
        masterKeyHex: hexKeyV2,
        keyringHex: {
          1: hexKeyV1,
          2: hexKeyV2,
        },
      });

      const active = manager.getActiveKey();
      expect(active.version).toBe(2);
      expect(active.key.toString('hex')).toBe(hexKeyV2);
    });

    it('KEY-004: Resolves historical key versions for backward decryption compatibility', () => {
      const manager = new VaultKeyManager({
        activeVersion: 2,
        masterKeyHex: hexKeyV2,
        keyringHex: {
          1: hexKeyV1,
          2: hexKeyV2,
        },
      });

      expect(manager.hasKeyVersion(1)).toBe(true);
      expect(manager.getKeyForVersion(1).toString('hex')).toBe(hexKeyV1);

      expect(manager.hasKeyVersion(2)).toBe(true);
      expect(manager.getKeyForVersion(2).toString('hex')).toBe(hexKeyV2);
    });

    it('KEY-005: Fails closed when an unconfigured historical key version is requested', () => {
      const manager = new VaultKeyManager({
        activeVersion: 1,
        masterKeyHex: hexKeyV1,
      });

      expect(manager.hasKeyVersion(99)).toBe(false);
      expect(() => manager.getKeyForVersion(99)).toThrow(VaultKeyNotFoundError);
    });
  });

  describe('3. Re-Encryption & Key Rotation Strategy', () => {
    it('KEY-006: Re-encrypts payload under new active key version seamlessly', () => {
      const manager = new VaultKeyManager({
        activeVersion: 2,
        masterKeyHex: hexKeyV2,
        keyringHex: {
          1: hexKeyV1,
          2: hexKeyV2,
          3: hexKeyV3,
        },
      });

      // 1. Initial encryption under Version 1
      const keyV1 = manager.getKeyForVersion(1);
      const payloadV1 = encryptProviderSecret(rawKey, context, keyV1, 1);
      expect(payloadV1.keyVersion).toBe(1);

      // Verify it decrypts with Version 1
      expect(decryptProviderSecret(payloadV1, context, keyV1)).toBe(rawKey);

      // 2. Perform rotation to Version 2 using reencryptPayload
      const payloadV2 = manager.reencryptPayload(payloadV1, context, 2);
      expect(payloadV2.keyVersion).toBe(2);
      expect(payloadV2.initializationVector).not.toEqual(payloadV1.initializationVector);
      expect(payloadV2.encryptedBlob).not.toEqual(payloadV1.encryptedBlob);

      // 3. Verify payloadV2 decrypts with Version 2 key
      const keyV2 = manager.getKeyForVersion(2);
      expect(decryptProviderSecret(payloadV2, context, keyV2)).toBe(rawKey);

      // 4. Verify payloadV2 CANNOT be decrypted with Version 1 key (fails closed)
      expect(() => {
        decryptProviderSecret(payloadV2, context, keyV1);
      }).toThrow(VaultDecryptionError);
    });
  });
});
