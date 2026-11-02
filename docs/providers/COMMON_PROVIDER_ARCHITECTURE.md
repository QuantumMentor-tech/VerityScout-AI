# Common AI Provider Architecture & Contracts

## 1. Executive Summary & Architectural Goals

VerityScout AI is an evidence-focused autonomous web research and product-discovery engine. Generating evidence synthesis requires robust, reliable, and vendor-agnostic interactions with multiple frontier AI providers.

The common AI provider layer established in Step 27 provides a strongly typed, server-only abstraction foundation that:
1. **Decouples application logic from provider wire formats**: Domain features interact solely with normalized request and response contracts rather than raw vendor payloads.
2. **Maintains strict separation between declarations and availability**: Static metadata, declared model capabilities, credential vault configuration, connection health, and live runtime availability remain strictly decoupled.
3. **Preserves security boundaries**: User API credentials reside exclusively within the AES-256-GCM encrypted vault (Step 25) accessed via authenticated owner permissions (Step 24). Credentials never appear in static metadata, registry tables, or client DTOs.
4. **Enforces a unified error and result taxonomy**: All provider interactions return a discriminated union (`ProviderOperationResult<T>`) with classified, non-secret error codes and deterministic retryability.

---

## 2. Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                           Application / UI Layer                                  |
|   (Research Synthesizer, Evidence Evaluator, Settings Management [Client])        |
+-----------------------------------------------------------------------------------+
                                         |
                                         | Normalized Contracts & DTOs
                                         v
+-----------------------------------------------------------------------------------+
|               Server-Only Boundary: Provider Subsystem                            |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                           AiProviderRegistry                                |  |
|  |   - getKnownProviders()                                                     |  |
|  |   - getProviderMetadata(id)                                                 |  |
|  |   - getProviderCapabilities(id)                                             |  |
|  |   - registerAdapter(adapter)                                                |  |
|  |   - testConnection(id, ctx) --------> Registered Adapter OR Fallback Probe  |  |
|  |   - generateText(req, ctx)   --------> Dispatches to Registered Adapter     |  |
|  +-----------------------------------------------------------------------------+  |
|                                         |                                         |
|                 +-----------------------+-----------------------+                 |
|                 v                                               v                 |
|  +-----------------------------+                 +-----------------------------+  |
|  |   Concrete Adapters         |                 |   Security & Vault Boundary |  |
|  |   (Steps 28-30)             |                 |   (Steps 24-25)             |  |
|  |   - OpenAI (Step 28)        |                 |   - ProviderCredentialService|  |
|  |   - OpenRouter (Step 29)    |                 |   - AES-256-GCM Decryption  |  |
|  |   - NVIDIA NIM (Step 30)    |                 |   - Owner Authorization     |  |
|  +-----------------------------+                 +-----------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Canonical Provider Identity Rules

1. **Approved Initial Set**:
   - `openai`: OpenAI frontier models (GPT-4o, o1, etc.).
   - `openrouter`: OpenRouter multi-model gateway and routing aggregator.
   - `nim`: NVIDIA NIM hardware-accelerated microservices.
2. **Canonical Identifiers**:
   - The lowercase string literals `'openai'`, `'openrouter'`, `'nim'` are the only approved identifiers (`AiProviderId`).
   - Display labels, brand names, and categories are non-normative metadata and must never be used as keys or database identifiers.
3. **No Dynamic or Arbitrary Providers**:
   - Unrecognized strings are rejected at boundary assertion points with a descriptive `TypeError`.

---

## 4. Metadata and Integration Lifecycle

Each known provider possesses a `ProviderMetadata` definition describing:
- `id`: Canonical `AiProviderId`.
- `name`: Display name.
- `description`: Safe functional summary.
- `category`: Functional grouping.
- `docsUrl`: Official documentation link.
- `keyPlaceholder`: Safe format hint for UI inputs (e.g. `sk-proj-...`).
- `helpText`: Guidance for generating keys on provider dashboards.
- `integrationStatus`: Explicit lifecycle state.
- `supportedOperations`: Array of supported operation types (`CONNECTION_TEST`, `LIST_MODELS`, `GENERATE_TEXT`).
- `defaultCapabilities`: Baseline trinary capabilities grounded in official provider documentation.
- `defaultEndpoint`: Secure HTTPS base URL.
- `allowedHosts`: Strict hostname allowlist preventing SSRF.

### Integration Lifecycle States
- `KNOWN`: Provider is recognized by application requirements, but contracts are not yet formally defined.
- `CONTRACT_DEFINED`: Interface contracts, capability metadata, and test strategies are established (current state at Step 27).
- `ADAPTER_IMPLEMENTED`: A concrete executable adapter class has been registered in the registry (Steps 28–30).
- `OPERATIONAL`: Adapter is verified in production with active end-to-end telemetry and validation.
- `DEPRECATED`: Provider is scheduled for phase-out; new runs should not select it.
- `BLOCKED`: Provider is temporarily disabled due to upstream outage, regulatory, or policy constraints.

---

## 5. Normalized Inference Contracts

Domain features formulate inference requests using `NormalizedInferenceRequest`:
- `modelRef`: `{ providerId: AiProviderId; modelId: string }`.
- `messages`: Non-empty array of `{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }`.
- `temperature`: Optional number clamped between `0.0` and `2.0`.
- `maxTokens`: Optional positive integer.
- `responseFormat`: Optional structured format specification (`text`, `json_object`, `json_schema`).
- `stopSequences`: Optional array of stop strings.
- `abortSignal`: Client cancellation signal.
- `correlationId`: Correlation identifier for distributed tracing and structured audit logging.

Responses normalize output into `NormalizedInferenceResponse`:
- `text`: Extracted generation content.
- `finishReason`: Normalized termination status (`stop`, `length`, `content_filter`, `tool_calls`, `abort`, `error`, `unknown`).
- `usage`: Structured token counts (`promptTokens`, `completionTokens`, `totalTokens`).
- `modelRef`: Target model reference.
- `latencyMs`: Elapsed execution duration in milliseconds.
- `completedAt`: ISO 8601 completion timestamp.

---

## 6. Operation Results and Error Handling

All provider operations return a discriminated union `ProviderOperationResult<T>`:
```typescript
export type ProviderOperationResult<T> =
  | { readonly success: true; readonly data: T; readonly latencyMs: number }
  | { readonly success: false; readonly error: ProviderError; readonly latencyMs: number };
```

### Sanitized Error Taxonomy
- `AUTH_FAILED`: Invalid API key or revoked credentials (non-retryable).
- `PERMISSION_DENIED`: Valid key lacks required model permissions (non-retryable).
- `RATE_LIMITED`: Upstream quota or concurrency limit reached (retryable).
- `PROVIDER_UNAVAILABLE`: Upstream 5xx service outage (retryable).
- `NETWORK_ERROR`: DNS or TLS transport disruption (retryable).
- `TIMEOUT`: Request exceeded configured timeout threshold (retryable).
- `UNSUPPORTED_OPERATION`: Operation requested on provider without an adapter (non-retryable).
- `INVALID_REQUEST`: Malformed parameters or prompt payload (non-retryable).
- `MODEL_UNAVAILABLE`: Specified model ID not accessible or deprecated (non-retryable).
- `CANCELLED`: Operation cancelled via `AbortSignal` (non-retryable).
- `UNKNOWN_PROVIDER_ERROR`: Unclassified failure mode (non-retryable).

Zero plaintext keys or auth headers are ever placed in error messages or diagnostics.

---

## 7. Registry Implementation & Discovery

The `AiProviderRegistry`:
- Acts as the central lookup authority for provider metadata and registered adapters.
- Prohibits duplicate registrations and rejects unknown provider IDs.
- For connection tests: delegates to the registered adapter if present; otherwise seamlessly falls back to Step 26's `testProviderConnection` probe.
- For text generation: immediately rejects requests with `UNSUPPORTED_OPERATION` if no adapter is registered, rather than pretending an unimplemented adapter is operational.

---

## 8. Division of Responsibilities

| Roadmap Step | Scope & Responsibility |
|---|---|
| **Step 26** (Complete) | Provider settings UI, credential CRUD, and lightweight connection tests. |
| **Step 27** (Complete) | Common interfaces, trinary capabilities, model contracts, error taxonomy, and registry. |
| **Step 28** (Complete) | Concrete OpenAI Provider Adapter, Chat Completions mapping, error handling, and mocked tests. |
| **Step 29** (Complete) | Concrete OpenRouter Provider Adapter, publisher-qualified IDs, and mocked tests. |
| **Step 30** (Complete) | Concrete NVIDIA NIM Provider Adapter, Chat Completions mapping, error handling, and mocked tests. |
| **Step 41** | Dynamic Model Catalog synchronization, pricing, and caching. |
| **Step 42** | Auto-Pick Model Router selecting optimal models per research task complexity. |
