# AI Provider Adapter Implementation Guide (Steps 28–30)

## 1. Overview & Purpose

This guide defines the engineering standards and contract compliance rules for implementing concrete AI Provider Adapters in future roadmap steps:
- **Step 28**: OpenAI Provider Adapter (`OpenAiProviderAdapter`)
- **Step 29**: OpenRouter Provider Adapter (`OpenRouterProviderAdapter`)
- **Step 30**: NVIDIA NIM Provider Adapter (`NimProviderAdapter`)

---

## 2. Adapter Interface Contract

All adapters must implement `AiProviderAdapter` from `src/server/providers/contracts/adapter.ts`:

```typescript
export interface AiProviderAdapter {
  readonly id: AiProviderId;
  getMetadata(): ProviderMetadata;
  getCapabilities(): ProviderCapabilities;
  testConnection(context: ProviderOperationContext): Promise<ProviderOperationResult<ConnectionTestResult>>;
  listModels(context: ProviderOperationContext): Promise<ProviderOperationResult<readonly ModelDefinition[]>>;
  generateText(
    request: NormalizedInferenceRequest,
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<NormalizedInferenceResponse>>;
}
```

---

## 3. Mandatory Implementation Rules

### 3.1 Credential Retrieval & Server-Only Boundaries
- All adapters must reside in `src/server/providers/adapters/<provider>/` with `import 'server-only';`.
- Decrypted API keys must be retrieved strictly using `ProviderCredentialService.getDecryptedCredential(context.userId, adapter.id)`.
- If the credential is missing, return a `MISSING_CREDENTIAL` error result without attempting network calls.

### 3.2 Endpoint Allowlist & SSRF Prevention
- Network calls must strictly target official approved domains:
  - OpenAI: `api.openai.com`
  - OpenRouter: `openrouter.ai`
  - NVIDIA NIM: `integrate.api.nvidia.com`
- Set `redirect: 'manual'` on all `fetch` dispatches to prevent credential leaks via HTTP redirects.
- Enforce strict 30-second timeouts using `AbortSignal.timeout(30000)`.

### 3.3 Request & Response Normalization
- Translate `NormalizedInferenceRequest` into the vendor's specific Chat Completions wire format.
- Map the vendor's response into `NormalizedInferenceResponse`.
- Normalize finish reasons into standard `FinishReason` values (`stop`, `length`, `content_filter`, `tool_calls`, `abort`, `error`, `unknown`).
- Extract token counts into `InferenceUsage`. Never fabricate missing token counts.

### 3.4 Error Classification & Sanitization
- Classify HTTP errors into `ProviderErrorCode`:
  - 401 -> `AUTH_FAILED`
  - 403 -> `PERMISSION_DENIED`
  - 429 -> `RATE_LIMITED`
  - 5xx -> `PROVIDER_UNAVAILABLE`
  - Abort -> `CANCELLED`
- Ensure raw API keys and authorization headers are completely excluded from error messages and log contexts.

### 3.5 Testing Standard
- All tests must use mocked responses or synthetic fixtures.
- **Strict Prohibition**: Zero live external network calls or paid API requests during automated test execution.
