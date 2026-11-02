-- ==============================================================================
-- VerityScout AI — Migration 0002: Local Authentication & Sessions
-- ==============================================================================
-- Phase: 5 of 12 (Database, Authentication, and Persistence)
-- Step: 23 of 60
-- Governed by: ADR-010, SEC-006, SEC-007, SEC-009, OPEN-008
-- Purpose: Supports 100% self-hosted, local-first user authentication and
--          secure session management on the user's local machine.
-- ==============================================================================

-- 1. Local Authentication Users Table
CREATE TABLE IF NOT EXISTS auth_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_auth_users_email_len CHECK (length(email) >= 3 AND length(email) <= 255)
);

-- 2. Local Authentication Sessions Table
CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent VARCHAR(500) NULL,
    ip_address VARCHAR(45) NULL
);

-- Indexes for fast session lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

-- Enable PostgreSQL Row-Level Security
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies (fallback to own id when setting is unset)
CREATE POLICY tenant_isolation_auth_users ON auth_users
    USING (id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), id::text)::UUID)
    WITH CHECK (id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), id::text)::UUID);

CREATE POLICY tenant_isolation_auth_sessions ON auth_sessions
    USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id::text)::UUID)
    WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), user_id::text)::UUID);

