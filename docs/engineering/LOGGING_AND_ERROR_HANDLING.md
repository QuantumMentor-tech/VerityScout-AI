# VerityScout AI — Logging Architecture, Secret Redaction & Safe Error Handling

**Document ID:** `ENG-LOG-001`  
**Version:** `1.0.0`  
**Status:** `ACTIVE / FROZEN`  
**Step Alignment:** Step 9 of 60 (Phase 2: Project Setup and Toolchain)  
**Last Updated:** 2026-10-30  

---

## 1. Structured Logging Architecture

VerityScout AI enforces structured, machine-readable JSON logging at [`src/lib/logging/logger.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/lib/logging/logger.ts).

### 1.1 Log Record Specification

Every log entry is serialized as a single-line JSON string:

```json
{
  "timestamp": "2026-10-30T12:00:00.000Z",
  "level": "info",
  "event": "APP_STARTUP",
  "message": "VerityScout AI server initialized",
  "correlationId": "req-abc123xyz",
  "context": {
    "nodeEnv": "development",
    "port": 3000
  }
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `timestamp` | `string` (ISO 8601) | Exact UTC timestamp of event generation. |
| `level` | `'debug' \| 'info' \| 'warn' \| 'error'` | Severity level. |
| `event` | `string` (Upper Snake Case) | Stable, machine-queryable identifier. |
| `message` | `string` | Human-readable explanation (sanitized). |
| `correlationId` | `string` (Optional) | Trace or request correlation identifier. |
| `context` | `Record<string, unknown>` | Structured metadata passed through defensive redaction. |

### 1.2 Severity Thresholds

- `debug`: Detailed diagnostics during local development. Suppressed in production by default.
- `info`: Key operational milestones (e.g. server startup, job dispatch).
- `warn`: Non-fatal issues (e.g. rate limit approaching, secondary provider fallback).
- `error`: Unhandled failures, network exceptions, or critical invariants violated. Written to `process.stderr`.

---

## 2. Defensive Secret Redaction Policy

To prevent accidental data leakage into log management platforms, all logs pass through multi-layer sanitization:

### 2.1 Sensitive Key Name Redaction

Any object property whose key matches sensitive patterns is masked with `"[REDACTED]"`:
- `password`, `passwd`
- `secret`, `clientSecret`
- `token`, `accessToken`, `refreshToken`, `authToken`
- `apiKey`, `api_key`
- `authorization`
- `cookie`, `setCookie`, `set-cookie`
- `privateKey`, `private_key`
- `session`
- `connectionString`, `databaseUrl`, `db_url`

### 2.2 In-String Pattern Redaction

Even when credentials appear inside arbitrary text strings or URLs, regex filters redact them:
- **Bearer Tokens:** `Bearer <token>` $\rightarrow$ `Bearer [REDACTED]`
- **API Keys:** `sk-<key>` $\rightarrow$ `[REDACTED_API_KEY]`
- **JWTs:** `ey...` $\rightarrow$ `[REDACTED_JWT]`
- **Database URLs:** `postgres://user:password@host` $\rightarrow$ `postgres://user:[REDACTED]@host`
- **Query Params:** `?token=...`, `?key=...` $\rightarrow$ `?token=[REDACTED]`

### 2.3 Fail-Closed Principle

If context sanitization throws an unhandled error (e.g., throwing getters or proxy traps), the logger emits an emergency record with `error: "[REDACTED_SANITIZATION_FAILED]"` and never outputs the raw context.

### 2.4 Log-Injection Protection

All log messages have carriage returns (`\r`) and newlines (`\n`) neutralized to prevent attackers from injecting fake JSON log records into output streams.

---

## 3. Safe Application Error Handling

Client-facing error handling is implemented across three coordinated boundaries:

### 3.1 Typed Errors ([`src/lib/errors/app-error.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/lib/errors/app-error.ts))

- **`AppError`:**
  - `code`: Stable error code (`VALIDATION_ERROR`, `INTERNAL_SERVER_ERROR`, `NOT_FOUND`, etc.).
  - `isOperational`: Flag distinguishing expected domain validation errors (`true`) from unexpected software crashes (`false`).
  - `publicMessage`: Safe description cleared for public end-user display.
  - `message`: Internal technical diagnostic string (logged server-side, never returned to client).

### 3.2 Safe Error Normalization (`normalizeError(error)`)

- Known operational errors return their approved `publicMessage`.
- Non-operational or raw runtime errors (`Error`, string throws, null) are masked with:
  ```json
  {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred. Please try again later.",
    "statusCode": 500
  }
  ```
- Stack traces, database query strings, and system paths are **never** exposed to clients.

### 3.3 Next.js Error Boundaries

1. **[`src/app/error.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/app/error.tsx):**
   Client Component catching route rendering failures. Presents a calm, styled message and "Try Again" recovery action (`reset()`), without exposing technical error details.
2. **[`src/app/global-error.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/app/global-error.tsx):**
   Layout-level fallback catching root layout errors.
3. **[`src/app/not-found.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/app/not-found.tsx):**
   Accessible 404 page for unmatched routes.

---

## 4. Verification Testing

The testing suite validates all safety boundaries:
- `tests/unit/config.test.ts` (7 tests): Validates Zod schema, defaults, invalid enum rejection, and zero secret echoing.
- `tests/unit/logger.test.ts` (6 tests): Validates JSON structure, level filtering, key redaction, pattern redaction, newline injection, and circular reference handling.
- `tests/unit/errors.test.ts` (4 tests): Validates operational message preservation and masking of raw technical exceptions.

Run the full suite:
```bash
npm run test
```
