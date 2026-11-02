import 'server-only';
import crypto from 'node:crypto';

/**
 * Standard cryptographic parameters for AES-256-GCM authenticated encryption.
 * In accordance with NIST SP 800-38D and RFC 5116:
 * - Cipher: aes-256-gcm
 * - Key length: 32 bytes (256 bits)
 * - Nonce (IV) length: 12 bytes (96 bits)
 * - Authentication tag length: 16 bytes (128 bits)
 */
export const VAULT_CIPHER_ALGORITHM = 'aes-256-gcm';
export const VAULT_KEY_LENGTH_BYTES = 32;
export const VAULT_IV_LENGTH_BYTES = 12;
export const VAULT_AUTH_TAG_LENGTH_BYTES = 16;

/**
 * Context bound to the ciphertext as Associated Authenticated Data (AAD).
 * Prevents ciphertext relocation across user tenants, providers, or key versions.
 */
export interface VaultCryptoContext {
  userId: string;
  providerId: string;
  keyVersion?: number;
}

/**
 * Encrypted payload containing ciphertext and required cryptographic parameters.
 */
export interface EncryptedVaultPayload {
  encryptedBlob: Buffer;
  initializationVector: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

/**
 * Base error class for all vault cryptographic operations.
 * Explicitly designed to prevent secret and key leakage in exception messages.
 */
export class VaultCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultCryptoError';
  }
}

export class VaultDecryptionError extends VaultCryptoError {
  constructor(message = 'Failed to decrypt provider secret: authentication tag mismatch or corrupted ciphertext') {
    super(message);
    this.name = 'VaultDecryptionError';
  }
}

export class VaultInvalidKeyError extends VaultCryptoError {
  constructor(message = 'Invalid encryption key: key must be exactly 32 bytes') {
    super(message);
    this.name = 'VaultInvalidKeyError';
  }
}

/**
 * Derives Associated Authenticated Data (AAD) buffer.
 * Binds tenant ID, provider identifier, and key version into the GCM GHASH calculation.
 */
export function buildVaultAAD(context: VaultCryptoContext, keyVersion: number): Buffer {
  if (!context.userId || !context.providerId) {
    throw new VaultCryptoError('AAD context requires non-empty userId and providerId');
  }
  return Buffer.from(`verityscout:vault:v1:${context.userId}:${context.providerId}:${keyVersion}`, 'utf8');
}

/**
 * Encrypts a raw provider secret using AES-256-GCM authenticated encryption.
 * Generates a fresh cryptographically random 12-byte nonce for every invocation.
 *
 * @param plaintext The raw provider API key string.
 * @param context User and provider context for AAD binding.
 * @param key The 32-byte master encryption key buffer.
 * @param keyVersion The version number of the key being used (defaults to 1).
 */
export function encryptProviderSecret(
  plaintext: string,
  context: VaultCryptoContext,
  key: Buffer,
  keyVersion = 1
): EncryptedVaultPayload {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new VaultCryptoError('Plaintext secret must be a non-empty string');
  }

  if (Buffer.byteLength(key) !== VAULT_KEY_LENGTH_BYTES) {
    throw new VaultInvalidKeyError();
  }

  // 1. Generate fresh 12-byte initialization vector (nonce)
  const initializationVector = crypto.randomBytes(VAULT_IV_LENGTH_BYTES);

  // 2. Initialize AES-256-GCM cipher
  const cipher = crypto.createCipheriv(VAULT_CIPHER_ALGORITHM, key, initializationVector, {
    authTagLength: VAULT_AUTH_TAG_LENGTH_BYTES,
  });

  // 3. Bind Associated Authenticated Data (AAD)
  const aad = buildVaultAAD(context, keyVersion);
  cipher.setAAD(aad);

  // 4. Encrypt the plaintext secret
  const encryptedBlob = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);

  // 5. Extract 16-byte authentication tag
  const authTag = cipher.getAuthTag();

  return {
    encryptedBlob,
    initializationVector,
    authTag,
    keyVersion,
  };
}

/**
 * Decrypts an encrypted vault payload using AES-256-GCM.
 * Validates the authentication tag and AAD context; fails closed on any tampering.
 *
 * @param payload The encrypted payload containing ciphertext, IV, tag, and keyVersion.
 * @param context User and provider context that must match the original AAD.
 * @param key The 32-byte decryption key buffer corresponding to payload.keyVersion.
 * @returns The decrypted plaintext secret.
 */
export function decryptProviderSecret(
  payload: EncryptedVaultPayload,
  context: VaultCryptoContext,
  key: Buffer
): string {
  if (Buffer.byteLength(key) !== VAULT_KEY_LENGTH_BYTES) {
    throw new VaultInvalidKeyError();
  }

  if (payload.initializationVector.length !== VAULT_IV_LENGTH_BYTES) {
    throw new VaultDecryptionError('Invalid initialization vector length: expected 12 bytes');
  }

  if (payload.authTag.length !== VAULT_AUTH_TAG_LENGTH_BYTES) {
    throw new VaultDecryptionError('Invalid authentication tag length: expected 16 bytes');
  }

  try {
    const decipher = crypto.createDecipheriv(
      VAULT_CIPHER_ALGORITHM,
      key,
      payload.initializationVector,
      { authTagLength: VAULT_AUTH_TAG_LENGTH_BYTES }
    );

    // Bind and verify AAD
    const aad = buildVaultAAD(context, payload.keyVersion);
    decipher.setAAD(aad);

    // Set expected 16-byte authentication tag
    decipher.setAuthTag(payload.authTag);

    // Decrypt and verify integrity
    const decryptedBuffer = Buffer.concat([
      decipher.update(payload.encryptedBlob),
      decipher.final(),
    ]);

    return decryptedBuffer.toString('utf8');
  } catch (error) {
    // Fail closed: rethrow safe error without disclosing key or ciphertext details
    if (error instanceof VaultCryptoError) {
      throw error;
    }
    throw new VaultDecryptionError();
  }
}

/**
 * Creates a safe, sanitized preview mask for an entered API key.
 * Only the trailing 4 characters are preserved (with known prefix where applicable).
 * Never discloses enough characters to reconstruct or test the secret.
 *
 * @example
 * generateCredentialPreview('sk-proj-1234567890abcdef') => 'sk-...cdef'
 * generateCredentialPreview('tvly-1234567890abcdef') => 'tvly-...cdef'
 * generateCredentialPreview('short') => '[CONFIGURED]'
 */
export function generateCredentialPreview(rawSecret: string): string {
  if (!rawSecret || rawSecret.length < 8) {
    return '[CONFIGURED]';
  }

  const trailing = rawSecret.slice(-4);

  if (rawSecret.startsWith('sk-proj-') || rawSecret.startsWith('sk-ant-') || rawSecret.startsWith('sk-')) {
    return `sk-...${trailing}`;
  }

  if (rawSecret.startsWith('tvly-')) {
    return `tvly-...${trailing}`;
  }

  if (rawSecret.startsWith('nvapi-')) {
    return `nvapi-...${trailing}`;
  }

  return `...${trailing}`;
}
