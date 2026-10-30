# VerityScout AI — Benchmark Dataset Guide
**Dataset Version:** 1.0.0-FROZEN  
**File Formats:** JSON Lines (`verityscout_benchmark.jsonl`), CSV (`verityscout_benchmark.csv`), JSON Schema (`benchmark.schema.json`)  
**Total Cases:** 60 (`VS-BENCH-001` through `VS-BENCH-060`)  
**Directory Path:** `data/benchmark/`  

---

## 1. Dataset Overview

The VerityScout AI Benchmark Dataset is the standard ground-truth evaluation corpus for the VerityScout research engine. It contains **exactly 60 curated research inquiries** designed to evaluate query parsing, constraint satisfaction, web discovery, source extraction, and deterministic verification.

### File Manifest

| File Path | Format | Description |
| :--- | :---: | :--- |
| [`data/benchmark/verityscout_benchmark.jsonl`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/data/benchmark/verityscout_benchmark.jsonl) | JSONL | **Canonical ground truth.** 60 JSON objects (one per line) conforming to schema. |
| [`data/benchmark/verityscout_benchmark.csv`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/data/benchmark/verityscout_benchmark.csv) | CSV | Human-readable spreadsheet format reconciled 1:1 with the canonical JSONL. |
| [`data/benchmark/benchmark.schema.json`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/data/benchmark/benchmark.schema.json) | JSON | Draft 2020-12 JSON Schema validating all case records and field types. |
| [`tests/fixtures/benchmark/sources/`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20%28working%29/tests/fixtures/benchmark/sources/) | JSON | 10 controlled synthetic test fixtures for deterministic chaos and security tests. |

---

## 2. Case Identification & Category Partitioning

Case IDs are permanently assigned in the sequential format `VS-BENCH-xxx`:

| Category ID | Category Name | Case Range | Count | Primary Focus |
| :---: | :--- | :---: | :---: | :--- |
| **A** | `hardware_research` | `VS-BENCH-001` – `015` | **15** | GPUs, CPUs, VRAM, condition, price ceiling boundaries, volatile stock |
| **B** | `pc_components` | `VS-BENCH-016` – `025` | **10** | Cases, radiators, dimensions, fans, USB-C, form factors, near-matches |
| **C** | `general_research` | `VS-BENCH-026` – `040` | **15** | Multi-source comparison, technical whitepapers, freshness, anti-syndication |
| **D** | `constraint_ambiguity` | `VS-BENCH-041` – `050` | **10** | Currency ambiguity, missing regions, contradictions, negative budgets |
| **E** | `evidence_integrity_failures` | `VS-BENCH-051` – `060` | **10** | HTTP 403/504 errors, deduplication, prompt injection, citation checking |
| **Total** | | | **60** | |

---

## 3. How to Read a Benchmark Record

Each JSON line in `verityscout_benchmark.jsonl` contains the following structured attributes:

```json
{
  "case_id": "VS-BENCH-001",
  "title": "RTX 4070 Super 12GB VRAM Exact Specification Procurement",
  "category": "hardware_research",
  "task_type": "product_procurement",
  "query": "Find an NVIDIA GeForce RTX 4070 Super 12GB graphics card in new condition under $600 USD...",
  "priority": "P0",
  "difficulty": "medium",
  "ground_truth_mode": "synthetic_fixture",
  "expected_behavior": "System parses entity as RTX 4070 Super, price ceiling $600...",
  "expected_constraints": {
    "target_entity": "NVIDIA GeForce RTX 4070 Super",
    "price_ceiling": 600.0,
    "price_floor": null,
    "currency": "USD",
    "market_region": "US",
    "condition": "NEW",
    "mandatory_attributes": ["12GB VRAM", "3x DisplayPort"],
    "excluded_attributes": [],
    "excluded_domains": [],
    "clarification_needed": false
  },
  "required_checks": [
    {
      "check_id": "CHK-001-A",
      "dimension": "query_understanding",
      "assertion": "price_ceiling == 600 && currency == 'USD' && condition == 'NEW'",
      "eval_type": "exact_match"
    }
  ],
  "forbidden_outcomes": [
    "Admitting an item priced at $600.01 or higher into Strong Match",
    "Confusing RTX 4070 non-Super with RTX 4070 Super"
  ],
  "source_references": [ ... ],
  "fixture_references": [ "tests/fixtures/benchmark/sources/gpu_new_under_budget.json" ],
  "source_validation_status": "synthetic_fixture_backed",
  "traceability": {
    "requirements": ["UR-001", "UR-002", "UR-011"],
    "acceptance_criteria": ["AC-001", "AC-002", "AC-011"]
  },
  "notes": "Baseline positive test for Category A hardware procurement."
}
```

---

## 4. Ground-Truth Modes & Staleness Rules

### 4.1 Ground-Truth Modes
- **`static` (44 cases):** Immutable logic rules (e.g. `$600.01 > $600.00`). Does not expire.
- **`synthetic_fixture` (13 cases):** Bound to local synthetic JSON fixtures in `tests/fixtures/benchmark/sources/`. Guaranteed reproducible forever.
- **`live_snapshot` (3 cases):** Captures real-world web observations at a specific timestamp (`checked_at: "2026-10-30T10:00:00Z"`).

### 4.2 Handling Staleness in Live Snapshots
Live snapshot observations reflect market conditions at the documented `checked_at` timestamp. When running evaluations in future steps:
- If a live merchant changes their price or sells out, the test runner must compare against the recorded snapshot observation rather than penalizing the engine for live market changes.
- To refresh a live snapshot, follow the formal Label Correction Procedure in Section 5.

---

## 5. Label Correction & Governance Procedure

Gold labels are permanent standards and must not be modified simply because a candidate model produces a different answer. To propose an official label correction:

1. **Verify External Ground Truth:** Document authentic manufacturer whitepapers, errata notices, or architectural documentation proving the existing label is factually incorrect.
2. **Draft Modification in `DECISION_REGISTER.md`:** Create an official entry under Section 4 with rationale, diff, and impact.
3. **Run Synchronized Updates:** Simultaneously update `verityscout_benchmark.jsonl`, `verityscout_benchmark.csv`, and `RESEARCH_BENCHMARK_SPEC.md`.
4. **Validate Schema & Consistency:** Execute `node scratch/validate_benchmark.js` to ensure 100% schema compliance and zero orphaned references.

---

## 6. Security & Secret Safeguards

- **Zero Secrets Policy:** The dataset must never contain API keys, bearer tokens, passwords, private session cookies, or personal user data.
- **Harmless Fixtures:** All adversarial test fixtures (such as indirect prompt injection in `VS-BENCH-058`) utilize benign instructional overrides (e.g., attempting to set price to $0.00). No live malware, exploit code, or destructive payloads are permitted.
- **Zero Paid Calls:** Evaluating against the benchmark harness during development must default to local fixtures and mock search proxies to prevent accidental billing charges.

---
*End of Benchmark Dataset Guide — VerityScout AI*
