# Auto-Pick Model Router Architecture & Capability-Aware Selection

**Governed by:** Implementation Step 42 (Phase 9: Model Routing and Asynchronous Research)  
**Status:** Implemented & Verified  
**Authoritative Location:** `src/server/models/router/`

---

## 1. Architectural Purpose

The **Auto-Pick Model Router** resolves AI operations to configured, capability-verified models across OpenAI, OpenRouter, and NVIDIA NIM. It evaluates mandatory technical requirements before ranking, enforces trinary capability verification, preserves explicit user choices, and provides deterministic, explainable routing decisions.

### Core Invariants:
1. **Never Invent Capabilities or Limits:** If a capability or token limit is unmeasured or `UNKNOWN`, it is never treated as confirmed support for mandatory requirements.
2. **User-Choice Preservation:** Explicit user choices (`routingMode: 'EXPLICIT'`) are never silently overridden. Incompatible explicit models return `EXPLICIT_INCOMPATIBLE` unless the user explicitly authorized fallback (`allowFallback: true`).
3. **100% Deterministic & Non-Circular:** Routing relies strictly on validated catalog metadata, user provider settings, and deterministic algorithms. No LLM calls participate in model selection.
4. **Credential Isolation:** Never returns API keys, tokens, or private endpoint headers in routing responses or logs.

---

## 2. Technical Routing Flow

The routing process executes through discrete, testable evaluation stages:

```
[Operation Request]
         │
         ▼
[1. Profile Resolution] ─────────► (Standard or Custom Operation Profile)
         │
         ▼
[2. Provider Status Retrieval] ──► (user_id provider configurations & health)
         │
         ├─── If routingMode === 'EXPLICIT' ──────────────────────────────────────────┐
         │                                                                            ▼
         │                                                        [Validate Explicit Candidate]
         │                                                                 │         │
         │                                                  (Eligible)     │         │ (Ineligible)
         │                                                        ▼                  ▼
         │                                                  [SUCCESS: EXPLICIT]  [Fallback Allowed?]
         │                                                                        │           │
         │                                                                  (Yes) │           │ (No)
         │                                                                        ▼           ▼
         │                                                                 [AUTO_PICK]   [EXPLICIT_INCOMPATIBLE]
         │                                                                      │
         ▼                                                                      │
[3. Catalog Inspection & Eligibility Filtering] ◄───────────────────────────────┘
         │
         ├── Hard requirements check (text_generation, structured_output, streaming, image_input)
         ├── Context window capacity check (contextWindowTokens >= minimumContextTokens)
         ├── Provider enablement & health check (is_enabled, has_credential, is_healthy)
         └── Structured output support level check (SCHEMA_CONSTRAINED vs JSON_OBJECT)
         │
         ├─── If 0 eligible candidates ──► [NO_ELIGIBLE_MODEL] (with actionable rejection list)
         │
         ▼
[4. Deterministic Candidate Ranking]
         ├── Priority 1: User-configured selected model (+1000)
         ├── Priority 2: Preferred provider order (+100 per rank)
         ├── Priority 3: Preferred model family (+50)
         ├── Priority 4: Curated recommended flag (+40)
         ├── Priority 5: Structured output level fidelity (+10 to +30)
         ├── Priority 6: Context window capacity bonus (up to +20)
         └── Tie-Breaker: Stable lexicographical sort on canonical ID
         │
         ▼
[5. Structured Routing Decision Construction] ──► [SUCCESS: AUTO_PICK or FALLBACK]
```

---

## 3. Operation Requirement Profiles

Profiles define mandatory capabilities, context requirements, and output modalities:

| Operation | Mandatory Capabilities | Minimum Structured Output Level | Minimum Context |
|---|---|---|---|
| `claim_extraction` | `text_generation`, `structured_output` | `JSON_OBJECT` | 8,000 tokens |
| `research_synthesis` | `text_generation`, `structured_output` | `JSON_OBJECT` | 16,000 tokens |
| `structured_generation` | `text_generation`, `structured_output` | `SCHEMA_CONSTRAINED` | 4,000 tokens |
| `streaming_generation` | `text_generation`, `streaming` | `POST_VALIDATED` | 4,000 tokens |
| `multimodal_research` | `text_generation`, `image_input` | `POST_VALIDATED` | 8,000 tokens |

---

## 4. Rejection Taxonomy

When candidate models fail eligibility filtering, the router records structured rejection reason codes:

- `CAPABILITY_UNSUPPORTED`: Model is confirmed to lack a mandatory capability (e.g., vision, streaming, text generation).
- `CAPABILITY_UNVERIFIED`: Capability status is `UNKNOWN` and `allowUnverifiedCapabilities: false`.
- `OUTPUT_FORMAT_INCOMPATIBLE`: Model structured output level is below required level.
- `CONTEXT_CAPACITY_INSUFFICIENT`: Model context window is smaller than required minimum.
- `PROVIDER_DISABLED`: Provider is disabled in user configuration.
- `PROVIDER_UNCONFIGURED`: Provider lacks active credentials for user.
- `PROVIDER_UNHEALTHY`: Provider failed recent connection or health checks.
- `MODEL_UNAVAILABLE`: Model availabilityState is `UNAVAILABLE` or `DEPRECATED`.
- `UNKNOWN_MODEL`: Model identifier not found in the model catalog.

---

## 5. Backward Compatibility & Consumer Integration

The router integrates with existing model consumers without breaking existing synchronous paths:

- **`AiResearchSynthesizer` (`src/server/synthesis/ai-synthesizer.ts`):**
  - If `input.useAutoPick === true`: invokes `ModelRouterService.route({ operationType: 'research_synthesis', routingMode: 'AUTO_PICK', ... })`.
  - If unprovided: preserves direct explicit model execution (`gpt-4o-mini` default).
- **`AiClaimExtractor` (`src/server/claims/adapters/ai-claim-extractor.ts`):**
  - If `options.useAutoPick === true`: invokes `ModelRouterService.route({ operationType: 'claim_extraction', routingMode: 'AUTO_PICK', ... })`.
  - If unprovided: preserves direct execution (`gpt-4o-mini` default).

