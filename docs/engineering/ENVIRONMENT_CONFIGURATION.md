# VerityScout AI — Environment Configuration & Secret Hygiene Guide

**Document ID:** `ENG-CONFIG-001`  
**Version:** `1.0.0`  
**Status:** `ACTIVE / FROZEN`  
**Step Alignment:** Step 9 of 60 (Phase 2: Project Setup and Toolchain)  
**Last Updated:** 2026-10-30  

---

## 1. Purpose of the Environment Configuration Boundary

VerityScout AI enforces a centralized, typed, schema-validated configuration boundary at [`src/lib/config/server-env.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/lib/config/server-env.ts).

The objectives are:
1. **Prevent Scattered `process.env` Access:** Avoid ad-hoc, type-unsafe references to raw environment variables across application modules.
2. **Fail Fast on Invalid Configurations:** Validate all required and optional runtime settings during initialization using Zod schemas.
3. **Prevent Secret Leakage in Error Outputs:** If an environment variable fails validation, the error reports only the field name, never echoing the supplied value.
4. **Hard Server/Client Isolation:** Restrict server configuration from being imported into Client Components or leaked into browser bundles via the `server-only` compiler guard.

---

## 2. Active Environment Variables (Step 9 Baseline)

Only settings required by the current application foundation are validated today. Speculative variables for future services are intentionally deferred:

| Variable | Type | Default | Required? | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`NODE_ENV`** | `'development' \| 'test' \| 'production'` | `'development'` | Optional | Node.js execution runtime mode. |
| **`LOG_LEVEL`** | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Optional | Minimum logging severity threshold. |
| **`APP_URL`** | `string` (valid URL format) | `'http://localhost:3000'` | Optional | Canonical base URL for local routing and callbacks. |
| **`PORT`** | `number` (integer 1–65535) | `3000` | Optional | Local HTTP server listener port. |

---

## 3. Local Environment Files and Secret Hygiene

1. **`.env.example`:**
   A tracked, safe template containing only documented variable names and non-sensitive illustrative defaults. Real API keys, database credentials, or secret tokens are strictly forbidden in this file.
2. **`.env.local`:**
   Untracked, local-only override file excluded by `.gitignore`. Used by developers for machine-specific settings.
3. **`NEXT_PUBLIC_` Exposure Rules:**
   - Any variable prefixed with `NEXT_PUBLIC_` is inlined into JavaScript bundles sent to the browser during `next build`.
   - **Rule:** Never prefix credentials, private keys, database URLs, or provider secrets with `NEXT_PUBLIC_`.
   - Any sensitive setting must remain server-only.

---

## 4. Server-Only Protection (`import 'server-only'`)

[`src/lib/config/server-env.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/lib/config/server-env.ts) imports `server-only`. If any Client Component (`'use client'`) attempts to import `server-env.ts`, the Next.js compiler immediately halts the build with an error:
```text
Error: This module cannot be imported from a Client Component module. It should only be used from a Server Component.
```

---

## 5. Safe Configuration Validation Behavior

Validation is implemented via `validateServerEnv(rawEnv)`:
- Accepts a dictionary of strings (`Record<string, string | undefined>`).
- Parses using `ServerEnvSchema`.
- On failure, throws `ConfigValidationError`:
  ```ts
  throw new ConfigValidationError(['APP_URL']);
  // Output message: "Configuration validation failed for fields: APP_URL"
  ```
- **Zero Secret Echo:** The error message lists only the paths of invalid fields. It never echoes the invalid string or surrounding memory.

---

## 6. How Future Variables Must Be Introduced

When future steps implement external subsystems (e.g. Phase 3 Search Providers, Phase 5 LLM Adapters, Phase 6 Database):
1. **Define in `ServerEnvSchema`:** Add the field with explicit Zod constraints (e.g. `z.string().min(1)` for required secrets).
2. **Update `.env.example`:** Add the variable name with an explanatory comment and placeholder (e.g. `TAVILY_API_KEY=tvly-placeholder`).
3. **Add Validation Unit Tests:** Append test cases in `tests/unit/config.test.ts`.
4. **Preserve Lazy Initialization:** Avoid importing server configuration into static routes to maintain SSG compatibility.

---

## 7. Deferred Configuration Variables

The following variables are planned in the architectural roadmap but are **intentionally not required** in Step 9:
- **Phase 3 (Search Providers):** `TAVILY_API_KEY`, `EXA_API_KEY`
- **Phase 5 (AI Models):** `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_NIM_API_KEY`
- **Phase 6 (Persistence & Queue):** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`
