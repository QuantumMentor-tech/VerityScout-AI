import 'server-only';
import { getServerEnv } from '@/lib/config/server-env';
import {
  EncryptedVaultPayload,
  VaultCryptoContext,
  VaultCryptoError,
  decryptProviderSecret,
  encryptProviderSecret,
  VAULT_KEY_LENGTH_BYTES,
} from './provider-vault.crypto';

export class VaultKeyNotFoundError extends VaultCryptoError {
  constructor(version: number) {
    super(`Encryption key version ${version} is not configured in active server keyring`);
    this.name = 'VaultKeyNotFoundError';
  }
}

export interface KeyManagerOptions {
  activeVersion?: number;
  masterKeyHex?: string;
  keyringHex?: Record<number, string>;
}

/**
 * Parses and validates a 64-character hexadecimal key into a 32-byte Buffer.
 */
export function parseHexKey(hex: string): Buffer {
  if (!hex || typeof hex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new VaultCryptoError('Invalid encryption key format: expected 64-character hexadecimal string');
  }
  const keyBuffer = Buffer.from(hex, 'hex');
  if (keyBuffer.length !== VAULT_KEY_LENGTH_BYTES) {
    throw new VaultCryptoError(`Invalid encryption key length: parsed ${keyBuffer.length} bytes, expected ${VAULT_KEY_LENGTH_BYTES}`);
  }
  return keyBuffer;
}

/**
 * Manages active and historical versioned encryption keys for the provider secret vault.
 */
export class VaultKeyManager {
  private readonly activeVersion: number;
  private readonly keysByVersion: Map<number, Buffer>;

  constructor(options?: KeyManagerOptions) {
    this.keysByVersion = new Map();

    if (options?.masterKeyHex) {
      // Direct options provided (e.g. testing)
      this.activeVersion = options.activeVersion ?? 1;
      this.keysByVersion.set(this.activeVersion, parseHexKey(options.masterKeyHex));

      if (options.keyringHex) {
        for (const [verStr, hex] of Object.entries(options.keyringHex)) {
          const verNum = Number.parseInt(verStr, 10);
          if (!Number.isNaN(verNum)) {
            this.keysByVersion.set(verNum, parseHexKey(hex));
          }
        }
      }
    } else {
      // Resolve from validated server configuration
      const env = getServerEnv();
      this.activeVersion = env.VAULT_ACTIVE_KEY_VERSION ?? 1;

      // Primary active master key
      this.keysByVersion.set(this.activeVersion, parseHexKey(env.VAULT_MASTER_KEY));

      // Parse optional historical keyring
      if (env.VAULT_KEYRING) {
        try {
          const parsed = JSON.parse(env.VAULT_KEYRING);
          if (typeof parsed === 'object' && parsed !== null) {
            for (const [verStr, hex] of Object.entries(parsed)) {
              const verNum = Number.parseInt(verStr, 10);
              if (!Number.isNaN(verNum) && typeof hex === 'string') {
                this.keysByVersion.set(verNum, parseHexKey(hex));
              }
            }
          }
        } catch {
          throw new VaultCryptoError('Failed to parse VAULT_KEYRING environment variable: invalid JSON');
        }
      }
    }
  }

  /**
   * Retrieves the currently active encryption key and its version number.
   */
  getActiveKey(): { version: number; key: Buffer } {
    const key = this.keysByVersion.get(this.activeVersion);
    if (!key) {
      throw new VaultKeyNotFoundError(this.activeVersion);
    }
    return { version: this.activeVersion, key };
  }

  /**
   * Retrieves the encryption key buffer for a specified version.
   * Throws VaultKeyNotFoundError if the historical version is not present in the keyring.
   */
  getKeyForVersion(version: number): Buffer {
    const key = this.keysByVersion.get(version);
    if (!key) {
      throw new VaultKeyNotFoundError(version);
    }
    return key;
  }

  /**
   * Checks whether a specific key version is supported for decryption.
   */
  hasKeyVersion(version: number): boolean {
    return this.keysByVersion.has(version);
  }

  /**
   * Re-encrypts an existing encrypted vault payload under a new target key version.
   * Used for zero-downtime key rotation workflows.
   */
  reencryptPayload(
    payload: EncryptedVaultPayload,
    context: VaultCryptoContext,
    targetKeyVersion = this.activeVersion
  ): EncryptedVaultPayload {
    // 1. Resolve source key and decrypt
    const sourceKey = this.getKeyForVersion(payload.keyVersion);
    const plaintext = decryptProviderSecret(payload, context, sourceKey);

    // 2. Resolve destination key and encrypt with fresh IV
    const targetKey = this.getKeyForVersion(targetKeyVersion);
    return encryptProviderSecret(plaintext, context, targetKey, targetKeyVersion);
  }
}

/**
 * Singleton instance of the VaultKeyManager for standard runtime use.
 */
let defaultKeyManager: VaultKeyManager | null = null;

export function getDefaultKeyManager(): VaultKeyManager {
  if (!defaultKeyManager) {
    defaultKeyManager = new VaultKeyManager();
  }
  return defaultKeyManager;
}

export function _resetVaultKeyManagerForTesting(): void {
  defaultKeyManager = null;
}
