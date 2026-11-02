# Provider Capability Metadata Contract

## 1. Principle of Trinary Representation

VerityScout AI strictly enforces a trinary representation for all capability declarations:
- **`SUPPORTED`**: The capability is affirmatively verified through official vendor documentation, an approved contract, or an automated integration test.
- **`UNSUPPORTED`**: The capability is explicitly verified as not available on the provider or model.
- **`UNKNOWN`**: The capability has not been verified or is model-dependent.

> [!IMPORTANT]
> Unverified capabilities are **never** silently promoted to `SUPPORTED`. Absence of evidence is explicitly represented as `UNKNOWN`.

---

## 2. Capability Dimensions

VerityScout AI models 12 capability dimensions required for research synthesis operations:

| Capability Key | Meaning & Requirements | Evidence Basis |
|---|---|---|
| `textInput` | Accepts standard natural language prompt strings. | Universal for all supported text/chat models. |
| `textGeneration` | Returns generated completion or synthesis text. | Baseline LLM capability. |
| `structuredOutput` | Enforces valid JSON or strict JSON Schema compliance. | Requires provider support for `response_format: { type: "json_object" }` or JSON Schema. |
| `toolCalling` | Supports tool definition schema and invokes structured tool calls. | OpenAI Function Calling or OpenRouter tool pass-through. Marked `UNKNOWN` for generic NIM microservices. |
| `streaming` | Emits incremental tokens via Server-Sent Events (SSE). | Supported by all 3 providers' Chat Completions APIs. |
| `cancellation` | Honors client-side `AbortSignal` termination of in-flight requests. | Handled via standard Node.js / Fetch HTTP signal. |
| `usageMetadata` | Returns structured prompt, completion, and total token usage counts. | Returned in standard response payload. |
| `modelListing` | Exposes an authenticated endpoint to query available model IDs. | Verified via `/v1/models` (OpenAI, NIM) or `/api/v1/models` (OpenRouter). |
| `imageInput` | Accepts multimodal image inputs for vision verification. | Marked `SUPPORTED` for OpenAI (GPT-4o), `UNKNOWN` for general NIM until vision models are configured. |
| `systemPrompt` | Supports distinct system role instructions directing model behavior. | Standard across modern chat APIs. |
| `temperatureControl`| Allows adjusting generation randomness via sampling temperature. | Standard across modern chat APIs. |
| `maxTokensControl` | Allows capping maximum generated output tokens. | Standard across modern chat APIs. |

---

## 3. Capability Provenance Tracking

Every `CapabilityDeclaration` tracks its provenance:
1. `CONTRACT_DEFINED`: Declared based on VerityScout AI application contract requirements.
2. `OFFICIAL_DOCUMENTATION`: Grounded in official vendor documentation (with optional URL citation).
3. `VERIFIED_CATALOG`: Discovered dynamically via catalog introspection (Step 41).
4. `INTEGRATION_TESTED`: Proven through an automated live or mock test suite.

---

## 4. Orthogonality of Capabilities and Runtime State

A capability declaration describes what a provider or model is capable of doing. It is strictly orthogonal to:
1. **User Credential Status**: A provider does not lose `structuredOutput` support simply because the user hasn't configured an API key.
2. **Connection Health**: A timeout during a connection test does not alter the provider's declared capabilities.
3. **Model Selection**: While baseline capabilities describe the provider as a whole, individual models may have specific sub-capabilities that override provider defaults (to be consumed by Step 41 catalog and Step 42 router).
