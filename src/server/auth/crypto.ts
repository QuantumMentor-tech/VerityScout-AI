import 'server-only';
import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/**
 * Hashes a plaintext password using standard scrypt key derivation.
 * Format: scrypt$N$r$p$<salt_hex>$<derived_key_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(32).toString('hex');

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString('hex')}`);
        }
      }
    );
  });
}

/**
 * Verifies a candidate password against a stored scrypt hash using timingSafeEqual.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, nStr, rStr, pStr, saltHex, originalKeyHex] = parts;
  if (!nStr || !rStr || !pStr || !saltHex || !originalKeyHex) {
    return false;
  }

  const n = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);

  return new Promise((resolve) => {
    crypto.scrypt(password, saltHex, KEY_LEN, { N: n, r, p }, (err, derivedKey) => {
      if (err) {
        resolve(false);
        return;
      }

      try {
        const originalBuffer = Buffer.from(originalKeyHex, 'hex');
        if (originalBuffer.length !== derivedKey.length) {
          resolve(false);
          return;
        }

        // Timing-safe comparison against side-channel timing attacks
        const match = crypto.timingSafeEqual(originalBuffer, derivedKey);
        resolve(match);
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Generates an unguessable 256-bit cryptographically secure session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a deterministic SHA-256 hash of a session token for safe database persistence.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
}
