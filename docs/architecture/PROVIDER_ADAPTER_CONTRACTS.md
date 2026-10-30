# VerityScout AI — Provider Adapter Interface Contracts

**Document Identifier:** VS-PROV-CONTRACT-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 1 (Step 5 of 60)  
**Author:** Principal Software Architect, AI Systems Lead  
**Traceability:** Mapped to [DATA_CONTRACTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/DATA_CONTRACTS.md), [ADR-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-005-search-and-extraction-provider-abstraction.md), [ADR-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-006-llm-provider-abstraction-and-routing.md).

---

## 1. Architectural Role of Adapters

To prevent vendor lock-in, decouple deterministic verification from external API changes, and support testability in CI without live API spend, all external search, extraction, and AI operations are mediated through strict TypeScript adapter interfaces. 

### Core Design Rules:
1. **Interface Stability:** Domain services interact exclusively with the interfaces defined in this document, never directly with third-party SDKs (e.g. `openai`, `@tavily/core`).
2. **Error Normalization:** External HTTP 4xx/5xx or SDK errors are caught by adapters and re-thrown as typed application exceptions (`ProviderRateLimitException`, `ProviderUnavailableException`, `ProviderAuthenticationException`). Raw stack traces or private URLs must never leak upward.
3. **Usage Attribution:** Every successful adapter call returns a standard `ProviderUsageMetadata` block tracking tokens or query credits consumed.

---

## 2. Search Provider Interface (`ISearchProvider`)

Mediates web discovery and candidate URL retrieval across Tavily, Exa, or synthetic test doubles.

```typescript
export interface SearchQueryRequest {
  query: string;                      // Sanitized query string (max 500 chars)
  maxResults?: number;                // Default: 10, Hard Cap: 20
  includeDomains?: string[];          // Optional domain whitelist
  excludeDomains?: string[];          // Optional domain blocklist
  searchDepth?: 'QUICK' | 'BALANCED' | 'DEEP';
  requestId: string;                  // Correlation ID
}

export interface SearchCandidate {
  title: string;
  url: string;
  snippet?: string;                   // Text snippet returned by search engine
  publishedDate?: string;             // ISO 8601 if reported by search engine
  relevanceScore?: number;            // 0.0 to 1.0 (if supplied)
}

export interface SearchQueryResponse {
  provider: 'tavily' | 'exa' | 'mock_search';
  query: string;
  results: SearchCandidate[];
  responseId?: string;
  usage: {
    searchCreditsConsumed: number;
    latencyMs: number;
  };
}

export interface ISearchProvider {
  readonly providerId: string;
  search(request: SearchQueryRequest, apiKey: string): Promise<SearchQueryResponse>;
  testConnection(apiKey: string): Promise<{ valid: boolean; latencyMs: number }>;
}
```

---

## 3. Extraction Provider Interface (`IExtractionProvider`)

Mediates fetching and parsing remote web pages. Implemented by Tier 1 (Direct Safe-Fetch via Cheerio) and Tier 2 (Managed Cloud Extraction via Firecrawl/Tavily).

```typescript
export interface ExtractionRequest {
  url: string;                        // Validated URL (must have passed SSRF pre-check)
  maxBodyBytes?: number;              // Default: 5,242,880 (5MB, SEC-014)
  timeoutMs?: number;                 // Default: 15,000 ms (SEC-014)
  requireJsRendering?: boolean;       // If true, routes to Tier 2 headless renderer
  requestId: string;
}

export interface ExtractionResponse {
  provider: 'direct_safe_fetch' | 'firecrawl' | 'tavily_extract' | 'mock_extract';
  originalUrl: string;
  canonicalUrl: string;               // Normalized, query-stripped URL
  domain: string;
  title: string;
  
  // Cleaned Text Content
  markdownContent: string;            // Extracted text formatted as clean markdown
  textExcerpt: string;                // Primary content snippet (<50KB, SEC-032)
  contentHash: string;                // SHA256 of extracted text
  
  // Provenance & Status
  httpStatusCode: number;
  retrievedAt: string;                // ISO 8601 UTC
  accessState: 'ACCESSIBLE' | 'BLOCKED_BOT_CHALLENGE' | 'HTTP_ERROR' | 'TIMEOUT';
  extractionState: 'SUCCESS' | 'EMPTY_BODY' | 'PAYLOAD_TOO_LARGE' | 'PARSING_FAILED';
  
  usage: {
    bytesReceived: number;
    latencyMs: number;
  };
}

export interface IExtractionProvider {
  readonly providerId: string;
  extract(request: ExtractionRequest, apiKey?: string): Promise<ExtractionResponse>;
}
```

---

## 4. LLM Provider Interface (`ILLMProvider`)

Mediates structured fact extraction and natural-language synthesis across OpenAI, OpenRouter, and NVIDIA NIM.

```typescript
import { z } from 'zod';

export interface StructuredPromptRequest<T> {
  systemPrompt: string;               // Immutable directives (SEC-016)
  userPrompt: string;                 // Query context
  untrustedWebSources: Array<{        // Wrapped in <untrusted_web_source> tags
    id: string;
    url: string;
    content: string;
  }>;
  responseSchema: z.ZodSchema<T>;     // Zod schema for structured output validation
  temperature?: number;               // Default: 0.1 for extraction; 0.3 for synthesis
  maxTokens?: number;                 // Default: 4000
  requestId: string;
}

export interface TextPromptRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  requestId: string;
}

export interface LLMResponse<T> {
  provider: 'openai' | 'openrouter' | 'nim' | 'mock_llm';
  modelId: string;
  data: T;                            // Fully validated structured data
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: string;
    latencyMs: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface ILLMProvider {
  readonly providerId: string;
  generateStructured<T>(
    request: StructuredPromptRequest<T>,
    apiKey: string
  ): Promise<LLMResponse<T>>;
  
  generateText(
    request: TextPromptRequest,
    apiKey: string
  ): Promise<LLMResponse<string>>;

  testConnection(apiKey: string): Promise<{ valid: boolean; latencyMs: number }>;
}
```

---

## 5. Model Catalog Provider (`IModelCatalog`)

Provides dynamic model discovery, pricing information, and capability flags (e.g. structured output support).

```typescript
export interface ModelCapability {
  modelId: string;                    // e.g. "gpt-4o", "meta-llama/llama-3.3-70b-instruct"
  providerId: 'openai' | 'openrouter' | 'nim';
  displayName: string;
  contextWindowTokens: number;
  supportsStructuredOutputs: boolean;
  costPer1kPromptTokensUsd: string;
  costPer1kCompletionTokensUsd: string;
  isRecommendedForExtraction: boolean;
  isRecommendedForSynthesis: boolean;
}

export interface IModelCatalog {
  listAvailableModels(providerId?: string): Promise<ModelCapability[]>;
  getModelMetadata(modelId: string, providerId: string): Promise<ModelCapability | null>;
}
```

---

## 6. Test Doubles for CI & Deterministic Benchmarking

To support continuous automated testing in CI without consuming live third-party API quotas, the test harness utilizes synthetic mock implementations:

1. **`MockSearchProvider`:** Ingests synthetic query strings and returns canned `SearchCandidate[]` matching ground-truth benchmark cases in `tests/fixtures/benchmark/sources/`.
2. **`MockExtractionProvider`:** Serves static synthetic fixtures (`FIX-GPU-001`, `FIX-INJECT-001`, `FIX-PRICE-001`) with deterministic latency emulation.
3. **`MockLLMProvider`:** Returns pre-recorded, valid structured JSON extraction responses and validates that the prompt builder correctly encapsulates untrusted web sources within XML delimiters (`<untrusted_web_source>`).
