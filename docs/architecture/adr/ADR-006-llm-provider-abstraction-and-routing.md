# ADR-006: Multi-Provider LLM Abstraction & Privacy-Aware Model Routing

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, AI Systems Lead  
**Related Requirements:** UR-003, UR-004, UR-018, UR-019, NFR-001, NFR-007  
**Traceability:** Implements [DEC-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [AC-003](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-003-multi-provider-ai-configuration-and-model-catalog), [AC-004](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-004-automatic-and-manual-model-selection)

---

## 1. Context and Problem Statement

VerityScout AI requires AI language models for two distinct purposes:
1. High-precision structured fact and specification extraction from unstructured web text.
2. Natural-language research synthesis and executive summary generation.

The application must support three approved provider ecosystems: OpenAI, OpenRouter, and NVIDIA NIM. The architecture must support both **manual model selection** (user pins a specific model) and **automatic model routing** (system picks the optimal model based on task complexity, cost, and availability). Crucially, fallback must strictly respect user privacy boundaries: the router must never send proprietary queries to an unapproved provider during an outage.

## 2. Considered Alternatives

1. **Alternative 1: Canonical `ILLMProvider` Adapter Interface with Privacy-Bound Router** *(Chosen)*
2. **Alternative 2: Direct Hardcoded OpenAI SDK Integration**
3. **Alternative 3: Heavyweight LangChain / LlamaIndex Framework Integration**

## 3. Decision Outcome & Chosen Approach

We adopt a **lightweight, native TypeScript `ILLMProvider` interface** with a privacy-bounded routing engine.

### Core Architectural Features:
- **Canonical Interface:** Every adapter (OpenAI, OpenRouter, NVIDIA NIM, MockLLM) implements:
  - `generateStructured<T>(req: StructuredPromptRequest<T>): Promise<T>`
  - `generateText(req: TextPromptRequest): Promise<TextResponse>`
  - `discoverCapabilities(): Promise<ModelCapability[]>`
- **Privacy-Aware Fallback Routing:** Automatic model routing filters candidate models strictly through the user's enabled provider whitelist (`SEC-031`). If the primary provider fails (HTTP 5xx) and no other permitted providers are configured, the system terminates with `ALL_PERMITTED_PROVIDERS_UNAVAILABLE` rather than violating privacy constraints (`VS-THR-007`).
- **Prompt Isolation & XML Delimiters:** All untrusted web text is wrapped in explicit `<untrusted_web_source>` tags. System instructions command the model to treat text inside as passive evidence, never commands (`SEC-016`, `VS-THR-002`).
- **Strict Output Schema Enforcement:** All structured LLM responses are parsed and validated via Zod schemas (`SEC-018`).

## 4. Consequences and Trade-offs

- **Benefits:**
  - Complete portability across OpenAI, OpenRouter, and NVIDIA NIM.
  - Immunity to framework obsolescence: lightweight native fetch calls without bulky LangChain abstractions.
  - Zero leakage of API keys or user data to unapproved third parties.
- **Trade-offs:**
  - Requires maintaining provider-specific error mapping (e.g. OpenAI rate limit headers vs. OpenRouter status codes).

## 5. Security & Privacy Implications

- Zero credentials in prompts: system prompts and user queries never include API keys or infrastructure URLs (`SEC-020`).
- Circuit breaker trips after 5 consecutive failures, failing fast to prevent wasteful retry spend (`SEC-038`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 26–30 (Provider Adapters & Settings), Step 36 (Schema Validation), Step 42 (Model Router).
- **Validation Criteria:** Unit test suite validating fallback boundary enforcement and Zod rejection on malformed JSON (`AC-019`, `SEC-TEST-016`).
