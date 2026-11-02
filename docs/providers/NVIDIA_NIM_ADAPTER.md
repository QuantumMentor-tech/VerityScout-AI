# VerityScout AI — NVIDIA NIM Provider Adapter Specification

**Document Version:** 1.0.0  
**Status:** Approved & Implemented  
**Governing Roadmap Step:** Step 30 (Phase 6: AI Providers)  
**Implementation Date:** November 2026  
**Primary Implementation Files:**
- [`src/server/providers/adapters/nim/nim.types.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/providers/adapters/nim/nim.types.ts)
- [`src/server/providers/adapters/nim/nim-mapper.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/providers/adapters/nim/nim-mapper.ts)
- [`src/server/providers/adapters/nim/nim.adapter.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/providers/adapters/nim/nim.adapter.ts)
- [`src/server/providers/adapters/nim/index.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/providers/adapters/nim/index.ts)
- [`tests/unit/nim-adapter.test.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/tests/unit/nim-adapter.test.ts)

---

## 1. Executive Summary & Purpose

The **NVIDIA NIM Provider Adapter** (`NimProviderAdapter`) integrates NVIDIA's hosted NIM (NVIDIA Inference Microservice) API into VerityScout AI's common provider architecture established in Step 27. It fulfills the text generation contract (`generateText`), connection testing (`testConnection`), and model discovery (`listModels`) using pure TypeScript without vendor SDK lock-in.

The adapter adheres strictly to:
- **Canonical Provider Identifier:** `'nim'` (`AiProviderId`).
- **Server-Only Execution:** Enforced via Next.js `'server-only'` boundary.
- **User-Scoped Credential Isolation:** Decrypted credentials are fetched on-demand per request from the Step 25 AES-256-GCM vault and never cached globally.
- **Strict SSRF & Endpoint Protection:** Network requests are constrained to the approved origin (`https://integrate.api.nvidia.com`). Manual redirect handling (`redirect: 'manual'`) prevents token exfiltration across redirects.
- **Zero Live Calls in CI:** 100% of testing is conducted using synthetic credentials and mocked HTTP responses.

---

## 2. Official Documentation & Verification Sources

The implementation is verified against official NVIDIA documentation:
- **NVIDIA Hosted NIM LLM API Reference:** `https://docs.api.nvidia.com/nim/reference/llm-apis`
- **NVIDIA NIM LLM & VLM API Reference:** `https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html`
- **NVIDIA NIM Tutorials & Quickstart:** `https://docs.nvidia.com/nim/large-language-models/latest/tutorials.html`
- **NVIDIA NIM Supported Models:** `https://docs.nvidia.com/nim/large-language-models/latest/supported-models.html`
- **NVIDIA NIM Architecture Introduction:** `https://docs.nvidia.com/nim/large-language-models/latest/introduction.html`

*Verification Date:* November 2026.

---

## 3. Approved Deployment Model & Endpoint Selection

VerityScout AI MVP supports the **NVIDIA-Hosted NIM API** deployment model:
- **Base URL:** `https://integrate.api.nvidia.com/v1`
- **Inference Endpoint:** `POST https://integrate.api.nvidia.com/v1/chat/completions`
- **Model Listing Endpoint:** `GET https://integrate.api.nvidia.com/v1/models`
- **Connection Test Endpoint:** `GET https://integrate.api.nvidia.com/v1/models` (validated by `APPROVED_PROVIDER_TEST_ENDPOINTS.nim`)

### Self-Hosted NIM Scope Boundary
Self-hosted on-premises NIM containers (e.g. running on local DGX/H100 clusters with customized base URLs) share the OpenAI-compatible `/v1/chat/completions` API structure, but require trusted base URL overrides and isolated network ingress controls. In accordance with Section 4 of Step 30, arbitrary browser-supplied base URLs are forbidden to prevent SSRF vulnerabilities. Custom enterprise self-hosted deployment ingress will be addressed in future enterprise-grade roadmap increments.

---

## 4. Authentication & Wire Protocol

- **Header:** `Authorization: Bearer <API_KEY>`
- **Key Format:** NVIDIA Personal API Keys follow the pattern `nvapi-[a-zA-Z0-9_-]{12,}`.
- **Content Type:** `Content-Type: application/json`
- **Accept:** `Accept: application/json`
- **User Agent:** `VerityScout-AI/0.1.0 (Evidence-Synthesis)`

---

## 5. Model Reference Semantics

NVIDIA NIM hosted models use publisher-qualified naming conventions:
- `meta/llama-3.1-70b-instruct`
- `meta/llama-3.1-8b-instruct`
- `nvidia/nemotron-4-340b-instruct`
- `mistralai/mixtral-8x22b-instruct-v0.1`

The adapter strictly preserves publisher qualifications in `mapNormalizedRequestToNim()`. It does not trim or rewrite model identifiers, nor does it invent hardcoded production defaults. Empty or whitespace-only model references are rejected with an explicit validation error.

---

## 6. Request & Response Normalization

### Request Mapping (`mapNormalizedRequestToNim`)
Translates `NormalizedInferenceRequest` to `NimChatRequestPayload`:
- **Messages:** Mapped to `{ role, content }`. Supported roles: `system`, `user`, `assistant`. Tool role messages are rejected in MVP text generation.
- **Generation Parameters:**
  - `temperature`: Preserved if defined.
  - `max_tokens`: Mapped from `request.maxTokens`.
  - `stop`: Mapped from `request.stopSequences`.
  - `response_format`: Mapped to `{ type: 'json_object' }` if requested as `json_object` or `json_schema`.

### Response Normalization (`mapNimResponseToNormalized`)
Normalizes `NimChatResponsePayload` into `NormalizedInferenceResponse`:
- **Text Extraction:** Extracted from `choices[0].message.content` or `choices[0].message.refusal`.
- **Finish Reason:** Mapped accurately (`stop` -> `'stop'`, `length` -> `'length'`, `content_filter` -> `'content_filter'`, other -> `'unknown'`).
- **Usage Metadata:** Accurately extracts `prompt_tokens`, `completion_tokens`, and `total_tokens` when provided by NVIDIA NIM. If omitted, fields remain undefined (no token counts are fabricated).

---

## 7. Error Normalization & Taxonomy

Errors are normalized into the shared `ProviderError` contract via `mapNimHttpError()`:
- **401 Unauthorized / Token Error:** `AUTH_FAILED` (non-retryable).
- **403 Forbidden / Access Denied:** `PERMISSION_DENIED` (non-retryable).
- **404 Model Not Found:** `MODEL_UNAVAILABLE` (non-retryable).
- **429 Rate Limit / Quota Exceeded:** `RATE_LIMITED` (retryable).
- **500 / 503 Server Error:** `PROVIDER_UNAVAILABLE` (retryable).
- **400 Bad Request:** `INVALID_REQUEST` (non-retryable).
- **Timeout (> 30s):** `TIMEOUT` (retryable).
- **AbortSignal Aborted:** `CANCELLED` (non-retryable).
- **Transport / DNS / Socket Failure:** `NETWORK_ERROR` (retryable).

Detail formats from FastAPI/NIM (string or structured array) are safely parsed into sanitized diagnostic messages.

---

## 8. Security & Privacy Guarantees

1. **Zero Secret Leakage:**
   - Raw keys (`nvapi-...`, `sk-...`, `Bearer...`) are scrubbed by `sanitizeErrorMessage()` before errors are constructed or logged.
   - Keys are never included in API responses, logs, or client-side bundles.
2. **Per-Tenant Credential Isolation:**
   - Credential retrieval requires an explicit caller `userId`.
   - User A cannot access User B's NVIDIA key. Missing keys produce a clean `MISSING_CREDENTIAL` error without global fallback.
3. **SSRF Prevention:**
   - Host is validated against `APPROVED_PROVIDER_TEST_ENDPOINTS.nim.expectedHost` (`integrate.api.nvidia.com`).
   - Redirects are set to `redirect: 'manual'`, preventing silent credential forwarding to third-party endpoints.

---

## 9. Test Verification Summary

- **Unit Tests:** 29 tests in [`tests/unit/nim-adapter.test.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/tests/unit/nim-adapter.test.ts).
- **Total Provider Suite:** 121 tests passing across OpenAI, OpenRouter, and NVIDIA NIM adapters and registry.
- **Overall Project Suite:** 399 unit and contract tests passing across 44 test files.
- **Live Calls:** Confirmed 0 live calls or paid inference requests made.
