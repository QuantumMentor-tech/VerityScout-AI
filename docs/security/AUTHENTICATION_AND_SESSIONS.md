# VerityScout AI — Authentication & Session Architecture

**Document Version:** 1.0.0  
**Status:** Approved & Implemented (Step 23 of 60)  
**Governed By:** ADR-010, SEC-006, SEC-007, SEC-009, OPEN-008  
**Scope:** Phase 5 (Database, Authentication, and Persistence)

---

## 1. Architectural Model & Decision

In accordance with user requirements for 100% free, private, self-hosted operation on local PC environments without mandatory cloud accounts or external identity provider fees:

- **Identity Engine:** Self-contained PostgreSQL-backed local authentication system (`auth_users` and `auth_sessions`).
- **Credential Storage:** `scrypt` password hashing algorithm ($N=16384, r=8, p=1$, 32-byte cryptographically secure salt, 64-byte key length).
- **Session Tokens:** Unguessable 256-bit cryptographically random tokens (`crypto.randomBytes(32)` in hex).
- **Token Persistence:** Raw session tokens are **never** stored in the database. Only SHA-256 deterministic hashes (`session_token_hash`) are persisted, protecting user sessions against database disclosure.
- **Session Delivery:** Transmitted solely via hardened `HttpOnly`, `SameSite=Lax`, `Secure` (production) browser cookies (`vs_session`).
- **Client Storage Invariant:** Zero authentication tokens, passwords, or session identifiers are placed in `localStorage` or `sessionStorage`.

---

## 2. Database Schema (Migration `0002_local_auth.sql`)

### 2.1 Table: `auth_users`
```sql
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
```

### 2.2 Table: `auth_sessions`
```sql
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
```

### 2.3 Row-Level Security
PostgreSQL Row-Level Security is enabled on both tables with tenant isolation policies referencing `app.current_user_id`:
```sql
CREATE POLICY tenant_isolation_auth_users ON auth_users
    USING (id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), id::text)::UUID)
    WITH CHECK (id = COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), id::text)::UUID);
```

---

## 3. Implemented Authentication Flows

### 3.1 Account Registration (`/register` & `POST /api/auth/register`)
- Input validation: Email format, password minimum length 8 characters, maximum 128 characters.
- Client-side confirmation: Password match validation before submission.
- Duplicate detection: Returns truthful error (`USER_EXISTS`) if email already registered.
- On success: Generates session, sets `vs_session` cookie, and returns sanitized `SafeUser`.

### 3.2 Sign-In (`/login` & `POST /api/auth/signin`)
- Validates credentials via `verifyPassword` using constant-time `crypto.timingSafeEqual` to prevent side-channel timing attacks.
- Enforces rate limiting per `SEC-009`: Max 5 failed attempts per minute per IP. The 6th consecutive failure triggers a 60-second lockout.
- On success: Resets failed attempt counter, generates session, sets `vs_session` cookie, and redirects safely.

### 3.3 Sign-Out (`POST /api/auth/signout`)
- Deletes session row from `auth_sessions` by token hash.
- Clears `vs_session` cookie by setting `maxAge: 0`.

### 3.4 Current User Resolution (`GET /api/auth/me` & `getCurrentUser()`)
- Resolves session from cookie on the server.
- Automatically handles sliding window extension: if the session has less than 3 days remaining before expiration, extends `expires_at` by 7 days.
- Sanitizes user object (`toSafeUser`), completely omitting `password_hash`.

---

## 4. Boundary Definition: Step 23 vs. Step 24

| Scope | Step 23 (Current) | Step 24 (Next) |
|---|---|---|
| Identity Establishment | Verified (Login & Registration) | Verified (Prerequisite) |
| Session Token Verification | Implemented (HttpOnly Cookie, SHA-256) | Active session dependency |
| User Identity Resolution | Implemented (`getCurrentUser()`, `/api/auth/me`) | Used to populate `app.current_user_id` |
| Route Guards & Middleware | Minimal UI state & safe redirects | Comprehensive middleware route protection |
| Resource Ownership Enforcement | Deferred to Step 24 | Full domain authorization across tasks/runs |
| RLS Data Layer Enforcement | Schema policies declared | Enforced on every repository query |
