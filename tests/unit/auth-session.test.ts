import { describe, it, expect } from 'vitest';
import {
  getSessionCookieOptions,
  toSafeUser,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  validateSessionToken,
} from '@/server/auth/session';
import { AuthUserRow } from '@/server/persistence/types';

describe('Session Lifecycle and Cookie Hardening (SEC-006)', () => {
  it('configures hardened cookie security flags', () => {
    const options = getSessionCookieOptions();

    expect(SESSION_COOKIE_NAME).toBe('vs_session');
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(options.maxAge).toBe(7 * 24 * 60 * 60); // Exactly 7 days
  });

  it('sanitizes user rows to prevent password hash leakage to clients', () => {
    const rawUser: AuthUserRow = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'researcher@local.pc',
      password_hash: 'scrypt$16384$8$1$salt$derived_secret',
      display_name: 'Dr. Jane Scout',
      is_active: true,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    };

    const safeUser = toSafeUser(rawUser);

    expect(safeUser.id).toBe(rawUser.id);
    expect(safeUser.email).toBe(rawUser.email);
    expect(safeUser.displayName).toBe(rawUser.display_name);
    expect(safeUser.createdAt).toBe(rawUser.created_at);
    expect((safeUser as unknown as Record<string, unknown>).password_hash).toBeUndefined();
    expect((safeUser as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

  });

  it('rejects empty or whitespace-only session tokens gracefully', async () => {
    expect(await validateSessionToken('')).toBeNull();
    expect(await validateSessionToken('   ')).toBeNull();
  });
});
