# OpenRouter Error Normalization & Taxonomy

## 1. Overview & Policy

The `OpenRouterProviderAdapter` translates OpenRouter HTTP status codes, gateway errors, and upstream provider failures into VerityScout AI's normalized `ProviderError` contract (`src/server/providers/contracts/operation-result.ts`).

### Core Guarantees:
1. **Distinct Credit Exhaustion Classification:** OpenRouter HTTP 402 responses and credit-limit failures are normalized as `INSUFFICIENT_CREDITS` (`isRetryable: false`), cleanly separating payment/budget exhaustion from temporary request rate limiting (HTTP 429).
2. **Platform vs Upstream Rate Limits:** Differentiates OpenRouter platform rate limits from upstream model provider capacity drops using `metadata.error_type` and `metadata.provider_name`.
3. **Zero Secret Leakage:** Aggressively scrubs OpenRouter API keys (`sk-or-v1-...`), OpenAI-style keys (`sk-...`), and Bearer tokens before errors reach logs or client responses.
4. **No Automatic Provider Fallback:** An OpenRouter failure returns a structured `ProviderOperationResult` with `success: false`. The adapter never silently falls back to OpenAI or NVIDIA NIM.

---

## 2. HTTP Status & Code Mapping Table

| HTTP Status | OpenRouter Error Metadata / Type | Normalized ProviderErrorCode | Retryable? | Semantic Meaning |
|---|---|---|---|---|
| **401** | Invalid API key | `AUTH_FAILED` | No | API key revoked, invalid, or malformed. |
| **402** | `insufficient_credits` / `key_limit_reached` | `INSUFFICIENT_CREDITS` | No | User balance exhausted or key monthly spend cap reached. |
| **403** | Moderation flag / forbidden | `PERMISSION_DENIED` | No | Access forbidden by safety moderation or key permissions. |
| **404** | `model_not_found` | `MODEL_UNAVAILABLE` | No | Requested model ID does not exist or is deprecated. |
| **429** | `platform_rate_limit` (standard RPM/TPM) | `RATE_LIMITED` | Yes | OpenRouter platform rate limit exceeded. |
| **429** | `provider_rate_limit` / `provider_capacity` | `RATE_LIMITED` | Yes | Upstream model provider (e.g. Anthropic, Together) capacity bottleneck. |
| **400** | Invalid request parameters / malformed prompt | `INVALID_REQUEST` | No | Request validation failure. |
| **500, 502, 503**| Upstream host error / gateway timeout | `PROVIDER_UNAVAILABLE` | Yes | Gateway outage or upstream provider failure. |
| **Client Abort** | `AbortError` | `CANCELLED` | No | Request cancelled by caller via `AbortSignal`. |
| **Timeout (30s)**| `AbortError` (timeout trigger) | `TIMEOUT` | Yes | Request exceeded 30,000ms wall-clock limit. |
| **Network Error** | `TypeError: fetch failed` | `NETWORK_ERROR` | Yes | DNS resolution failure or TCP connection drop. |

---

## 3. Secret Sanitization Implementation

OpenRouter error messages and header traces are scrubbed via `sanitizeErrorMessage`:
```typescript
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-or-v1-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/nvapi-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]');
}
```

This guarantees that neither production OpenRouter keys nor synthetic canary keys ever appear in application logs, database records, or frontend UI alerts.
