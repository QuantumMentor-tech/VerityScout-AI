# OpenRouter Provider Adapter Architecture & Implementation

## 1. Overview & Purpose

`OpenRouterProviderAdapter` is the concrete provider adapter connecting VerityScout AI's common provider subsystem (established in Step 27) to OpenRouter's multi-provider AI gateway.

The adapter implements the `AiProviderAdapter` interface defined in `src/server/providers/contracts/adapter.ts`, translating normalized request and response contracts into OpenRouter wire protocols while preserving the security, authentication, and credential boundaries from Steps 21 through 26.

---

## 2. API Operation Selection: Chat Completions API

OpenRouter exposes an OpenAI-compatible Chat Completions endpoint (`POST https://openrouter.ai/api/v1/chat/completions`):

### Why Chat Completions API:
1. **Universal Gateway Compatibility:** OpenRouter's primary routing and aggregation engine operates natively through standard Chat Completions across 200+ models from multiple publishers (Anthropic, Meta, Mistral, OpenAI, Google).
2. **Publisher-Qualified Model Routing:** Allows transparent routing to specific open-weights and proprietary models via publisher-qualified IDs (e.g. `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3.3-70b-instruct`).
3. **Upstream Serving Provider Telemetry:** OpenRouter response payloads return a top-level `provider` attribute (e.g. `"provider": "Anthropic"` or `"provider": "Together"`), revealing the underlying hardware or service that fulfilled the request.
4. **App Attribution Support:** Supports safe, non-secret application attribution headers (`HTTP-Referer` and `X-Title`) to participate in OpenRouter rankings and telemetry without leaking sensitive client context.

### Connection Testing:
Connection testing targets OpenRouter's authenticated key inspection endpoint (`GET https://openrouter.ai/api/v1/auth/key`), delegating safely to Step 26's `testProviderConnection`. No inference tokens are consumed during health checks.

---

## 3. Credential Access & Ownership Boundary

- **Zero Plaintext Credentials in Storage or Metadata:** Plaintext API keys never reside in static metadata, the provider registry, or browser bundles.
- **Authorized Decryption:** The adapter obtains the user's decrypted API key exclusively via `ProviderCredentialService.getDecryptedCredential(context.userId, 'openrouter')`.
- **Fail-Closed on Missing Credentials:** If a user has not configured an OpenRouter key, the adapter immediately halts and returns a normalized `MISSING_CREDENTIAL` error without attempting outbound network calls.
- **Tenant Isolation:** User A's execution context cannot access User B's credential. There is zero fallback to global environment variables or development test keys.

---

## 4. Model Identifier Handling

OpenRouter model identifiers strictly preserve the publisher prefix:
- `anthropic/claude-3.5-sonnet`
- `meta-llama/llama-3.3-70b-instruct`
- `mistralai/mixtral-8x7b-instruct`
- `openai/gpt-4o`

The adapter validates that the model string is non-empty and strictly preserves the publisher prefix. The application does not strip prefixes or assume OpenAI-only naming conventions.

---

## 5. Request Mapping (`mapNormalizedRequestToOpenRouter`)

| Normalized Field | OpenRouter Chat API Field | Mapping Logic |
|---|---|---|
| `modelRef.modelId` | `model` | Passed through directly with publisher prefix intact. |
| `messages` | `messages` | Mapped to array of `{ role, content }`. Supported roles: `system`, `user`, `assistant`. Tool messages are rejected in MVP text generation. |
| `temperature` | `temperature` | Forwarded when provided (clamped 0.0 to 2.0). |
| `maxTokens` | `max_tokens` | Mapped to maximum token ceiling. |
| `responseFormat` | `response_format` | `{ type: "json_object" }` for structured output. |
| `stopSequences` | `stop` | Array of stop string triggers. |

---

## 6. Response Normalization (`mapOpenRouterResponseToNormalized`)

- **Text Extraction:** Extracts text from `choices[0].message.content`.
- **Refusal Detection:** If a refusal string is returned in `choices[0].message.refusal`, it is preserved as the output text, and `finishReason` is normalized to `'content_filter'`.
- **Finish Reasons:** Mapped deterministically: `'stop'` -> `'stop'`, `'length'` -> `'length'`, `'content_filter'` -> `'content_filter'`.
- **Upstream Serving Provider Telemetry:** If OpenRouter includes the `provider` attribute (e.g. `'Anthropic'`), it is recorded in `rawFinishReason` as `stop;upstream:Anthropic` for internal diagnostic tracing.
- **Usage Metadata:** Maps `prompt_tokens` -> `promptTokens`, `completion_tokens` -> `completionTokens`, `total_tokens` -> `totalTokens`. If usage is omitted by upstream, fields remain `undefined` without fabricating token figures.
- **Latency & Timestamps:** Accurately measures execution round-trip duration in milliseconds (`latencyMs`) and records completion timestamp in ISO 8601.

---

## 7. Network Security & Transport Controls

- **Strict Allowlist:** All outbound requests strictly validate hostnames against `openrouter.ai` via `validateProviderEndpoint('openrouter', targetUrl)`.
- **Manual Redirects:** All `fetch` calls specify `redirect: 'manual'` to prevent secret-bearing `Authorization` headers from leaking across 3xx HTTP redirects.
- **30-Second Bounded Timeout:** Enforces a 30,000ms execution cap using internal `AbortController` linked with caller `context.abortSignal`.
- **Caller Cancellation:** If the client cancels the operation via `context.abortSignal`, execution terminates immediately and returns `CANCELLED`.

---

## 8. Unsupported Capabilities & Known Limitations

1. **Tool Calling / Function Invocation:** Not implemented in Step 29. Tool messages are rejected at the contract boundary.
2. **Provider Routing Preferences / Plugins:** OpenRouter-specific parameters such as `provider: { order: [...] }`, `transforms`, or fallback model lists are deferred to later routing steps.
3. **Dynamic Catalog Introspection:** Full model synchronization is deferred to Step 41 (Model Catalog). Model listing returns currently available models from the `/models` endpoint.
4. **Auto-Pick Routing:** Automatic routing between OpenAI, OpenRouter, and NIM is deferred to Step 42.

---

## 9. Official Documentation References

- OpenRouter API Overview: `https://openrouter.ai/docs/api-reference/overview`
- Authentication Guide: `https://openrouter.ai/docs/api-reference/authentication`
- Chat Completions API: `https://openrouter.ai/docs/api/api-reference/chat/create-chat-completion`
- Errors and Debugging: `https://openrouter.ai/docs/api-reference/errors-and-debugging`
- Rate Limits & Credits: `https://openrouter.ai/docs/api-reference/limits`
- Models API: `https://openrouter.ai/docs/api/api-reference/models/get-models`
