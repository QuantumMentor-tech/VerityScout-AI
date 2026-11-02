# OpenAI Error Normalization & Taxonomy

## 1. Overview & Policy

The `OpenAiProviderAdapter` translates OpenAI HTTP status codes and API error payloads into VerityScout AI's normalized `ProviderError` contract (`src/server/providers/contracts/operation-result.ts`).

### Core Guarantees:
1. **Zero Secret Leakage:** Error messages are aggressively sanitized using `sanitizeErrorMessage` to scrub API key patterns (`sk-...`, `nvapi-...`) and Bearer tokens before reaching logs or client responses.
2. **Deterministic Retryability:** Transient failures (rate limits, network drops, server outages) are marked `isRetryable: true`. Non-transient configuration or client errors (invalid keys, permission denied, bad parameters) are marked `isRetryable: false`.
3. **No Automatic Provider Fallback:** An OpenAI failure returns a structured `ProviderOperationResult` with `success: false`. The adapter never silently falls back to OpenRouter or NVIDIA NIM.

---

## 2. HTTP Status & Code Mapping Table

| HTTP Status | OpenAI Error Code / Type | Normalized ProviderErrorCode | Retryable? | Semantic Meaning |
|---|---|---|---|---|
| **401** | `invalid_api_key` | `AUTH_FAILED` | No | API key revoked, invalid, or malformed. |
| **403** | `unsupported_country_region_territory` | `PERMISSION_DENIED` | No | Access forbidden by regional or organization policies. |
| **404** | `model_not_found` | `MODEL_UNAVAILABLE` | No | Model ID does not exist or user lacks access. |
| **429** | `rate_limit_exceeded` | `RATE_LIMITED` | Yes | Request/token per minute limit reached. |
| **429** | `insufficient_quota` | `RATE_LIMITED` | Yes | Account credits depleted. |
| **400** | `context_length_exceeded` / `invalid_request_error` | `INVALID_REQUEST` | No | Prompt exceeds context limit or invalid parameters. |
| **500, 502, 503, 504** | `server_error` / `service_unavailable` | `PROVIDER_UNAVAILABLE` | Yes | Upstream OpenAI infrastructure downtime or transient overload. |
| **Client Abort** | `AbortError` | `CANCELLED` | No | Request cancelled by caller via `AbortSignal`. |
| **Timeout (30s)**| `AbortError` (timeout trigger) | `TIMEOUT` | Yes | Request exceeded 30,000ms wall-clock limit. |
| **Network Error** | `TypeError: fetch failed` | `NETWORK_ERROR` | Yes | DNS resolution failure or TCP connection drop. |

---

## 3. Secret Sanitization Implementation

OpenAI error messages frequently reflect back the user's API key (e.g. `"Incorrect API key provided: sk-proj-123456789... You can find your API key at..."`).

The sanitization routine in `openai-mapper.ts` executes sequential redaction:
```typescript
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/nvapi-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]');
}
```

This ensures that neither raw canary keys nor production credentials ever appear in application logs, database records, or frontend UI alerts.
