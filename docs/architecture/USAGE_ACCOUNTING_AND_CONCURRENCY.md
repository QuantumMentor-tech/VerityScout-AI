# VerityScout AI — Usage Accounting, Cost Tracking, and Concurrency Management

**Architecture Document**  
**Phase:** 9 of 12 (Model Routing and Asynchronous Research)  
**Step:** 45 of 60  
**Status:** Approved Canonical Specification  
**Governing Documents:** ADR-002, ADR-004, ADR-010, DATA_CONTRACTS.md  

---

## 1. Overview and Design Principles

VerityScout AI provides an evidence-first, audit-transparent architecture for all AI model operations. Step 45 establishes a durable, provider-aware accounting and distributed concurrency layer that ensures:

1. **Granular, Honest Usage Accounting:**
   - Every inference request (e.g. claim extraction, research synthesis) is captured in an append-only, tenant-isolated ledger (`model_usage_events`).
   - Normalizes input/prompt tokens, output/completion tokens, total tokens, cached prompt tokens, and reasoning tokens across providers (OpenAI, OpenRouter, and self-hosted NVIDIA NIM).
   - Distinguishes provenance states: `PROVIDER_REPORTED`, `LOCALLY_ESTIMATED`, `PARTIAL`, and `UNKNOWN`. Missing token counts are never silently converted into zero.

2. **Decimal-Safe Monetary Cost Tracking:**
   - Evaluates costs per 1M tokens against versioned model catalog rates (`STATIC_BUNDLED_CATALOG`, pricing version `2026-11-catalog-v1`).
   - Implements integer-scaled nano-dollar arithmetic `(tokens * ratePer1M * 1,000,000,000) / 1,000,000` formatted to 6 decimal places (`0.000001` USD) to prevent IEEE-754 floating-point inaccuracies.
   - Preserves cost statuses: `CALCULATED_ESTIMATE`, `PROVIDER_REPORTED_COST`, and `UNKNOWN_COST`. Unlisted or missing pricing entries return `null` and `UNKNOWN_COST` without fabricating $0.00.
   - NVIDIA NIM developer tier and self-hosted containers are explicitly tracked as `$0.000000` with descriptive rationale ("zero marginal cloud fee").

3. **Distributed PostgreSQL-Backed Concurrency Slots:**
   - Coordinates concurrent LLM inference across multiple distributed worker processes without relying on external non-PostgreSQL systems.
   - Allocates atomic numbered slots (`1..N`) per scope (`global`, `provider:openai`, `provider:openrouter`, `provider:nim`, `user:<id>`) backed by the `concurrency_slots` table with unique constraint `(scope_key, slot_number)`.
   - Incorporates lease expirations (TTL) to prevent orphaned slots if a worker process crashes, accompanied by guaranteed release in `finally` blocks.

4. **Strict Idempotency & Retry Attribution:**
   - Unique `idempotency_key` constraint on `model_usage_events` prevents double-counting duplicate webhooks or retried orchestrator passes.
   - Pipeline retries record discrete attempts (`attempt = 1, 2, ...`), isolating token expenditures per attempt while accurately rolling up the total run usage.

---

## 2. Relational Schema Architecture (Migration 0007)

### `model_usage_events` Table

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique event identifier |
| `user_id` | `UUID` | `NOT NULL` | Multi-tenant user owner (RLS isolated) |
| `run_id` | `UUID` | `REFERENCES research_runs(id) ON DELETE SET NULL` | Linked research run |
| `task_id` | `UUID` | `REFERENCES research_tasks(id) ON DELETE SET NULL` | Linked research task |
| `attempt` | `INT` | `NOT NULL DEFAULT 1` | Orchestrator pipeline attempt number |
| `provider_id` | `VARCHAR(50)` | `NOT NULL` | AI Provider (`openai`, `openrouter`, `nim`) |
| `model_id` | `VARCHAR(100)` | `NOT NULL` | Native model identifier |
| `operation_type` | `VARCHAR(50)` | `NOT NULL` | Operation (`claim_extraction`, `research_synthesis`) |
| `request_id` | `VARCHAR(128)` | `NULL` | Upstream provider request ID |
| `idempotency_key` | `VARCHAR(128)` | `NOT NULL UNIQUE` | Deterministic deduplication key |
| `input_tokens` | `INT` | `CHECK (input_tokens >= 0)` | Prompt tokens consumed |
| `output_tokens` | `INT` | `CHECK (output_tokens >= 0)` | Completion tokens generated |
| `total_tokens` | `INT` | `CHECK (total_tokens >= 0)` | Total tokens |
| `cached_tokens` | `INT` | `CHECK (cached_tokens >= 0)` | Prompt tokens served from cache |
| `reasoning_tokens` | `INT` | `CHECK (reasoning_tokens >= 0)` | Reasoning/thinking tokens |
| `usage_source` | `VARCHAR(50)` | `NOT NULL DEFAULT 'PROVIDER_REPORTED'` | `PROVIDER_REPORTED`, `LOCALLY_ESTIMATED`, `PARTIAL`, `UNKNOWN` |
| `estimated_cost_usd` | `NUMERIC(12, 6)` | `NULL` | Decimal-safe calculated cost |
| `provider_cost_usd` | `NUMERIC(12, 6)` | `NULL` | Direct provider reported cost |
| `currency` | `VARCHAR(10)` | `NOT NULL DEFAULT 'USD'` | Currency denomination |
| `cost_status` | `VARCHAR(50)` | `NOT NULL DEFAULT 'CALCULATED_ESTIMATE'` | `CALCULATED_ESTIMATE`, `PROVIDER_REPORTED_COST`, `UNKNOWN_COST` |
| `pricing_version` | `VARCHAR(50)` | `NULL` | Pricing rate version |
| `cost_explanation` | `TEXT` | `NULL` | Audit trail explanation |
| `latency_ms` | `INT` | `NULL` | Upstream call round-trip latency |
| `metadata` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Extensible metadata |
| `recorded_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Immutable ledger timestamp |

### `concurrency_slots` Table

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique slot lease ID |
| `scope_key` | `VARCHAR(100)` | `NOT NULL` | Isolation scope (`global`, `provider:openai`, etc.) |
| `holder_id` | `VARCHAR(128)` | `NOT NULL` | Identifier of worker holding lease |
| `slot_number` | `INT` | `NOT NULL CHECK (slot_number >= 1)` | Sequence slot number |
| `max_slots` | `INT` | `NOT NULL CHECK (max_slots >= 1)` | Upper capacity limit |
| `lease_expires_at` | `TIMESTAMPTZ` | `NOT NULL` | Lease expiration timestamp (TTL) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Allocation timestamp |

*Unique Index:* `UNIQUE (scope_key, slot_number)` prevents slot over-allocation at the database engine level.

---

## 3. Distributed Concurrency Algorithm

The PostgreSQL atomic slot allocation performs:
1. Purging of expired leases (`DELETE WHERE scope_key = $1 AND lease_expires_at < NOW()`).
2. Re-validation of existing holder leases.
3. Candidate slot generation (`generate_series(1, max_slots)`) joined against active leases to select the lowest free slot number `availableSlot`.
4. Inserting the slot record with unique constraint protection:
   ```sql
   INSERT INTO concurrency_slots (scope_key, holder_id, slot_number, max_slots, lease_expires_at)
   VALUES ($1, $2, $3, $4, NOW() + ($5 || ' milliseconds')::interval)
   RETURNING *
   ```

When contention occurs, workers perform exponential jittered polling up to `acquisitionTimeoutMs` before safely timing out with `ConcurrencyLimitExceededError`.

---

## 4. API Endpoints

- **`GET /api/research/runs/[runId]/usage`:**
  - Authenticated and strictly user-isolated.
  - Returns run-level totals (`totalTokens`, `totalEstimatedCostUsd`, `cachedTokens`, `reasoningTokens`), breakdown by operation, breakdown by model, and raw usage events.
- **`GET /api/settings/usage`:**
  - Authenticated user account usage summary.
  - Returns aggregated tokens and estimated costs grouped by provider and operation type across all user research runs.

