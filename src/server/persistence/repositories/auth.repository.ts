import 'server-only';
import { PoolClient } from 'pg';
import { AuthUserRow, AuthSessionRow } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateUserInput {
  email: string;
  password_hash: string;
  display_name?: string | null;
}

export interface CreateSessionInput {
  user_id: string;
  session_token_hash: string;
  expires_at: Date;
  user_agent?: string | null;
  ip_address?: string | null;
}

export class AuthRepository {
  /**
   * Finds a user by primary key UUID.
   */
  async findUserById(
    id: string,
    tx?: TransactionContext | PoolClient
  ): Promise<AuthUserRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT id, email, password_hash, display_name, is_active, created_at, updated_at
      FROM auth_users
      WHERE id = $1
      LIMIT 1
    `;
    const result = await executeQuery<AuthUserRow>(executor, sql, [id]);
    return result.rows[0] ?? null;
  }

  /**
   * Finds a user by normalized email address.
   */
  async findUserByEmail(
    email: string,
    tx?: TransactionContext | PoolClient
  ): Promise<AuthUserRow | null> {
    const executor = getExecutor(tx);
    const normalizedEmail = email.toLowerCase().trim();
    const sql = `
      SELECT id, email, password_hash, display_name, is_active, created_at, updated_at
      FROM auth_users
      WHERE LOWER(email) = $1
      LIMIT 1
    `;
    const result = await executeQuery<AuthUserRow>(executor, sql, [normalizedEmail]);
    return result.rows[0] ?? null;
  }

  /**
   * Creates a new user record with scrypt password hash.
   */
  async createUser(
    input: CreateUserInput,
    tx?: TransactionContext | PoolClient
  ): Promise<AuthUserRow> {
    const executor = getExecutor(tx);
    const normalizedEmail = input.email.toLowerCase().trim();
    const sql = `
      INSERT INTO auth_users (
        email,
        password_hash,
        display_name,
        is_active
      ) VALUES ($1, $2, $3, TRUE)
      RETURNING id, email, password_hash, display_name, is_active, created_at, updated_at
    `;
    const params = [
      normalizedEmail,
      input.password_hash,
      input.display_name ?? null,
    ];

    const result = await executeQuery<AuthUserRow>(executor, sql, params);
    const user = result.rows[0];
    if (!user) {
      throw new Error('Failed to create user record');
    }
    return user;
  }

  /**
   * Creates a new authenticated session for a user.
   */
  async createSession(
    input: CreateSessionInput,
    tx?: TransactionContext | PoolClient
  ): Promise<AuthSessionRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO auth_sessions (
        user_id,
        session_token_hash,
        expires_at,
        user_agent,
        ip_address
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, session_token_hash, expires_at, created_at, last_accessed_at, user_agent, ip_address
    `;
    const params = [
      input.user_id,
      input.session_token_hash,
      input.expires_at.toISOString(),
      input.user_agent ? input.user_agent.substring(0, 500) : null,
      input.ip_address ? input.ip_address.substring(0, 45) : null,
    ];

    const result = await executeQuery<AuthSessionRow>(executor, sql, params);
    const session = result.rows[0];
    if (!session) {
      throw new Error('Failed to create session record');
    }
    return session;
  }

  /**
   * Resolves a session and its associated active user by token hash.
   * Only returns the session if it has not expired and the user is active.
   */
  async findSessionByTokenHash(
    tokenHash: string,
    tx?: TransactionContext | PoolClient
  ): Promise<{ session: AuthSessionRow; user: AuthUserRow } | null> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.session_token_hash,
        s.expires_at,
        s.created_at AS session_created_at,
        s.last_accessed_at,
        s.user_agent,
        s.ip_address,
        u.id AS u_id,
        u.email,
        u.password_hash,
        u.display_name,
        u.is_active,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at
      FROM auth_sessions s
      JOIN auth_users u ON s.user_id = u.id
      WHERE s.session_token_hash = $1
        AND s.expires_at > NOW()
        AND u.is_active = TRUE
      LIMIT 1
    `;

    interface JoinedSessionUserRow {
      session_id: string;
      user_id: string;
      session_token_hash: string;
      expires_at: string;
      session_created_at: string;
      last_accessed_at: string;
      user_agent: string | null;
      ip_address: string | null;
      u_id: string;
      email: string;
      password_hash: string;
      display_name: string | null;
      is_active: boolean;
      user_created_at: string;
      user_updated_at: string;
    }

    const result = await executeQuery<JoinedSessionUserRow>(executor, sql, [tokenHash]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      session: {
        id: row.session_id,
        user_id: row.user_id,
        session_token_hash: row.session_token_hash,
        expires_at: row.expires_at,
        created_at: row.session_created_at,
        last_accessed_at: row.last_accessed_at,
        user_agent: row.user_agent,
        ip_address: row.ip_address,
      },
      user: {
        id: row.u_id,
        email: row.email,
        password_hash: row.password_hash,
        display_name: row.display_name,
        is_active: row.is_active,
        created_at: row.user_created_at,
        updated_at: row.user_updated_at,
      },
    };
  }

  /**
   * Updates last_accessed_at and optionally extends expires_at for sliding session renewal.
   */
  async touchSession(
    sessionId: string,
    newExpiresAt?: Date,
    tx?: TransactionContext | PoolClient
  ): Promise<void> {
    const executor = getExecutor(tx);
    if (newExpiresAt) {
      await executeQuery(
        executor,
        'UPDATE auth_sessions SET last_accessed_at = NOW(), expires_at = $2 WHERE id = $1',
        [sessionId, newExpiresAt.toISOString()]
      );
    } else {
      await executeQuery(
        executor,
        'UPDATE auth_sessions SET last_accessed_at = NOW() WHERE id = $1',
        [sessionId]
      );
    }
  }

  /**
   * Deletes a session by token hash (used on sign-out).
   */
  async deleteSessionByTokenHash(
    tokenHash: string,
    tx?: TransactionContext | PoolClient
  ): Promise<boolean> {
    const executor = getExecutor(tx);
    const result = await executeQuery(
      executor,
      'DELETE FROM auth_sessions WHERE session_token_hash = $1',
      [tokenHash]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Deletes all sessions for a user (used on password change or global sign-out).
   */
  async deleteSessionsByUserId(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    const executor = getExecutor(tx);
    const result = await executeQuery(
      executor,
      'DELETE FROM auth_sessions WHERE user_id = $1',
      [userId]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Periodic maintenance: removes expired sessions.
   */
  async cleanupExpiredSessions(tx?: TransactionContext | PoolClient): Promise<number> {
    const executor = getExecutor(tx);
    const result = await executeQuery(
      executor,
      'DELETE FROM auth_sessions WHERE expires_at <= NOW()'
    );
    return result.rowCount ?? 0;
  }
}
