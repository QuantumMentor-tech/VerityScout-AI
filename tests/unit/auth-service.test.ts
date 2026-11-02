import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '@/server/auth/auth-service';
import { AuthRepository } from '@/server/persistence/repositories/auth.repository';
import { _resetRateLimiterForTesting } from '@/server/auth/rate-limiter';
import { hashPassword } from '@/server/auth/crypto';
import { AuthUserRow, AuthSessionRow } from '@/server/persistence/types';

describe('AuthService Business Logic & Security Invariants', () => {
  let mockAuthRepo: AuthRepository;
  let authService: AuthService;

  beforeEach(() => {
    _resetRateLimiterForTesting();

    mockAuthRepo = {
      findUserById: vi.fn(),
      findUserByEmail: vi.fn(),
      createUser: vi.fn(),
      createSession: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      touchSession: vi.fn(),
      deleteSessionByTokenHash: vi.fn(),
      deleteSessionsByUserId: vi.fn(),
      cleanupExpiredSessions: vi.fn(),
    } as unknown as AuthRepository;

    authService = new AuthService(mockAuthRepo);
  });

  describe('Registration Flow', () => {
    it('creates a user and active session on valid registration input', async () => {
      const mockCreatedUser: AuthUserRow = {
        id: 'user-uuid-1',
        email: 'alice@verityscout.local',
        password_hash: 'scrypt$16384$8$1$salt$hash',
        display_name: 'Alice',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: AuthSessionRow = {
        id: 'session-uuid-1',
        user_id: 'user-uuid-1',
        session_token_hash: 'token_hash',
        expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        user_agent: 'Vitest/Test',
        ip_address: '127.0.0.1',
      };

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.createUser).mockResolvedValue(mockCreatedUser);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.register({
        email: 'Alice@VerityScout.local',
        password: 'SecurePassword123!',
        displayName: 'Alice',
        ipAddress: '127.0.0.1',
      });

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('user-uuid-1');
      expect(result.user?.email).toBe('alice@verityscout.local');
      expect(result.sessionToken).toBeDefined();
      expect(result.sessionToken).toHaveLength(64);
      expect(mockAuthRepo.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'alice@verityscout.local',
          display_name: 'Alice',
        })
      );
    });

    it('rejects registration when email is already registered', async () => {
      const existingUser: AuthUserRow = {
        id: 'user-uuid-2',
        email: 'bob@verityscout.local',
        password_hash: 'hash',
        display_name: 'Bob',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(existingUser);

      const result = await authService.register({
        email: 'bob@verityscout.local',
        password: 'ValidPassword123!',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('USER_EXISTS');
      expect(mockAuthRepo.createUser).not.toHaveBeenCalled();
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const result = await authService.register({
        email: 'short@verityscout.local',
        password: 'short',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_INPUT');
      expect(mockAuthRepo.createUser).not.toHaveBeenCalled();
    });

    it('rejects invalid email formats', async () => {
      const result = await authService.register({
        email: 'not-an-email',
        password: 'ValidPassword123!',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_INPUT');
      expect(mockAuthRepo.createUser).not.toHaveBeenCalled();
    });
  });

  describe('Sign-In Flow', () => {
    it('authenticates user with matching password and returns session token', async () => {
      const plainPassword = 'CorrectPassword999!';
      const storedHash = await hashPassword(plainPassword);

      const mockUser: AuthUserRow = {
        id: 'user-uuid-3',
        email: 'charlie@verityscout.local',
        password_hash: storedHash,
        display_name: 'Charlie',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: AuthSessionRow = {
        id: 'session-uuid-3',
        user_id: 'user-uuid-3',
        session_token_hash: 'token_hash_3',
        expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        user_agent: 'Vitest/Test',
        ip_address: '10.0.0.1',
      };

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.signIn({
        email: 'charlie@verityscout.local',
        password: plainPassword,
        ipAddress: '10.0.0.1',
      });

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('user-uuid-3');
      expect(result.sessionToken).toBeDefined();
      expect(mockAuthRepo.createSession).toHaveBeenCalled();
    });

    it('fails safely with INVALID_CREDENTIALS when password does not match', async () => {
      const storedHash = await hashPassword('CorrectPassword123!');

      const mockUser: AuthUserRow = {
        id: 'user-uuid-4',
        email: 'dan@verityscout.local',
        password_hash: storedHash,
        display_name: 'Dan',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(mockUser);

      const result = await authService.signIn({
        email: 'dan@verityscout.local',
        password: 'WrongPassword!',
        ipAddress: '10.0.0.2',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it('fails with generic INVALID_CREDENTIALS when user does not exist', async () => {
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);

      const result = await authService.signIn({
        email: 'nonexistent@verityscout.local',
        password: 'AnyPassword123!',
        ipAddress: '10.0.0.3',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('blocks repeated failed sign-in attempts after 5 failures (SEC-009)', async () => {
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);

      const ip = '198.51.100.42';

      for (let i = 0; i < 5; i++) {
        const res = await authService.signIn({
          email: 'victim@local.pc',
          password: `guess_${i}`,
          ipAddress: ip,
        });
        expect(res.success).toBe(false);
      }

      // 6th attempt must be RATE_LIMITED
      const blockedRes = await authService.signIn({
        email: 'victim@local.pc',
        password: 'another_guess',
        ipAddress: ip,
      });

      expect(blockedRes.success).toBe(false);
      expect(blockedRes.errorCode).toBe('RATE_LIMITED');
      expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('Sign-Out Flow', () => {
    it('deletes session from repository by token hash', async () => {
      vi.mocked(mockAuthRepo.deleteSessionByTokenHash).mockResolvedValue(true);

      const signedOut = await authService.signOut('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      expect(signedOut).toBe(true);
      expect(mockAuthRepo.deleteSessionByTokenHash).toHaveBeenCalled();
    });
  });
});
