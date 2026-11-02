# OpenAI Provider Adapter Architecture & Implementation

## 1. Overview & Purpose

`OpenAiProviderAdapter` is the concrete provider adapter connecting VerityScout AI's common provider subsystem (established in Step 27) to OpenAI's inference infrastructure.

The adapter implements the `AiProviderAdapter` interface defined in `src/server/providers/contracts/adapter.ts`, translating normalized request and response contracts into OpenAI wire protocols while preserving the security, authentication, and credential boundaries from Steps 21 through 26.

---

## 2. API Operation Selection: OpenAI Responses API

In accordance with current OpenAI official guidance (see [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)), this adapter primarily targets the **OpenAI Responses API** (`POST https://api.openai.com/v1/responses`):

### Why Responses API:
1. **Modern Standard:** Represents OpenAI's consolidated, stateful-compatible interface for frontier reasoning and chat models (GPT-4o, o1, o3-mini).
2. **Explicit Status Model:** Provides first-class `status` tracking (`completed`, `in_progress`, `incomplete`, `failed`) and structured `incomplete_details` (e.g. `max_output_tokens`, `content_filter`), distinguishing clean completion from truncated output.
3. **Refusal Handling:** Distinguishes model-level policy refusals (`{ type: "refusal", refusal: "..." }`) from standard output text, ensuring safety policy events are mapped deterministically to `finishReason: "content_filter"`.
4. **Normalized Usage:** Exposes `input_tokens`, `output_tokens`, and `total_tokens` directly in the response payload.

### Connection Testing:
Connection testing targets the lightweight, non-inference models probe (`GET https://api.openai.com/v1/models`), delegating safely to Step 26's `testProviderConnection`. No paid inference or text-generation operations are ever executed to test basic connectivity.

---

## 3. Credential Access & Ownership Boundary

- **Zero Plaintext Credentials in Storage or Metadata:** Plaintext API keys never reside in static metadata, the provider registry, or browser bundles.
- **Authorized Decryption:** The adapter obtains the user's decrypted API key exclusively via `ProviderCredentialService.getDecryptedCredential(context.userId, 'openai')`.
- **Fail-Closed on Missing Credentials:** If a user has not configured an OpenAI key, the adapter immediately halts and returns a normalized `MISSING_CREDENTIAL` error without attempting any outbound network calls.
- **Tenant Isolation:** User A's execution context cannot access User B's credential. There is zero fallback to global environment variables (`OPENAI_API_KEY`) or development test keys.

---

## 4. Request Mapping (`mapNormalizedRequestToOpenAiResponses`)

| Normalized Field | OpenAI Responses API Field | Mapping Logic |
|---|---|---|
| `modelRef.modelId` | `model` | Passed through directly (e.g. `gpt-4o`, `gpt-4o-mini`). |
| `messages` | `input` | Mapped to array of `{ role, content }`. Supported roles: `system`, `user`, `assistant`. Tool messages are rejected in MVP text generation. |
| `temperature` | `temperature` | Forwarded when provided (clamped 0.0 to 2.0). |
| `maxTokens` | `max_output_tokens` | Mapped to output token ceiling. |
| `responseFormat` | `response_format` | `{ type: "json_object" }` for structured output; `{ type: "text" }` otherwise. |
| `stopSequences` | `stop` | Array of stop string triggers. |

---

## 5. Response Normalization (`mapOpenAiResponsesToNormalized`)

- **Text Extraction:** Traverses `payload.output` items of `type === 'message'`, aggregating all `content` segments of `type === 'output_text'`.
- **Refusal Detection:** If a refusal segment is present, the refusal explanation is preserved as output text, and `finishReason` is normalized to `'content_filter'`.
- **Incomplete Outcomes:** If `status === 'incomplete'`, checks `incomplete_details.reason`. If `max_output_tokens`, sets `finishReason: 'length'`. If `content_filter`, sets `finishReason: 'content_filter'`.
- **Usage Metadata:** Maps `input_tokens` -> `promptTokens`, `output_tokens` -> `completionTokens`, `total_tokens` -> `totalTokens`. If usage is omitted by upstream, fields are left `undefined` without fabricating token figures.
- **Latency & Timestamps:** Accurately measures execution round-trip duration in milliseconds (`latencyMs`) and records completion timestamp in ISO 8601.

---

## 6. Network Security & Transport Controls

- **Strict Allowlist:** All outbound requests strictly validate hostnames against `api.openai.com` via `validateProviderEndpoint('openai', targetUrl)`.
- **Manual Redirects:** All `fetch` calls specify `redirect: 'manual'` to prevent secret-bearing `Authorization` headers from leaking across 3xx HTTP redirects.
- **30-Second Bounded Timeout:** Enforces a 30,000ms execution cap using internal `AbortController` linked with caller `context.abortSignal`.
- **Caller Cancellation:** If the client cancels the operation via `context.abortSignal`, execution terminates immediately and returns `CANCELLED`.

---

## 7. Unsupported Capabilities & Known Limitations

1. **Tool Calling / Function Invocation:** Not implemented in Step 28. Tool messages are rejected at the contract boundary.
2. **Vision / Multimodal File Uploads:** Image and audio attachments are deferred until multimodal roadmap phases.
3. **Dynamic Catalog Introspection:** Full model synchronization is deferred to Step 41 (Model Catalog). Model listing returns currently available models from the `/v1/models` probe.
4. **Auto-Pick Routing:** Automatic routing between OpenAI, OpenRouter, and NIM is deferred to Step 42.

---

## 8. Official Documentation References

- OpenAI API Documentation: `https://developers.openai.com/api/docs/`
- Responses API Migration Guide: `https://developers.openai.com/api/docs/guides/migrate-to-responses`
- Error Codes & Handling: `https://developers.openai.com/api/docs/guides/error-codes`
- Production Best Practices: `https://developers.openai.com/api/docs/guides/production-best-practices`
