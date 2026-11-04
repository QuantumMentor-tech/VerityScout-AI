# Model Catalog, Model Capabilities, and Supported Operations

**Governed by:** Implementation Step 41 (Phase 9: Model Routing and Asynchronous Research)  
**Status:** Implemented & Verified  
**Authoritative Location:** `src/server/models/`

---

## 1. Architectural Purpose

The Model Catalog serves as VerityScout AI's unified, provider-agnostic model registry. It establishes a strongly-typed model identity and capability taxonomy across all supported AI providers (**OpenAI**, **OpenRouter**, and **NVIDIA NIM**), preparing a solid contract for future capability-aware model selection (Step 42 Auto-Pick).

The system ensures:
1. **Never fabricate capabilities or limits**: Unknown limits remain `undefined` or `UNKNOWN`.
2. **Deterministic Structured Output Taxonomy**: Explicitly distinguishes between API-enforced schema constraints, urged JSON mode, and downstream post-validation.
3. **Resilient Offline-First Baseline**: Ships with a curated static catalog that acts as an immutable fallback if remote discovery is unconfigured or unreachable.
4. **Non-Destructive Refresh**: Failures in remote provider discovery never wipe or invalidate existing entries.
5. **Strict Credential Isolation**: Models and capability representations never leak API keys, vault secrets, or authorization headers.

---

## 2. Capability Taxonomy

VerityScout AI evaluates AI models against explicit capability dimensions:

| Capability Dimension | Type | Description |
|----------------------|------|-------------|
| `text_generation` | `boolean` | Core text prompt-to-response generation. |
| `structured_output` | `StructuredOutputCapability` | Structured JSON generation capability, typed by support level. |
| `streaming` | `boolean` | Server-Sent Events (SSE) token streaming. |
| `tool_calling` | `boolean` | Function calling / tool execution support. |
| `image_input` | `boolean` | Vision / multimodal image analysis. |

### Structured Output Levels

Structured output support is differentiated into five explicit levels:

1. `SCHEMA_CONSTRAINED`: Strict API JSON schema enforcement (e.g. OpenAI `json_schema` strict mode). The provider guarantees conformant JSON output matching the provided schema.
2. `JSON_OBJECT`: Urged JSON mode (e.g. `response_format: { type: "json_object" }`). The provider produces valid JSON, but schema compliance is unconstrained at the API level.
3. `POST_VALIDATED`: Raw completion parsed and validated downstream by application schema validators (e.g. Zod).
4. `UNSUPPORTED`: Model cannot produce structured JSON reliably or rejects structured directives.
5. `UNKNOWN`: Unmeasured or unverified capability status.

### Capability Provenance

Every capability declaration carries its origin provenance:
- `PROVIDER_DECLARED`: Extracted directly from official provider discovery APIs.
- `STATIC_BUNDLED`: Curated and verified in VerityScout AI's static baseline catalog.
- `OPERATOR_CONFIGURED`: Declared via system administrator or user setting.
- `VERIFIED_PROBE`: Empirically confirmed through active test probes.
- `UNKNOWN`: Unverified origin.

---

## 3. Availability States

| State | Description |
|-------|-------------|
| `AVAILABLE` | Model is active, verified, and ready for inference. |
| `CONFIGURED_ONLY` | Declared in operator settings, but remote discovery has not yet confirmed presence. |
| `DISCOVERED_ONLY` | Returned by remote discovery, but user credential or setting is unverified. |
| `UNAVAILABLE` | Provider unhealthy, connection failed, or marked disabled. |
| `DEPRECATED` | Flagged as deprecated or superseded by provider. |
| `UNKNOWN` | Initial or undetermined state. |

---

## 4. Curated Static Catalog

The static catalog (`src/server/models/static-catalog.ts`) bundles verified specifications:

- **OpenAI**: `gpt-4o` (Schema Constrained, 128k), `gpt-4o-mini` (Schema Constrained, 128k), `o1` (Schema Constrained, 200k), `o1-mini` (JSON Object, 128k).
- **OpenRouter**: `anthropic/claude-3.5-sonnet` (Schema Constrained, 200k), `meta-llama/llama-3.1-70b-instruct` (JSON Object, 131k), `google/gemini-2.0-flash-001` (Schema Constrained, 1M).
- **NVIDIA NIM**: `meta/llama-3.1-70b-instruct` (JSON Object, 131k), `mistralai/mixtral-8x7b-instruct-v0.1` (Post-Validated, 32k).

---

## 5. Safe Discovery and In-Memory Cache

The `ModelCatalogService` (`src/server/models/model-catalog.service.ts`) orchestrates model discovery:

- **Seeding**: Starts with curated static catalog entries.
- **Refresh**: Calls provider adapters (`listModels`). Discovered responses are parsed and merged.
- **Resilience**: If a provider fails (network timeout, rate limit, missing credential), the error is isolated to that provider. Existing entries and static baselines remain intact.
- **Querying**: Supports filtering by provider, required capabilities, structured output levels, minimum context window, and search terms.

