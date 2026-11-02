import 'server-only';
import {
  encryptProviderSecret,
  decryptProviderSecret,
  generateCredentialPreview,
  EncryptedVaultPayload,
} from '@/server/crypto/provider-vault.crypto';
import { VaultKeyManager, getDefaultKeyManager } from '@/server/crypto/key-manager';
import { ProviderVaultRepository } from '@/server/persistence/repositories/provider-vault.repository';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import { logger } from '@/lib/logging/logger';

/**
 * Approved provider ecosystem for VerityScout AI.
 * Baseline includes primary AI synthesis providers (OpenAI, OpenRouter, NVIDIA NIM)
 * as well as approved search and extraction providers (Tavily, Exa, Firecrawl).
 */
export const SUPPORTED_PROVIDERS = [
  'openai',
  'openrouter',
  'nim',
  'tavily',
  'exa',
  'firecrawl',
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(providerId: string): providerId is SupportedProvider {
  return SUPPORTED_PROVIDERS.includes(providerId as SupportedProvider);
}

/**
 * Safe, non-secret metadata representation of a configured provider credential.
 * Plaintext API keys and cryptographic secrets are strictly excluded from this DTO.
 */
export interface SafeCredentialMetadata {
  providerId: string;
  hasCredential: boolean;
  credentialPreview: string | null;
  keyVersion?: number;
  updatedAt?: string;
}

export class ProviderCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderCredentialError';
  }
}

export class UnsupportedProviderError extends ProviderCredentialError {
  constructor(providerId: string) {
    super(`Unsupported provider identifier: "${providerId}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
    this.name = 'UnsupportedProviderError';
  }
}

export class InvalidCredentialFormatError extends ProviderCredentialError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCredentialFormatError';
  }
}

/**
 * Centralized server-only service governing provider credential storage,
 * authenticated encryption at rest, safe metadata generation, and internal decryption.
 */
export class ProviderCredentialService {
  constructor(
    private readonly vaultRepo: ProviderVaultRepository = new ProviderVaultRepository(),
    private readonly configRepo: ProviderConfigRepository = new ProviderConfigRepository(),
    private readonly keyManager: VaultKeyManager = getDefaultKeyManager()
  ) {}

  /**
   * Validates raw credential input for size and security hygiene.
   */
  private validateSecretInput(secret: string): void {
    if (!secret || typeof secret !== 'string') {
      throw new InvalidCredentialFormatError('Provider credential must be a non-empty string');
    }
    const trimmed = secret.trim();
    if (trimmed.length === 0) {
      throw new InvalidCredentialFormatError('Provider credential cannot be empty or solely whitespace');
    }
    if (secret.length > 1024) {
      throw new InvalidCredentialFormatError('Provider credential exceeds maximum permitted length of 1024 characters');
    }
    // Prevent embedded control characters, null bytes, or carriage returns that corrupt HTTP headers
    if (/[\x00-\x08\x0A-\x1F\x7F]/.test(secret)) {
      throw new InvalidCredentialFormatError('Provider credential contains illegal control characters');
    }
  }

  /**
   * Validates that the provider identifier belongs to the approved ecosystem.
   */
  private validateProviderId(providerId: string): asserts providerId is SupportedProvider {
    if (!isSupportedProvider(providerId)) {
      throw new UnsupportedProviderError(providerId);
    }
  }

  /**
   * Encrypts and securely stores a provider API credential.
   * Generates a safe preview mask and records ciphertext in PostgreSQL vault.
   *
   * @param userId The verified authenticated user owner UUID.
   * @param providerId The approved provider identifier (e.g. 'openai').
   * @param rawSecret The raw API key submitted by the user.
   * @returns Non-secret safe metadata representation.
   */
  async storeCredential(
    userId: string,
    providerId: string,
    rawSecret: string
  ): Promise<SafeCredentialMetadata> {
    this.validateProviderId(providerId);
    this.validateSecretInput(rawSecret);

    const { version: activeVersion, key: activeKey } = this.keyManager.getActiveKey();
    const context = { userId, providerId };

    // 1. Authenticated encryption using AES-256-GCM with fresh nonce
    const payload = encryptProviderSecret(rawSecret, context, activeKey, activeVersion);

    // 2. Generate safe preview mask (e.g. sk-...a1b2)
    const preview = generateCredentialPreview(rawSecret);

    // 3. Persist ciphertext in provider_vault_secrets and update provider_configurations metadata
    const saved = await this.vaultRepo.storeSecret(userId, providerId, payload, preview);

    // 4. Security audit logging (zero secret or key leakage)
    logger.info('AUTH_PROVIDER_CREDENTIAL_STORED', 'Provider API credential securely encrypted and persisted', {
      callerUserId: userId,
      providerId,
      keyVersion: activeVersion,
    });

    return {
      providerId,
      hasCredential: true,
      credentialPreview: preview,
      keyVersion: saved.key_version,
      updatedAt: saved.updated_at,
    };
  }

  /**
   * RESTRICTED INTERNAL METHOD: Decrypts and returns the raw provider API key.
   * STRICT ACCESS CONTROL: Must ONLY be invoked by authorized internal provider adapters
   * during outbound request dispatch. Never expose to client DTOs or API responses.
   *
   * @param userId Verified owner UUID.
   * @param providerId Target provider identifier.
   * @returns The raw decrypted API key, or null if unconfigured.
   */
  async getDecryptedCredential(userId: string, providerId: string): Promise<string | null> {
    this.validateProviderId(providerId);

    const secretRow = await this.vaultRepo.getSecret(userId, providerId);
    if (!secretRow) {
      return null;
    }

    const payload: EncryptedVaultPayload = {
      encryptedBlob: secretRow.encrypted_blob,
      initializationVector: secretRow.initialization_vector,
      authTag: secretRow.auth_tag,
      keyVersion: secretRow.key_version,
    };

    const context = { userId, providerId, keyVersion: secretRow.key_version };
    const decryptionKey = this.keyManager.getKeyForVersion(secretRow.key_version);

    // Decrypt and verify authentication tag + AAD
    const decrypted = decryptProviderSecret(payload, context, decryptionKey);

    logger.info('AUTH_PROVIDER_CREDENTIAL_DECRYPTED', 'Provider API credential decrypted for internal operation', {
      callerUserId: userId,
      providerId,
      keyVersion: secretRow.key_version,
    });

    return decrypted;
  }

  /**
   * Retrieves safe, non-secret metadata for a provider configuration.
   * Never decrypts or touches ciphertext.
   */
  async getCredentialMetadata(
    userId: string,
    providerId: string
  ): Promise<SafeCredentialMetadata | null> {
    this.validateProviderId(providerId);

    const secretRow = await this.vaultRepo.getSecret(userId, providerId);
    if (!secretRow) {
      return null;
    }

    const configRow = await this.configRepo.findByProvider(userId, providerId);

    return {
      providerId,
      hasCredential: true,
      credentialPreview: configRow?.credential_preview ?? null,
      keyVersion: secretRow.key_version,
      updatedAt: secretRow.updated_at,
    };
  }

  /**
   * Deletes a stored provider credential and cleans up configuration metadata.
   */
  async deleteCredential(userId: string, providerId: string): Promise<boolean> {
    this.validateProviderId(providerId);

    const deleted = await this.vaultRepo.deleteSecret(userId, providerId);

    logger.info('AUTH_PROVIDER_CREDENTIAL_DELETED', 'Provider API credential removed from vault', {
      callerUserId: userId,
      providerId,
      deleted,
    });

    return deleted;
  }

  /**
   * Re-encrypts an existing credential under a new active key version (zero-downtime key rotation).
   */
  async rotateCredentialKey(
    userId: string,
    providerId: string,
    targetKeyVersion?: number
  ): Promise<SafeCredentialMetadata> {
    this.validateProviderId(providerId);

    const secretRow = await this.vaultRepo.getSecret(userId, providerId);
    if (!secretRow) {
      throw new ProviderCredentialError(`No credential found for provider "${providerId}" to rotate`);
    }

    const sourcePayload: EncryptedVaultPayload = {
      encryptedBlob: secretRow.encrypted_blob,
      initializationVector: secretRow.initialization_vector,
      authTag: secretRow.auth_tag,
      keyVersion: secretRow.key_version,
    };

    const context = { userId, providerId };
    const destinationVersion = targetKeyVersion ?? this.keyManager.getActiveKey().version;

    // Decrypt with historical key and re-encrypt with target key using fresh IV
    const reencryptedPayload = this.keyManager.reencryptPayload(
      sourcePayload,
      context,
      destinationVersion
    );

    const updated = await this.vaultRepo.updateSecretCiphertext(
      userId,
      providerId,
      reencryptedPayload
    );

    if (!updated) {
      throw new ProviderCredentialError('Failed to update rotated ciphertext in vault');
    }

    logger.info('AUTH_PROVIDER_CREDENTIAL_ROTATED', 'Provider API credential re-encrypted under updated key version', {
      callerUserId: userId,
      providerId,
      sourceKeyVersion: secretRow.key_version,
      destinationKeyVersion: destinationVersion,
    });

    const configRow = await this.configRepo.findByProvider(userId, providerId);

    return {
      providerId,
      hasCredential: true,
      credentialPreview: configRow?.credential_preview ?? null,
      keyVersion: updated.key_version,
      updatedAt: updated.updated_at,
    };
  }
}
