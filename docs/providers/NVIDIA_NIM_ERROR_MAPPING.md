# VerityScout AI — NVIDIA NIM Error Mapping & Taxonomy Guide

**Document Version:** 1.0.0  
**Status:** Approved & Implemented  
**Governing Roadmap Step:** Step 30 (Phase 6: AI Providers)  
**Primary Mapping Source:** [`src/server/providers/adapters/nim/nim-mapper.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/providers/adapters/nim/nim-mapper.ts)

---

## 1. Overview & Objective

This document defines the deterministic mapping from NVIDIA NIM hosted API error payloads, HTTP status codes, and network exceptions to VerityScout AI's canonical `ProviderError` contract.

The design ensures:
1. **Accurate Classification:** Transparently categorizes authentication, quota, rate-limit, model availability, and platform errors.
2. **Zero Secret Leakage:** Automatically scrubs Bearer tokens and `nvapi-...` credentials from messages and diagnostic fields.
3. **Deterministic Retry Semantics:** Accurately designates transient vs permanent failure conditions.
4. **FastAPI/NIM Detail Parsing:** Handles both standard JSON error payloads (`{ error: { message, code } }`) and FastAPI validation details (`{ detail: string | array }`).

---

## 2. NVIDIA NIM Error Mapping Table

| HTTP Status / Condition | Provider Error Code | Is Retryable | Typical NVIDIA NIM Cause | Action / Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP 401** | `AUTH_FAILED` | `false` | Invalid `nvapi-...` key, expired token, or missing authorization header | Prompt user to verify API key in Settings > AI Providers |
| **HTTP 403** | `PERMISSION_DENIED` | `false` | Account lacks access to model, terms unaccepted, or subscription inactive | Check model access permissions on NVIDIA NGC |
| **HTTP 404** | `MODEL_UNAVAILABLE` | `false` | Requested model ID does not exist on hosted NIM or was mistyped | Verify publisher-qualified model name |
| **HTTP 429** | `RATE_LIMITED` | `true` | Request rate limit or credit quota exhausted on NVIDIA NIM account | Backoff with jitter, retry transiently |
| **HTTP 500 / 503** | `PROVIDER_UNAVAILABLE` | `true` | NVIDIA hosted infrastructure downtime or container capacity issues | Retry transiently with exponential backoff |
| **HTTP 400** | `INVALID_REQUEST` | `false` | Invalid JSON, unsupported generation parameter, or invalid type | Inspect request payload structure |
| **HTTP 422** | `INVALID_REQUEST` | `false` | FastAPI validation error (detail array) | Check parameter boundaries (e.g. temperature range) |
| **Timeout (> 30s)** | `TIMEOUT` | `true` | Network or model inference latency exceeded timeout threshold | Retry request or check connection stability |
| **AbortSignal Triggered** | `CANCELLED` | `false` | Caller cancelled operation before completion | Abort without retry |
| **Network / DNS / Reset** | `NETWORK_ERROR` | `true` | Socket hangup, connection refused, or TLS handshake failure | Retry with backoff |

---

## 3. Secret Redaction Rules

Before constructing a `ProviderError`, all raw messages pass through `sanitizeErrorMessage()`:
1. `Bearer\s+[^\s,;]+` is replaced with `Bearer [REDACTED]`.
2. `nvapi-[a-zA-Z0-9_-]{12,}` is replaced with `[REDACTED_API_KEY]`.
3. `sk-or-v1-[a-zA-Z0-9_-]{12,}` is replaced with `[REDACTED_API_KEY]`.
4. `sk-[a-zA-Z0-9_-]{12,}` is replaced with `[REDACTED_API_KEY]`.

This guarantees that upstream error responses echoing an invalid API key never reach application logs, client responses, or telemetry.
