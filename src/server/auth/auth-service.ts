import 'server-only';
import { AuthRepository } from '../persistence/repositories/auth.repository';
import { hashPassword, verifyPassword, generateSessionToken, hashSessionToken } from './crypto';
import { isRateLimited, recordFailedAttempt, resetFailedAttempts } from './rate-limiter';
import { toSafeUser, SafeUser, SESSION_MAX_AGE_SECONDS } from './session';
import { logger } from '@/lib/logging/logger';

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface SignInInput {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface AuthResult {
  success: boolean;
  user?: SafeUser;
  sessionToken?: string;
  expiresAt?: Date;
  error?: string;
  errorCode?: 'INVALID_CREDENTIALS' | 'RATE_LIMITED' | 'USER_EXISTS' | 'INVALID_INPUT' | 'ACCOUNT_INACTIVE' | 'INTERNAL_ERROR';
  retryAfterSeconds?: number;
}

export class AuthService {
  private readonly authRepo: AuthRepository;

  constructor(authRepo?: AuthRepository) {
    this.authRepo = authRepo ?? new AuthRepository();
  }

  /**
   * Registers a new user and creates an active session.
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const rateLimitKey = input.ipAddress || 'anonymous_ip';

    if (isRateLimited(rateLimitKey)) {
      return {
        success: false,
        error: 'Too many failed requests. Please try again later.',
        errorCode: 'RATE_LIMITED',
        retryAfterSeconds: 60,
      };
    }

    // Input validation
    const email = input.email?.trim().toLowerCase();
    if (!email || !email.includes('@') || email.length < 3 || email.length > 255) {
      return {
        success: false,
        error: 'Please provide a valid email address.',
        errorCode: 'INVALID_INPUT',
      };
    }

    if (!input.password || input.password.length < 8) {
      return {
        success: false,
        error: 'Password must be at least 8 characters long.',
        errorCode: 'INVALID_INPUT',
      };
    }

    if (input.password.length > 128) {
      return {
        success: false,
        error: 'Password cannot exceed 128 characters.',
        errorCode: 'INVALID_INPUT',
      };
    }

    // Check if user already exists
    try {
      const existing = await this.authRepo.findUserByEmail(email);
      if (existing) {
        return {
          success: false,
          error: 'An account with this email address already exists.',
          errorCode: 'USER_EXISTS',
        };
      }

      // Hash password using scrypt
      const passwordHash = await hashPassword(input.password);

      // Create user
      const user = await this.authRepo.createUser({
        email,
        password_hash: passwordHash,
        display_name: input.displayName ? input.displayName.trim().substring(0, 100) : null,
      });

      // Generate session
      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

      await this.authRepo.createSession({
        user_id: user.id,
        session_token_hash: sessionTokenHash,
        expires_at: expiresAt,
        user_agent: input.userAgent ?? null,
        ip_address: input.ipAddress ?? null,
      });

      resetFailedAttempts(rateLimitKey);

      logger.info('AUTH_USER_REGISTERED', 'User successfully registered', {
        userId: user.id,
      });

      return {
        success: true,
        user: toSafeUser(user),
        sessionToken,
        expiresAt,
      };
    } catch (err) {
      logger.error('AUTH_REGISTER_ERROR', 'Unexpected registration error', {
        error: (err as Error).message,
      });
      return {
        success: false,
        error: 'An unexpected error occurred during registration. Please try again.',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Authenticates a user with email and password and creates an active session.
   */
  async signIn(input: SignInInput): Promise<AuthResult> {
    const rateLimitKey = input.ipAddress || 'anonymous_ip';

    if (isRateLimited(rateLimitKey)) {
      return {
        success: false,
        error: 'Too many failed login attempts. Please try again in 1 minute.',
        errorCode: 'RATE_LIMITED',
        retryAfterSeconds: 60,
      };
    }

    const email = input.email?.trim().toLowerCase();
    if (!email || !input.password) {
      return {
        success: false,
        error: 'Please enter both email and password.',
        errorCode: 'INVALID_INPUT',
      };
    }

    try {
      const user = await this.authRepo.findUserByEmail(email);

      if (!user) {
        const rateStatus = recordFailedAttempt(rateLimitKey);
        logger.warn('AUTH_SIGNIN_FAILED_USER_NOT_FOUND', 'Sign-in failed: email not found', {
          rateLimited: rateStatus.isBlocked,
        });
        if (rateStatus.isBlocked) {
          return {
            success: false,
            error: 'Too many failed login attempts. Please try again in 1 minute.',
            errorCode: 'RATE_LIMITED',
            retryAfterSeconds: rateStatus.retryAfterSeconds,
          };
        }
        return {
          success: false,
          error: 'Invalid email or password.',
          errorCode: 'INVALID_CREDENTIALS',
          retryAfterSeconds: rateStatus.retryAfterSeconds,
        };
      }

      if (!user.is_active) {
        return {
          success: false,
          error: 'This account has been deactivated. Please contact support.',
          errorCode: 'ACCOUNT_INACTIVE',
        };
      }

      const isPasswordValid = await verifyPassword(input.password, user.password_hash);

      if (!isPasswordValid) {
        const rateStatus = recordFailedAttempt(rateLimitKey);
        logger.warn('AUTH_SIGNIN_FAILED_PASSWORD_MISMATCH', 'Sign-in failed: password mismatch', {
          userId: user.id,
          rateLimited: rateStatus.isBlocked,
        });
        if (rateStatus.isBlocked) {
          return {
            success: false,
            error: 'Too many failed login attempts. Please try again in 1 minute.',
            errorCode: 'RATE_LIMITED',
            retryAfterSeconds: rateStatus.retryAfterSeconds,
          };
        }
        return {
          success: false,
          error: 'Invalid email or password.',
          errorCode: 'INVALID_CREDENTIALS',
          retryAfterSeconds: rateStatus.retryAfterSeconds,
        };
      }


      // Success: generate unguessable session token
      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

      await this.authRepo.createSession({
        user_id: user.id,
        session_token_hash: sessionTokenHash,
        expires_at: expiresAt,
        user_agent: input.userAgent ?? null,
        ip_address: input.ipAddress ?? null,
      });

      resetFailedAttempts(rateLimitKey);

      logger.info('AUTH_SIGNIN_SUCCESS', 'User successfully authenticated', {
        userId: user.id,
      });

      return {
        success: true,
        user: toSafeUser(user),
        sessionToken,
        expiresAt,
      };
    } catch (err) {
      logger.error('AUTH_SIGNIN_ERROR', 'Unexpected authentication error', {
        error: (err as Error).message,
      });
      return {
        success: false,
        error: 'An unexpected authentication error occurred. Please try again.',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Terminates an active session by token.
   */
  async signOut(sessionToken: string): Promise<boolean> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      return false;
    }

    try {
      const tokenHash = hashSessionToken(sessionToken);
      return await this.authRepo.deleteSessionByTokenHash(tokenHash);
    } catch (err) {
      logger.error('AUTH_SIGNOUT_ERROR', 'Error during sign out', {
        error: (err as Error).message,
      });
      return false;
    }
  }
}
