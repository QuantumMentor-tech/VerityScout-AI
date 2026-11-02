import 'server-only';
import { cookies } from 'next/headers';
import { AuthUserRow, AuthSessionRow } from '../persistence/types';
import { AuthRepository } from '../persistence/repositories/auth.repository';
import { hashSessionToken } from './crypto';

export const SESSION_COOKIE_NAME = 'vs_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days per SEC-006
export const SESSION_RENEWAL_THRESHOLD_SECONDS = 3 * 24 * 60 * 60; // Extend if < 3 days remain

export interface SafeUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface SessionCookieOptions {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
}

/**
 * Returns hardened cookie configuration options enforcing SEC-006.
 */
export function getSessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS): Omit<SessionCookieOptions, 'name' | 'value'> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/**
 * Sanitizes an internal database user row, removing the password hash before
 * sending to client components or API consumers.
 */
export function toSafeUser(user: AuthUserRow): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    createdAt: user.created_at,
  };
}

const authRepo = new AuthRepository();

/**
 * Validates a raw session token string against the database.
 * Computes deterministic SHA-256 hash of token, finds active session and user,
 * and performs sliding window renewal if the expiration is within the threshold.
 */
export async function validateSessionToken(
  token: string
): Promise<{ session: AuthSessionRow; user: AuthUserRow } | null> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const result = await authRepo.findSessionByTokenHash(tokenHash);

  if (!result) {
    return null;
  }

  const { session, user } = result;

  // Check if session has expired
  const now = Date.now();
  const expiresAt = new Date(session.expires_at).getTime();

  if (expiresAt <= now) {
    // Delete expired session asynchronously
    void authRepo.deleteSessionByTokenHash(tokenHash);
    return null;
  }

  // Sliding window extension: if less than threshold remains, extend session
  const remainingSeconds = Math.floor((expiresAt - now) / 1000);
  if (remainingSeconds < SESSION_RENEWAL_THRESHOLD_SECONDS) {
    const newExpiresAt = new Date(now + SESSION_MAX_AGE_SECONDS * 1000);
    void authRepo.touchSession(session.id, newExpiresAt);
  } else {
    void authRepo.touchSession(session.id);
  }

  return { session, user };
}

/**
 * Resolves the currently authenticated user in a Next.js Server Component,
 * Server Action, or Route Handler from the HttpOnly session cookie.
 * Returns null if unauthenticated or session is invalid/expired.
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      return null;
    }

    const resolved = await validateSessionToken(sessionCookie.value);
    if (!resolved) {
      return null;
    }

    return toSafeUser(resolved.user);
  } catch {
    // In environments where cookies() is outside request context or throws, return null
    return null;
  }
}
