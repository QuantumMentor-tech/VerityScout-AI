# VerityScout AI — Reproducible Provider Benchmark Protocol
**Document Version:** 1.0.0-PROVISIONAL  
**Phase:** Phase 1 (Requirements, Research, and Feasibility) — Step 3 of 60  
**Status:** Protocol Specification Frozen; Empirical Execution Pending User Budget Authorization  
**Related Documents:**  
- [Provider Evaluation Report](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/docs/research/PROVIDER_EVALUATION.md)  
- [Benchmark Specification](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/docs/benchmark/RESEARCH_BENCHMARK_SPEC.md)  
- [Canonical Benchmark Dataset](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/data/benchmark/verityscout_benchmark.jsonl)  

---

## 1. Overview & Objective

This document defines the exact, reproducible empirical benchmark protocol for evaluating search providers (Tavily vs Exa) and extraction methods (Firecrawl vs Direct HTTP Fetch) under controlled test conditions.

The protocol selects **12 representative, unambiguous test cases** from the canonical 60-case benchmark dataset ([`verityscout_benchmark.jsonl`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/data/benchmark/verityscout_benchmark.jsonl)). It ensures that future authorized empirical tests are conducted with strict parity, identical variables, bounded request limits, and deterministic evaluation rules.

---

## 2. Representative Sample Selection (12 Pilot Cases)

In compliance with Section 7.1, ambiguous queries (which require user clarification) and synthetic failure fixtures (which test local fault injection) are **excluded** from live search provider requests. The 12 selected cases represent realistic, fully specified research inquiries across Categories A, B, and C:

| Pilot Case # | Benchmark Case ID | Category | Query Summary | Selection Rationale |
| :---: | :---: | :--- | :--- | :--- |
| **P-01** | `VS-BENCH-001` | Hardware | RTX 4070 Super 12GB New under $600 with 3x DP | Standard positive product procurement with multiple strict hardware constraints. |
| **P-02** | `VS-BENCH-002` | Hardware | RTX 4080 Super 16GB New under $1000 (exclude non-Super 4080) | Tests SKU precision and exclusion of confusingly similar hardware names. |
| **P-03** | `VS-BENCH-003` | Hardware | AMD Radeon RX 7800 XT in Germany under €520 EUR | Tests non-USD currency handling and regional German market isolation. |
| **P-04** | `VS-BENCH-005` | Hardware | RTX 4080 Super under $1050 with length < 305mm and 2x HDMI 2.1 | Tests multi-variable physical dimension and port filtering. |
| **P-05** | `VS-BENCH-008` | Hardware | Intel Core i5-14600K under $280 with integrated graphics UHD 770 | Tests subtle processor model suffix differentiation (K vs KF without iGPU). |
| **P-06** | `VS-BENCH-012` | Hardware | RTX 4070 Ti Super under $800 USD | Tests near-match boundary discovery ($799.99 vs $805.00). |
| **P-07** | `VS-BENCH-016` | Components | ATX Mid-Tower Case with pre-installed ARGB fans & hub under $120 | Tests component feature parsing (ARGB vs standard RGB vs controller hub). |
| **P-08** | `VS-BENCH-018` | Components | Mini-ITX Case with volume < 15L and SFX PSU support under $180 | Tests mathematical volume calculation and physical clearance constraints. |
| **P-09** | `VS-BENCH-020` | Components | ATX Case with at least 4 pre-installed PWM fans under $90 | Tests differentiation between included fans vs supported fan mounts. |
| **P-10** | `VS-BENCH-026` | General | Samsung 990 Pro vs WD Black SN850X independent lab benchmarks | Tests multi-source technical synthesis and independent review discovery. |
| **P-11** | `VS-BENCH-028` | General | Latest stable Linux kernel release and projected EOL from kernel.org | Tests real-time temporal freshness on authoritative upstream sources. |
| **P-12** | `VS-BENCH-038` | General | Official standard MTU size for Ethernet frames according to IEEE 802.3 | Tests authority hierarchy (official RFC/IEEE standard vs forum discussions). |

---

## 3. Test Configuration & Bounded Execution Limits

To prevent accidental credit exhaustion or unexpected credit card charges, the empirical pilot enforces hard request ceilings:

```
┌────────────────────────────────────────────────────────┐
│             HARD PILOT BOUNDARY LIMITS                 │
├────────────────────────────────────────────────────────┤
│ Max Search Queries per Provider:      12               │
│ Max Returned Results per Query:        5 URLs          │
│ Max Page Extractions across Pilot:    12 pages         │
│ Maximum Allowed Spend per Pilot:       $2.00 USD       │
└────────────────────────────────────────────────────────┘
```

### Variables Held Constant
- **Exact Query Strings:** Queries submitted verbatim as defined in `VS-BENCH-60`.
- **Result Limits:** Fixed to `num_results = 5` for both providers.
- **Client Environment:** Identical Node.js test harness executing from the same host network.
- **Timing Measurement:** High-resolution `process.hrtime.bigint()` measuring socket dispatch to complete response JSON parse.

### Permitted Provider-Specific Parameters
- **Tavily:** `search_depth: "basic"`, `include_raw_content: false`, `max_results: 5`.
- **Exa:** `type: "auto"`, `useAutoprompt: true`, `numResults: 5`, `contents: { text: true }`.

---

## 4. Evaluation Criteria & Metrics

For each query and extracted page, the evaluation records:

### 4.1 Search Metrics
1. **Total Results Returned:** Count of URLs returned (target: 5).
2. **Canonical Domain Diversity:** Count of unique second-level domains (`apex.com`, `newegg.com`).
3. **Relevance Ratio:** Percentage of results directly discussing the target entity (rated 0–100%).
4. **Reference Source Recovery:** Whether the official or authoritative reference URL recorded in `VS-BENCH-60` was discovered in the top 5 results.
5. **Search Latency (ms):** Elapsed milliseconds for the search request.

### 4.2 Extraction Metrics
1. **Extraction Success Rate:** HTTP 200 and successful markdown/text extraction (100% or 0%).
2. **Main Content Fidelity:** Retained product description and specs vs stripped navigation boilerplate.
3. **Price/Spec Presence:** Presence of target numeric price and specifications in extracted text.
4. **Extraction Latency (ms):** Elapsed milliseconds for the extraction request.

---

## 5. Execution Instructions (When Authorized)

When explicit budget authorization is granted by the user:

1. **Set Environment Keys & Spending Cap:**
   ```bash
   $env:VERITYSCOUT_RUN_LIVE_BENCHMARK="true"
   $env:VERITYSCOUT_MAX_SPEND_USD="2.00"
   $env:TAVILY_API_KEY="tvly-..."
   $env:EXA_API_KEY="..."
   $env:FIRECRAWL_API_KEY="fc-..."
   ```

2. **Execute Isolated Benchmark Runner:**
   ```bash
   node scripts/benchmark/provider_eval_runner.js
   ```

3. **Output Artifacts Generated:**
   The runner automatically populates `data/benchmark/provider-evaluation-results.json` with timestamped Class B measurements and updates `provider-evaluation-matrix.csv`.

---
*End of Reproducible Provider Benchmark Protocol — VerityScout AI*
