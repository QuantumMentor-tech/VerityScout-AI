# VerityScout AI — Provider Contract Specifications

**Governed by:** Step 51 (Unit Tests and Provider Contract Tests)  
**Implementation Standard:** Production-oriented, deterministic, capability-aware, zero secret leakage, fail-closed security boundary.  
**Traceability:** ADR-005, DEC-006, Steps 27–30 (AI Providers), Steps 32–34 (Safe HTTP, Search, and Extraction Providers).

---

## 1. Architectural Invariants

Every external provider integration in VerityScout AI must satisfy the following non-negotiable architectural invariants:

1. **Zero Secret Leakage:** Provider API keys, credentials, and session tokens must never appear in raw log files, database error records, operational telemetry, or client HTTP responses. All secrets are scrubbed via `sanitizeString` and adapter-level sanitizers (`sanitizeErrorMessage`).
2. **Deterministic Contract Mapping:** External provider request/response payloads are mapped into internal, strongly-typed TypeScript contracts without leaking vendor-specific payload details into downstream consumers.
3. **Fail-Closed Network Boundaries:**
   - AI and Search providers require HTTPS (`port 443`) and use `TRUSTED_PROVIDER` safeFetch policy with automatic redirects disabled (`maxRedirects: 0`).
   - Content extraction providers evaluate `PUBLIC_RESEARCH_SOURCE` policy before dispatching outbound requests, intercepting SSRF destinations (RFC 1918, RFC 1122, RFC 3927 cloud metadata `169.254.169.254`) prior to socket creation.
4. **Isolated Testability:** All provider adapters support dependency injection for HTTP transport (`fetchFn` or `safeFetch` seam) and credential vault access (`ProviderCredentialService`), allowing deterministic unit and contract testing with zero paid inference or external network dependencies.

---

## 2. AI Provider Contract Specifications

### 2.1 OpenAI (`OpenAiProviderAdapter`)
- **Adapter Class:** `OpenAiProviderAdapter` implements `AiProviderAdapter`
- **Default Base Endpoint:** `https://api.openai.com/v1`
- **Inference Route:** `POST /responses` (OpenAI Responses API)
- **Model Listing Route:** `GET /models`
- **Authentication:** `Authorization: Bearer <API_KEY>`
- **Header Requirements:**
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `User-Agent: VerityScout-AI/0.1.0`
- **Request Translation:**
  - `request.messages` mapped into `input: [{ role, content }]`
  - `request.temperature` mapped to `temperature` (bounded [0.0..2.0])
  - `request.maxTokens` mapped to `max_output_tokens`
  - `request.responseFormat` mapped to `response_format: { type: 'json_object' | 'text' }`
- **Response Parsing:**
  - Text parsed from `output[].content[].text` where `part.type === 'output_text'`
  - Refusals identified when `part.type === 'refusal'`, mapping `finishReason: 'content_filter'`, `rawFinishReason: 'refusal'`
  - Usage tokens mapped into `{ promptTokens, completionTokens, totalTokens }`
- **Error Taxonomy:**
  - `401 / invalid_api_key` $\rightarrow$ `AUTH_FAILED` (non-retryable)
  - `403` $\rightarrow$ `PERMISSION_DENIED` (non-retryable)
  - `404 / model_not_found` $\rightarrow$ `MODEL_UNAVAILABLE` (non-retryable)
  - `429 / rate_limit_exceeded / insufficient_quota` $\rightarrow$ `RATE_LIMITED` (retryable)
  - `500..599` $\rightarrow$ `PROVIDER_UNAVAILABLE` (retryable)

---

### 2.2 OpenRouter (`OpenRouterProviderAdapter`)
- **Adapter Class:** `OpenRouterProviderAdapter` implements `AiProviderAdapter`
- **Default Base Endpoint:** `https://openrouter.ai/api/v1`
- **Inference Route:** `POST /chat/completions` (OpenRouter OpenAI-Compatible Completions)
- **Model Listing Route:** `GET /models`
- **Authentication:** `Authorization: Bearer <API_KEY>`
- **Required Identity Headers:**
  - `HTTP-Referer: https://verityscout.local`
  - `X-Title: VerityScout AI`
  - `Content-Type: application/json`
- **Model Qualified IDs:** Preserves publisher namespace (e.g. `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3.1-70b-instruct`)
- **Error Taxonomy:**
  - `401` $\rightarrow$ `AUTH_FAILED` (non-retryable)
  - `402` $\rightarrow$ `INSUFFICIENT_CREDITS` (non-retryable)
  - `404` $\rightarrow$ `MODEL_UNAVAILABLE` (non-retryable)
  - `429` $\rightarrow$ `RATE_LIMITED` (retryable)
  - `500..599` $\rightarrow$ `PROVIDER_UNAVAILABLE` (retryable)

---

### 2.3 NVIDIA NIM (`NimProviderAdapter`)
- **Adapter Class:** `NimProviderAdapter` implements `AiProviderAdapter`
- **Default Base Endpoint:** `https://integrate.api.nvidia.com/v1` (or user-configured on-prem/cloud NIM)
- **Inference Route:** `POST /chat/completions`
- **Authentication:** `Authorization: Bearer <NVIDIA_API_KEY>` (`nvapi-...`)
- **Publisher Model Mapping:** Supports NVIDIA catalog models (e.g. `meta/llama-3.1-70b-instruct`, `nvidia/nemotron-4-340b-instruct`)
- **FastAPI Validation Error Handling:**
  - Unpacks FastAPI/Pydantic `detail` arrays safely into sanitized strings without leaking internal server schemas.
  - Maps HTTP `400` and `422` status codes to `INVALID_REQUEST`.

---

## 3. Search Provider Contract Specifications

### 3.1 Tavily Search (`TavilySearchAdapter`)
- **Adapter Class:** `TavilySearchAdapter` implements `ISearchProvider`
- **Target Endpoint:** `POST https://api.tavily.com/search`
- **Authentication:** `Authorization: Bearer <API_KEY>`
- **Transport Policy:** `TRUSTED_PROVIDER` via `safeFetch`
- **Search Depth:**
  - `SearchDepth.QUICK` and `BALANCED` map to `search_depth: 'basic'` (1 credit consumed)
  - `SearchDepth.DEEP` maps to `search_depth: 'advanced'` (2 credits consumed)
- **Response Mapping:**
  - Results array mapped into `SearchCandidate` objects
  - Scores clamped to normalized $[0.0..1.0]$ floating-point range
  - Publication dates parsed and trimmed

---

### 3.2 Exa Search (`ExaSearchAdapter`)
- **Adapter Class:** `ExaSearchAdapter` implements `ISearchProvider`
- **Target Endpoint:** `POST https://api.exa.ai/search`
- **Authentication:** `x-api-key: <API_KEY>`
- **Transport Policy:** `TRUSTED_PROVIDER` via `safeFetch`
- **Request Mapping:** Maps `maxResults` to `numResults`
- **Response Mapping:**
  - Maps `results[].text` into `SearchCandidate.snippet`
  - Maps `results[].score` into `SearchCandidate.relevanceScore`

---

## 4. Extraction Provider Contract Specifications

### 4.1 Firecrawl Cloud Extractor (`FirecrawlExtractionAdapter`)
- **Adapter Class:** `FirecrawlExtractionAdapter` implements `IExtractionProvider`
- **Target Endpoint:** `POST https://api.firecrawl.dev/v1/scrape`
- **Authentication:** `Authorization: Bearer <FIRECRAWL_API_KEY>`
- **Transport Policy:** `TRUSTED_PROVIDER` via `safeFetch`
- **Pre-Dispatch Validation:** Evaluates target research URL against `PUBLIC_RESEARCH_SOURCE` policy. SSRF destinations are aborted before outbound calls to Firecrawl.
- **Payload Spec:** `{ url: canonicalUrl, formats: ['markdown'], onlyMainContent: true }`
- **Response Mapping:**
  - Computes deterministic SHA-256 `contentHash` on received markdown.
  - Maps reported status `401/403` to `SourceAccessState.BLOCKED_BOT_CHALLENGE`.
  - Maps empty markdown bodies to `ExtractionState.EMPTY_BODY`.

---

### 4.2 Direct Safe-Fetch Extractor (`DirectSafeFetchExtractor`)
- **Adapter Class:** `DirectSafeFetchExtractor` implements `IExtractionProvider`
- **Transport:** Node.js native `http`/`https` via `safeFetch` with socket pinning
- **Transport Policy:** `PUBLIC_RESEARCH_SOURCE`
- **Security Boundaries:**
  - Rejects loopback (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata (`169.254.169.254`).
  - Pre-fetch DNS validation with fail-closed mixed-answer protection.
  - Streaming payload byte ceiling (`maxResponseBytes: 5 MB`).
- **Parsing:**
  - In-memory JSDOM parser with script execution and external resource loading disabled.
  - Converts HTML DOM to clean Markdown.
  - Plain text responses wrapped in Markdown text blocks.
  - Detects bot challenge headers and DOM signatures (Cloudflare, Just a moment, CAPTCHA).

---

## 5. Verification Matrix

| Provider | Contract Suite | Test Count | Pass Rate | Status |
| :--- | :--- | :---: | :---: | :---: |
| **OpenAI** | `tests/contracts/ai-providers/openai.contract.test.ts` | 10 | 100% | Verified |
| **OpenRouter** | `tests/contracts/ai-providers/openrouter.contract.test.ts` | 4 | 100% | Verified |
| **NVIDIA NIM** | `tests/contracts/ai-providers/nim.contract.test.ts` | 4 | 100% | Verified |
| **Tavily** | `tests/contracts/search-providers/tavily.contract.test.ts` | 6 | 100% | Verified |
| **Exa** | `tests/contracts/search-providers/exa.contract.test.ts` | 3 | 100% | Verified |
| **Firecrawl** | `tests/contracts/extraction-providers/firecrawl.contract.test.ts` | 10 | 100% | Verified |
| **Direct Safe-Fetch**| `tests/contracts/extraction-providers/direct-fetch.contract.test.ts` | 10 | 100% | Verified |
| **Total** | **7 test files** | **47** | **100%** | **PASS** |

