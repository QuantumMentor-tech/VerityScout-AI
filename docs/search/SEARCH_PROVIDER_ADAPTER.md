# VerityScout AI — Search Provider Adapter Architecture Specification

**Document Identifier:** VS-SEARCH-ADAPTER-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 7 (Step 33 of 60)  
**Author:** Senior Search Systems Architect, Application Security Lead  
**Classification:** Server-Side Search Infrastructure  
**Traceability:** Mapped to [ADR-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-005-search-and-extraction-provider-abstraction.md), [DEC-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), [PROVIDER_EVALUATION.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/research/PROVIDER_EVALUATION.md), and [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-005`, `AC-005`).

---

## 1. Executive Summary & Purpose

VerityScout AI requires real web discovery to collect candidate product specifications, retailer stock availability, manufacturer documentation, and laboratory benchmarks.

This document specifies the search-provider adapter architecture implemented in Step 33 (`src/server/search/`). The architecture enforces **zero vendor lock-in** through the `ISearchProvider` interface, executes search queries under strict server-side resource bounds, validates returned candidate URLs through Step 32's SSRF and destination controls, and normalizes discovery leads without confusing search snippets with verified facts.

---

## 2. Provider Decision Register & Governance

### 2.1 Approved Architectural Abstraction (`DEC-006` / `ADR-005`)
- In accordance with `DEC-006` and `ADR-005`, VerityScout AI implements a pluggable search adapter interface (`ISearchProvider`) supporting:
  1. **Tavily** (`tavily`): Primary turnkey provider recommended in `PROVIDER_EVALUATION.md` for factual search and topic filtering.
  2. **Exa** (`exa`): Approved secondary provider evaluated for cost-efficient neural/semantic retrieval.
  3. **Mock Search** (`mock_search`): High-fidelity, deterministic offline test double for unit/integration testing and CI.

### 2.2 Status of Decision `OPEN-002` (Production Adoption & Live Spending)
- In strict adherence to project governance, **live external search API calls are pending explicit user budget authorization**.
- During coding-agent development and automated CI runs, **zero paid live API calls are permitted**. All verification is conducted using deterministic fixtures, mock adapters, and mocked HTTP network transport.
- When live credentials are provided by a user in production settings, the application mediates all requests through the secure server-only adapter layer.

---

## 3. Official API Integration Specifications

Both adapters use direct, lightweight HTTP requests via `safeFetch` (`policy: 'TRUSTED_PROVIDER'`), eliminating heavy vendor SDK bloat while enforcing connection-level DNS rebinding protection and SSRF controls.

### 3.1 Tavily Search Integration
- **Official API Documentation:** [https://docs.tavily.com/documentation/api-reference/endpoint/search](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- **Endpoint:** `POST https://api.tavily.com/search`
- **Authentication:** `Authorization: Bearer <apiKey>`
- **Request Payload:**
  ```json
  {
    "query": "string (1-500 chars)",
    "search_depth": "basic | advanced",
    "topic": "general | news",
    "max_results": 5,
    "include_domains": ["string"],
    "exclude_domains": ["string"],
    "include_answer": false,
    "include_raw_content": false,
    "include_images": false
  }
  ```
- **Credit Accounting:** Basic Search = 1 credit; Advanced Search (DEEP) = 2 credits.
- **Error Normalization:**
  - `401 / 403` $\to$ `AUTHENTICATION_FAILED`
  - `429` (quota) $\to$ `CREDITS_EXHAUSTED`
  - `429` (rate limit) $\to$ `RATE_LIMITED`
  - `400` $\to$ `INVALID_PLAN`
  - `5xx` $\to$ `PROVIDER_UNAVAILABLE`

### 3.2 Exa Search Integration
- **Official API Documentation:** [https://exa.ai/docs/reference/search](https://exa.ai/docs/reference/search)
- **Endpoint:** `POST https://api.exa.ai/search`
- **Authentication:** `x-api-key: <apiKey>`
- **Request Payload:**
  ```json
  {
    "query": "string (1-500 chars)",
    "type": "auto",
    "numResults": 5,
    "includeDomains": ["string"],
    "excludeDomains": ["string"],
    "useAutoprompt": false,
    "contents": {
      "text": true
    }
  }
  ```
- **Credit Accounting:** 1 search request ($0.007/query on auto).

---

## 4. Security & Network Destination Controls

Outbound search provider calls adhere to Step 32's `TRUSTED_PROVIDER_POLICY`:

1. **Approved Hostnames Only:** `APPROVED_PROVIDER_HOSTS` includes `api.tavily.com` and `api.exa.ai`. Arbitrary API endpoint overrides from clients or user queries are strictly rejected.
2. **Strict Protocol & Port:** Outbound requests require `https:` on port `443`. Plaintext HTTP downgrade is blocked.
3. **Automatic Redirects Disabled (`maxRedirects: 0`):** Credential-bearing API calls never follow automatic redirects, preventing credential exfiltration to third-party endpoints.
4. **Server-Side Isolation:** API keys are retrieved from the AES-256-GCM vault via `ProviderCredentialService.getDecryptedCredential` and never transmitted to browser clients or emitted into application logs.

---

## 5. Result Normalization & Step 32 URL Safety Verification

Search results returned by external engines represent untrusted discovery leads. Every candidate URL returned in a search response is immediately passed through Step 32's `validateUrl(url, 'PUBLIC_RESEARCH_SOURCE')`.

- **Valid Public URLs:** Assigned `urlValidation.isValid: true` and `isFetchable: true`.
- **Prohibited / Private URLs:** Loopback (`127.0.0.1`), link-local metadata (`169.254.169.254`), RFC 1918 private subnets, non-standard ports, or URLs with embedded credentials (`user:pass@host`) are flagged with `urlValidation.isValid: false` and `isFetchable: false`.
- **Zero Webpage Fetching:** Result URLs are **NOT** fetched, scraped, or verified in this step. Content extraction is strictly reserved for Step 34.

---

## 6. Error Taxonomy & Resilience

External network failures, provider rate limits, and authentication errors are normalized into `SearchProviderError`:

| Error Code | Trigger Condition | Retry Policy |
|---|---|---|
| `PLAN_NOT_READY` | Research plan status is `NEEDS_CLARIFICATION` or `INVALID`. | Zero retries. |
| `CREDENTIAL_MISSING` | User has not configured an API key for the selected search provider. | Zero retries. |
| `AUTHENTICATION_FAILED` | Upstream provider rejected API key (HTTP 401/403). | Zero retries. |
| `RATE_LIMITED` | Upstream provider returned HTTP 429 (rate limit). | 1 retry with backoff if budget permits. |
| `CREDITS_EXHAUSTED` | Upstream provider account balance is zero (HTTP 429 quota). | Zero retries. |
| `PROVIDER_UNAVAILABLE` | Upstream provider service error (HTTP 500/502/503/504). | 1 retry if budget permits. |
| `TIMEOUT` | Request socket or response stream timed out ($>15$s). | 1 retry if budget permits. |
| `CANCELLED` | Caller aborted the `AbortSignal`. | Zero retries. Immediate abort. |
| `RESPONSE_VALIDATION_FAILED`| Upstream returned malformed JSON or missing results array. | Zero retries. |
| `TRANSPORT_ERROR` | Low-level TLS handshake or TCP socket failure. | 1 retry if budget permits. |

