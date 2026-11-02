# VerityScout AI — Research Query Parsing, Constraint Extraction & Planning Specification

**Document Identifier:** VS-DOC-QUERY-PLANNING-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Governing Roadmap Step:** Step 31 of 60 (Phase 7: Search and Extraction)  
**Implementation Date:** November 2026  
**Primary Source Modules:**
- [`src/server/research/planner/contracts.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/contracts.ts)
- [`src/server/research/planner/normalizer.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/normalizer.ts)
- [`src/server/research/planner/constraint-extractor.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/constraint-extractor.ts)
- [`src/server/research/planner/query-planner.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/query-planner.ts)
- [`src/server/research/planner/research-planner.service.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/research-planner.service.ts)
- [`tests/unit/query-planner.test.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/tests/unit/query-planner.test.ts)

---

## 1. Executive Summary & Purpose

The **Research Query Parsing and Planning Subsystem** converts user natural-language queries and structured task constraints into a validated, traceable, provider-independent **Research Plan** (`ResearchPlan`).

It acts as the architectural bridge between intake (Step 16 Query Composer and Step 17 Constraints Editor) and downstream execution (Step 33 Search Provider Adapters, Step 34 Web Extraction, Step 37 Candidate Normalization, Step 38 Deterministic Constraint Verification, and Step 39 Match Classification).

### Core Architectural Rules
1. **Preserve User Intent:** Never silently discard, downgrade, or reinterpret constraints.
2. **Deterministic-First Core:** Pure rule-based parsing and query variant generation operate deterministically without relying on paid or external network inference.
3. **Strict Disambiguation:** Missing required attributes (e.g. currency on price conditions) or conflicting constraints produce explicit clarification states (`NEEDS_CLARIFICATION`, `INVALID`) rather than fabricated assumptions.
4. **Controlled Expansion:** Emits between 2 and 5 diversified queries targeting distinct search angles (Primary, Specifications, Price/Deals, Retailer/Review).
5. **No Search Execution:** Planning produces search strings only; it executes zero network searches, scraping, or web crawling.

---

## 2. Conservative Query Normalization

The normalizer ([`normalizer.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/normalizer.ts)) prepares raw text conservatively:
- **Unicode Normalization:** Standardizes text via `NFKC`.
- **Whitespace Collapsing:** Strips leading/trailing spaces and collapses repeated tabs, newlines, and spaces to a single space outside of quoted strings.
- **Quoted Text Preservation:** Preserves exact case and content of quoted phrases (e.g. `"black color only"`).
- **Technical Identifiers Intact:** Never lowercases or alters alphanumeric product models, versions, or hardware specifications (e.g. `RTX 5090`, `Ryzen 7 7800X3D`, `Lenovo ThinkPad X1 Carbon Gen 11`, `WH-1000XM5`, `M3 Max`, `Wi-Fi 7`).
- **Punctuation & Negation:** Preserves hyphens in product names, dollar/euro/pound symbols, and exclusion tokens.

---

## 3. Constraint-Aware Intent Parsing & Fidelity

The extractor ([`constraint-extractor.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/constraint-extractor.ts)) maps criteria into `NormalizedConstraint` records:

### 3.1 Supported Constraint Categories
- **Price Ceilings & Floors:** Extracted from natural language (`under $300`, `between $200 and $400`, `over $150`) or structured inputs.
- **Condition:** Extracted as `NEW`, `REFURBISHED`, or `USED`. Positive criteria become `REQUIRED`; negative criteria (e.g. `exclude refurbished`) become `EXCLUDED`.
- **Brands:** Detected from a curated list of frontier tech/consumer brands (Sony, Apple, Lenovo, Nvidia, etc.) or explicit inputs.
- **Excluded Domains:** Extracted from phrases (`exclude ebay`, `no amazon`) or tokens (`-site:ebay.com`, `-ebay.com`).
- **Excluded Keywords:** Extracted from negative phrases (`without wireless`, `no rgb`) or dash tokens (`-wireless`).
- **Specifications:** Extracted from explicit attributes (`black color only`, `32GB RAM`, `320mm GPU length`).

### 3.2 AC-002 Canonical Benchmark Query Fidelity
Passing query: *"Sony WH-1000XM5 headphones under $300 in new condition, black color only, exclude ebay and refurbished"* yields:
- `targetEntity`: `"Sony WH-1000XM5 headphones"`
- `PRICE_CEILING`: `300.00 USD` (REQUIRED)
- `CONDITION`: `NEW` (REQUIRED)
- `SPECIFICATION`: `color: black` (REQUIRED)
- `CONDITION`: `REFURBISHED` (EXCLUDED)
- `EXCLUDED_DOMAIN`: `ebay.com` (EXCLUDED)

---

## 4. Contradiction & Ambiguity Resolution

The planner evaluates constraints against strict consistency rules:

1. **AC-003 Currency Disambiguation:**
   - If a numerical price boundary is detected without a currency symbol or ISO 4217 code (e.g. *"Find an RTX 4070 under 600"*):
   - The system does **not** guess or silently inject USD.
   - It records a `MISSING_CURRENCY` ambiguity:
     - `field: "currency"`
     - `suggestedResolutions: ["USD", "EUR", "GBP"]`
   - Overall plan status is marked `NEEDS_CLARIFICATION`.
2. **Contradictory Price Boundaries:**
   - If minimum price exceeds maximum price (e.g. *"under $200 and over $400"* or structured `min: 400, max: 200`):
   - Records `CONFLICTING_CONSTRAINTS` ambiguity.
   - Plan status is marked `INVALID`.
3. **Simultaneous Required & Excluded Conditions:**
   - If an item is simultaneously required and excluded (e.g. condition NEW and condition EXCLUDED: NEW, or brand Sony and excluded keyword Sony):
   - Records `CONFLICTING_CONSTRAINTS` ambiguity.
   - Plan status is marked `INVALID`.

---

## 5. Multi-Engine Query Planning (AC-004)

The query planner ([`query-planner.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/query-planner.ts)) generates between 2 and 5 diversified search queries:

| Query Angle | Focus & Strategy | Example (`Lenovo ThinkPad X1 Carbon Gen 11`) |
| :--- | :--- | :--- |
| **`PRIMARY`** | Core literal entity traceable directly to input | `Lenovo ThinkPad X1 Carbon Gen 11` |
| **`SPECIFICATION_FOCUSED`** | Technical datasheets, manuals, verified specs | `Lenovo ThinkPad X1 Carbon Gen 11 technical specifications specs` |
| **`PRICE_AND_DEALS`** | Authorized retailer listings, pricing, verified buy links | `Lenovo ThinkPad X1 Carbon Gen 11 price buy` |
| **`RETAILER_AGGREGATOR`** | Review aggregator and benchmark synthesis with domain exclusions | `Lenovo ThinkPad X1 Carbon Gen 11 review overview -site:ebay.com` |

- **Safe Search Syntax:** Sanitizes query text, stripping characters like `<>{}[\]\\` that corrupt search engine parsers.
- **Deduplication:** Normalizes and removes duplicate queries while maintaining deterministic order.
- **Safety Fallback:** If query generation produces zero queries, falls back safely to the primary literal query.

---

## 6. Optional AI-Assisted Interpretation Seam

While the core planner is 100% deterministic, [`ResearchPlannerService`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/research/planner/research-planner.service.ts) includes an optional seam to invoke any registered [`AiProviderAdapter`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/src/server/providers/contracts/adapter.ts) (Step 28 OpenAI, Step 29 OpenRouter, or Step 30 NVIDIA NIM):
- Strictly server-side execution.
- Runtime Zod validation on model output.
- Non-regression guarantee: Explicit user constraints can never be erased, modified, or relaxed by AI interpretation.
- Graceful degradation: If AI inference fails or is unconfigured, the system emits an `AI_PLANNING_FALLBACK` warning and uses deterministic rules.

---

## 7. Security & Governance

1. **Untrusted Input Protection:** All input strings are capped at 1,000 characters and validated via `ResearchPlanInputSchema`.
2. **Zero Code Execution:** No `eval` or dynamic code generation is used.
3. **Zero Secret Leakage:** Prompts, plans, and warnings contain no credentials or tokens.
4. **Execution Boundary:** The planner strictly produces data transfer objects. It does not initiate external HTTP requests, web search API calls, or web scrapers.
