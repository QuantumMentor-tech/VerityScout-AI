import { describe, it, expect, beforeEach } from 'vitest';
import {
  isRateLimited,
  recordFailedAttempt,
  resetFailedAttempts,
  _resetRateLimiterForTesting,
} from '@/server/auth/rate-limiter';

describe('Authentication Rate Limiter (SEC-009)', () => {
  beforeEach(() => {
    _resetRateLimiterForTesting();
  });

  it('allows initial authentication attempts for fresh IP addresses', () => {
    expect(isRateLimited('192.168.1.10')).toBe(false);
  });

  it('tracks consecutive failures and decrements remaining attempts', () => {
    const ip = '192.168.1.11';
    const first = recordFailedAttempt(ip);
    expect(first.isBlocked).toBe(false);
    expect(first.remainingAttempts).toBe(4);
    expect(isRateLimited(ip)).toBe(false);

    const second = recordFailedAttempt(ip);
    expect(second.isBlocked).toBe(false);
    expect(second.remainingAttempts).toBe(3);
  });

  it('enforces lockout after 5 consecutive failed attempts', () => {
    const ip = '10.0.0.5';

    for (let i = 1; i <= 4; i++) {
      const res = recordFailedAttempt(ip);
      expect(res.isBlocked).toBe(false);
    }

    // 5th attempt
    const fifth = recordFailedAttempt(ip);
    expect(fifth.isBlocked).toBe(false);
    expect(fifth.remainingAttempts).toBe(0);

    // 6th attempt triggers block
    const sixth = recordFailedAttempt(ip);
    expect(sixth.isBlocked).toBe(true);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
    expect(isRateLimited(ip)).toBe(true);
  });

  it('resets attempts after successful authentication', () => {
    const ip = '172.16.0.2';
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);

    resetFailedAttempts(ip);
    expect(isRateLimited(ip)).toBe(false);

    const fresh = recordFailedAttempt(ip);
    expect(fresh.remainingAttempts).toBe(4);
  });
});
