import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from '@/server/auth/crypto';

describe('Authentication Cryptographic Primitives (SEC-006, SEC-007)', () => {
  it('hashes passwords using scrypt with random salt and key derivation', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);

    // Two hashes of the same password must produce different salts and different derived keys
    const hash2 = await hashPassword(password);
    expect(hash2).not.toEqual(hash);
  });

  it('verifies correct passwords successfully', async () => {
    const password = 'CorrectHorseBatteryStaple!';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect passwords safely', async () => {
    const password = 'CorrectHorseBatteryStaple!';
    const hash = await hashPassword(password);

    const isWrongValid = await verifyPassword('WrongPassword123!', hash);
    expect(isWrongValid).toBe(false);
  });

  it('rejects malformed hashes safely without throwing unhandled exceptions', async () => {
    expect(await verifyPassword('password', '')).toBe(false);
    expect(await verifyPassword('password', 'md5$invalid')).toBe(false);
    expect(await verifyPassword('password', 'scrypt$invalid$format')).toBe(false);
    expect(await verifyPassword('password', 'scrypt$16384$8$1$short$badkey')).toBe(false);
  });

  it('generates unguessable 256-bit cryptographically secure session tokens', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(64); // 32 bytes in hex = 64 characters
    expect(token2).toHaveLength(64);
    expect(token1).not.toEqual(token2);
    expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
  });

  it('produces deterministic SHA-256 hashes for session tokens', () => {
    const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const hash1 = hashSessionToken(token);
    const hash2 = hashSessionToken(token);

    expect(hash1).toEqual(hash2);
    expect(hash1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
  });
});
