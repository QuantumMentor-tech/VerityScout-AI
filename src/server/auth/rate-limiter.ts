import 'server-only';

interface RateLimitRecord {
  attempts: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute window
const LOCKOUT_MS = 60 * 1000; // 1 minute lockout on 5 consecutive failures

/**
 * Checks if a key (e.g. client IP or identifier) is currently rate limited.
 */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record) {
    return false;
  }

  if (record.blockedUntil && now < record.blockedUntil) {
    return true;
  }

  // If window has expired and not blocked, clear record
  if (now - record.firstAttemptAt > WINDOW_MS && !record.blockedUntil) {
    rateLimitStore.delete(key);
    return false;
  }

  return false;
}

/**
 * Records a failed authentication attempt for a key.
 */
export function recordFailedAttempt(key: string): {
  isBlocked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || (now - record.firstAttemptAt > WINDOW_MS && !record.blockedUntil)) {
    rateLimitStore.set(key, {
      attempts: 1,
      firstAttemptAt: now,
      blockedUntil: null,
    });
    return { isBlocked: false, remainingAttempts: MAX_ATTEMPTS - 1, retryAfterSeconds: 0 };
  }

  record.attempts += 1;

  if (record.attempts > MAX_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_MS;
    return {
      isBlocked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000),
    };
  }

  return {
    isBlocked: false,
    remainingAttempts: MAX_ATTEMPTS - record.attempts,
    retryAfterSeconds: 0,
  };
}

/**
 * Resets failed attempts after a successful authentication.
 */
export function resetFailedAttempts(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Testing helper: clears in-memory rate limit records.
 */
export function _resetRateLimiterForTesting(): void {
  rateLimitStore.clear();
}
