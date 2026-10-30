# ADR-005: Pluggable Search and Two-Tier Web Extraction Abstraction

**Status:** APPROVED (Architecture) / NEEDS_USER_APPROVAL (Live Provider Spending & Adoption)  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Search Systems Lead  
**Related Requirements:** UR-005, UR-006, NFR-005, NFR-007  
**Traceability:** Implements [DEC-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [AC-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-005-multi-source-web-search-orchestration), [AC-006](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-006-multi-source-page-extraction-and-normalization)

---

## 1. Context and Problem Statement

VerityScout AI requires real web discovery and extraction to collect facts, specs, and price quotes. Step 3 evaluated candidates (Tavily, Exa, Firecrawl, and Direct HTTP Fetch). Different search engines excel at different query types (general broad web vs. targeted product neural search), while web pages range from static HTML (cheaply fetchable via direct HTTP) to heavy JavaScript single-page applications (requiring headless rendering). The architecture must decouple search and extraction from any single vendor, allowing seamless swapping and two-tier cost optimization.

## 2. Considered Alternatives

1. **Alternative 1: Pluggable Adapter Interfaces (`ISearchProvider`, `IExtractionProvider`) with Two-Tier Extraction** *(Chosen)*
2. **Alternative 2: Hardcoded Integration with Tavily Only**
3. **Alternative 3: In-House Headless Chromium (Playwright/Puppeteer) Cluster for All Pages**

## 3. Decision Outcome & Chosen Approach

We adopt a **pluggable provider adapter architecture** governed by two canonical interfaces:
1. **`ISearchProvider`:** Dispatches normalized search queries and returns standardized source references (`SearchCandidate[]`). Supported adapters: Tavily, Exa, and MockSearchProvider.
2. **`IExtractionProvider` with Two-Tier Execution:**
   - **Tier 1 (Direct Safe-Fetch):** In-house HTTP client utilizing pre-fetch DNS verification, SSRF blocking, Cheerio HTML parsing, and DOMPurify sanitization. Completely free of external API costs; handles static HTML, blogs, forums, and standard web pages.
   - **Tier 2 (Managed Cloud Extraction):** Fallback extraction adapter (Firecrawl or Tavily Extract) invoked only if Tier 1 encounters bot-challenge blocks (HTTP 403/Cloudflare) or dynamic JS-rendered SPAs.

### Guardrails:
- Maximum search queries per run: 5 queries (`SEC-035`).
- Maximum page extractions per run: 10 pages (`SEC-035`).
- Direct fetch timeouts: 5s connect, 15s total, 5MB max payload (`SEC-014`).

## 4. Consequences and Trade-offs

- **Benefits:**
  - Up to 80% reduction in external extraction API spend by using Tier 1 Safe-Fetch for accessible pages.
  - Zero vendor lock-in: switching search providers requires implementing a single TypeScript interface without altering verification or UI logic.
- **Trade-offs:**
  - Two-tier extraction requires failure detection logic (e.g., detecting if a page returned an empty body or bot challenge).

## 5. Security & Privacy Implications

- Direct Safe-Fetch client enforces pre-connection DNS checks against RFC 1918 private subnets and cloud metadata (`169.254.169.254`), with per-hop redirect inspection (`SEC-011`, `SEC-012`, `SEC-013`, `VS-THR-001`).
- User search queries are scrubbed of credentials before transmission (`SEC-020`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 31 (Provider Foundations), Step 32 (SSRF & Safe-Fetch), Step 33 (Search Adapters), Step 34 (Extraction Adapters).
- **Validation Criteria:** Vitest test suite executing synthetic fixtures against mock adapters and live pilot queries once authorized (`AC-035`, `REC-001`).
