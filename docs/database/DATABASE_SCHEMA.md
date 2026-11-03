# PostgreSQL Relational Database Schema Specification

**Document Identifier:** VS-DB-SCHEMA-v1.0  
**Phase:** Phase 5 of 12 (Data Persistence & PostgreSQL Schema Architecture)  
**Step:** 21 of 60  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Target Engine:** PostgreSQL 16 (Local Docker Dev & Supabase Managed Database)  
**Governing Documents:** `ADR-003`, `ADR-007`, `ADR-008`, `ADR-010`, `DATA_CONTRACTS.md`, `THREAT_MODEL.md`

---

## 1. Schema Scope & Architectural Foundation

This specification establishes the canonical relational database schema for **VerityScout AI**. It defines the tables, columns, constraints, foreign key cascades, data types, indexes, and Row-Level Security (RLS) policies required to support evidence-grounded research, autonomous multi-source extraction, candidate evaluation, recurring schedules, change detection, and provider cost tracking.

### 1.1 Core Tenets
1. **Relational Traceability:** Every factual finding (`candidate_results`) must trace backward via foreign keys to supporting excerpts (`evidence_records`), and every evidence excerpt must trace backward to a specific retrieved web document (`source_documents`) and run (`research_runs`).
2. **Deterministic Data Integrity:** Integrity constraints (UUID primary keys, foreign key cascading, enumeration check constraints, exact decimal monetary types) are enforced strictly at the database layer.
3. **Defense-in-Depth Ownership:** Every user-owned table includes a `user_id UUID NOT NULL` column with PostgreSQL Row-Level Security (`ENABLE ROW LEVEL SECURITY`) enforcing tenant isolation.
4. **Secret Vault Isolation:** User provider API keys are never stored in plaintext metadata columns. They are encrypted with AES-256-GCM and segregated into an isolated vault table (`provider_vault_secrets`).
5. **Exact Monetary Storage:** Prices, budgets, and costs are stored as exact decimal numeric types (`NUMERIC(12, 4)` or `NUMERIC(12, 6)`), completely avoiding binary floating-point representation errors.

---

## 2. Table-by-Table Schema Specification

### 2.1 `research_tasks`
Stores persistent user research definitions, constraint configurations, operational guardrails, and model policies.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (RFC 4122 UUIDv4) |
| `user_id` | `UUID` | No | — | Owner foreign key (RLS boundary) |
| `title` | `VARCHAR(200)` | No | — | User-facing research title |
| `original_query` | `TEXT` | No | — | Natural language prompt (`length <= 1000`) |
| `task_type` | `VARCHAR(50)` | No | — | `PRODUCT_RESEARCH`, `GENERAL_RESEARCH`, `PRICE_MONITOR`, `SPEC_VERIFICATION` |
| `constraints` | `JSONB` | No | `'{}'` | Evaluated constraint payload (price, condition, brand, specs) |
| `limits` | `JSONB` | No | *preset* | Operational limits (`maxSources`, `maxSearchQueries`, `maxRunCostUsd`, `searchDepth`) |
| `model_policy` | `JSONB` | No | *preset* | Provider preference and allowed fallback whitelist (`SEC-031`) |
| `is_archived` | `BOOLEAN` | No | `FALSE` | Soft-archive flag |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp (UTC ISO 8601) |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Last modification timestamp (UTC ISO 8601) |

- **Check Constraints:**
  - `chk_research_tasks_query_len`: `length(original_query) <= 1000`
  - `chk_research_tasks_type`: `task_type IN ('PRODUCT_RESEARCH', 'GENERAL_RESEARCH', 'PRICE_MONITOR', 'SPEC_VERIFICATION')`
- **Indexes:**
  - `idx_research_tasks_user_id` on `(user_id)`
  - `idx_research_tasks_created_at` on `(created_at DESC)`
  - `idx_research_tasks_active` on `(user_id, is_archived)` WHERE `NOT is_archived`

---

### 2.2 `research_schedules`
Defines automated periodic recurrence rules for research tasks.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `task_id` | `UUID` | No | — | FK -> `research_tasks(id)` `ON DELETE CASCADE` |
| `user_id` | `UUID` | No | — | Owner identifier |
| `status` | `VARCHAR(50)` | No | `'ACTIVE'` | `ACTIVE`, `PAUSED`, `DISABLED_ERROR`, `ARCHIVED` |
| `cron_expression` | `VARCHAR(100)` | No | — | 5-field cron expression (min 6-hour interval per SEC-036) |
| `timezone` | `VARCHAR(100)` | No | `'UTC'` | IANA timezone identifier (e.g. `America/New_York`) |
| `last_run_at` | `TIMESTAMPTZ` | Yes | `NULL` | Timestamp of previous execution |
| `next_run_at` | `TIMESTAMPTZ` | No | — | Timestamp of next scheduled trigger |
| `consecutive_failures` | `INTEGER` | No | `0` | Consecutive failure count (trips circuit breaker at 5) |
| `change_notification_threshold_pct` | `NUMERIC(5, 2)` | No | `2.00` | Minimum delta percentage to trigger notification (e.g. 2%) |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Record update timestamp |

- **Check Constraints:**
  - `chk_research_schedules_status`: `status IN ('ACTIVE', 'PAUSED', 'DISABLED_ERROR', 'ARCHIVED')`
  - `chk_research_schedules_failures`: `consecutive_failures >= 0`
  - `chk_research_schedules_threshold`: `change_notification_threshold_pct >= 0.00`
- **Indexes:**
  - `idx_research_schedules_task_id` on `(task_id)`
  - `idx_research_schedules_user_id` on `(user_id)`
  - `idx_research_schedules_due` on `(status, next_run_at)` WHERE `status = 'ACTIVE'`

---

### 2.3 `research_runs`
Records an individual execution of a research task.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `task_id` | `UUID` | No | — | FK -> `research_tasks(id)` `ON DELETE CASCADE` |
| `user_id` | `UUID` | No | — | Owner identifier for direct RLS enforcement |
| `schedule_id` | `UUID` | Yes | `NULL` | Optional FK -> `research_schedules(id)` `ON DELETE SET NULL` |
| `idempotency_key` | `VARCHAR(64)` | No | — | SHA256 hex string preventing duplicate dispatches |
| `status` | `VARCHAR(50)` | No | `'QUEUED'` | `QUEUED`, `RUNNING`, `COMPLETED`, `PARTIALLY_COMPLETED`, `FAILED`, `CANCELLATION_REQUESTED`, `CANCELLED` |
| `current_stage` | `VARCHAR(50)` | No | `'INITIATED'` | `INITIATED`, `PLANNING`, `SEARCHING`, `EXTRACTING`, `VERIFYING`, `SYNTHESIZING`, `FINALIZING` |
| `stage_counters` | `JSONB` | No | *preset* | Progress counters (`queriesExecuted`, `sourcesDiscovered`, etc.) |
| `usage` | `JSONB` | No | *preset* | Run consumption (`promptTokens`, `completionTokens`, `estimatedCostUsd`) |
| `selected_provider` | `VARCHAR(50)` | Yes | `NULL` | AI provider that synthesized run |
| `selected_model` | `VARCHAR(100)` | Yes | `NULL` | Model identifier used for synthesis |
| `error_message` | `TEXT` | Yes | `NULL` | Sanitized failure message (zero secret reflection) |
| `cancellation_reason` | `TEXT` | Yes | `NULL` | Reason recorded if run was cancelled |
| `started_at` | `TIMESTAMPTZ` | No | `NOW()` | Start timestamp |
| `completed_at` | `TIMESTAMPTZ` | Yes | `NULL` | Terminal completion timestamp |

- **Check Constraints:**
  - `chk_research_runs_status`: `status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLATION_REQUESTED', 'CANCELLED')`
  - `chk_research_runs_stage`: `current_stage IN ('INITIATED', 'PLANNING', 'SEARCHING', 'EXTRACTING', 'VERIFYING', 'SYNTHESIZING', 'FINALIZING')`
  - `uq_research_runs_idempotency`: `UNIQUE (task_id, idempotency_key)`
- **Indexes:**
  - `idx_research_runs_task_id` on `(task_id)`
  - `idx_research_runs_user_id` on `(user_id)`
  - `idx_research_runs_status` on `(status)`
  - `idx_research_runs_started_at` on `(started_at DESC)`

---

### 2.4 `source_documents`
Represents discovered web page metadata, access states, and bounded raw text excerpts.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `run_id` | `UUID` | No | — | FK -> `research_runs(id)` `ON DELETE CASCADE` |
| `user_id` | `UUID` | No | — | Owner identifier |
| `original_url` | `TEXT` | No | — | Initial URL discovered from search engine |
| `canonical_url` | `TEXT` | No | — | Normalized URL with tracking query parameters removed |
| `domain` | `VARCHAR(255)` | No | — | Extracted hostname (e.g. `psref.lenovo.com`) |
| `title` | `TEXT` | No | — | Sanitized web page title |
| `discovery_provider` | `VARCHAR(50)` | No | — | Discovery mechanism (`tavily`, `exa`, `direct`) |
| `access_state` | `VARCHAR(50)` | No | — | `ACCESSIBLE`, `BLOCKED_BOT_CHALLENGE`, `HTTP_ERROR`, `TIMEOUT`, `DNS_RESOLUTION_FAILED`, `SSRF_PROHIBITED` |
| `extraction_state` | `VARCHAR(50)` | No | — | `SUCCESS`, `EMPTY_BODY`, `PAYLOAD_TOO_LARGE`, `PARSING_FAILED`, `SKIPPED` |
| `http_status_code` | `INTEGER` | Yes | `NULL` | HTTP response code (100–599) |
| `content_hash` | `CHAR(64)` | Yes | `NULL` | SHA256 hex digest of raw extracted text |
| `extracted_text_excerpt` | `TEXT` | No | `''` | Bounded text excerpt (< 50KB per SEC-032) |
| `retrieved_at` | `TIMESTAMPTZ` | No | `NOW()` | Retrieval timestamp |
| `published_at` | `TIMESTAMPTZ` | Yes | `NULL` | Document publication timestamp if advertised |

- **Check Constraints:**
  - `chk_source_documents_access_state`: `access_state IN ('ACCESSIBLE', 'BLOCKED_BOT_CHALLENGE', 'HTTP_ERROR', 'TIMEOUT', 'DNS_RESOLUTION_FAILED', 'SSRF_PROHIBITED')`
  - `chk_source_documents_extraction_state`: `extraction_state IN ('SUCCESS', 'EMPTY_BODY', 'PAYLOAD_TOO_LARGE', 'PARSING_FAILED', 'SKIPPED')`
  - `chk_source_documents_http_code`: `http_status_code IS NULL OR (http_status_code >= 100 AND http_status_code <= 599)`
  - `chk_source_documents_excerpt_len`: `octet_length(extracted_text_excerpt) <= 51200`
- **Indexes:**
  - `idx_source_documents_run_id` on `(run_id)`
  - `idx_source_documents_user_id` on `(user_id)`
  - `idx_source_documents_domain` on `(domain)`
  - `idx_source_documents_canonical_url` on `(canonical_url)`
  - `uq_source_documents_run_canonical` UNIQUE on `(run_id, canonical_url)` (Step 35 canonical deduplication)

---

### 2.4.1 `source_discoveries`
Stores discrete search discovery events linking query variant leads to canonical source documents.
Traceability: `DATA_CONTRACTS.md Section 3.3.1`, `UR-006`, `AC-006`, Step 35.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `source_document_id` | `UUID` | No | — | FK -> `source_documents(id)` `ON DELETE CASCADE` |
| `run_id` | `UUID` | No | — | FK -> `research_runs(id)` `ON DELETE CASCADE` |
| `user_id` | `UUID` | No | — | Owner identifier |
| `query_variant_id` | `VARCHAR(100)` | Yes | `NULL` | ID of query variant from research plan |
| `query_text` | `TEXT` | No | — | Verbatim query string dispatched |
| `discovery_provider` | `VARCHAR(50)` | No | — | Search engine identifier (`tavily`, `exa`, etc.) |
| `provider_result_id` | `VARCHAR(255)` | Yes | `NULL` | Upstream provider-specific result ID |
| `original_url` | `TEXT` | No | — | Raw URL discovered (including tracking params) |
| `title` | `TEXT` | No | — | Title reported at discovery |
| `snippet` | `TEXT` | Yes | `NULL` | Search snippet excerpt |
| `relevance_score` | `NUMERIC(5, 4)` | Yes | `NULL` | Provider relevance score |
| `discovered_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp of discovery event |

- **Indexes:**
  - `idx_source_discoveries_source_id` on `(source_document_id)`
  - `idx_source_discoveries_run_id` on `(run_id)`
  - `idx_source_discoveries_user_id` on `(user_id)`
  - `idx_source_discoveries_query_variant` on `(query_variant_id)`

---

### 2.5 `candidate_results`
Stores research findings and structured products evaluated against user constraints.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `run_id` | `UUID` | No | — | FK -> `research_runs(id)` `ON DELETE CASCADE` |
| `user_id` | `UUID` | No | — | Owner identifier |
| `title` | `TEXT` | No | — | Candidate or product name |
| `product_identifier` | `VARCHAR(100)` | Yes | `NULL` | SKU, MPN, or UPC identifier |
| `seller_or_domain` | `VARCHAR(255)` | No | — | Retailer, merchant, or publisher |
| `canonical_url` | `TEXT` | No | — | Direct product link |
| `price_usd` | `NUMERIC(12, 4)` | Yes | `NULL` | Exact evaluated price decimal |
| `currency` | `VARCHAR(3)` | No | `'USD'` | ISO 4217 currency code |
| `availability` | `VARCHAR(50)` | No | `'UNKNOWN'` | `IN_STOCK`, `OUT_OF_STOCK`, `UNKNOWN` |
| `condition` | `VARCHAR(50)` | No | `'UNKNOWN'` | `NEW`, `REFURBISHED`, `USED`, `UNKNOWN` |
| `specifications` | `JSONB` | No | `'{}'` | Key-value specification map |
| `classification` | `VARCHAR(50)` | No | — | `EXACT_MATCH`, `NEAR_MATCH`, `PARTIALLY_VERIFIED`, `CONFLICTING`, `EXCLUDED` |
| `constraint_evaluation` | `JSONB` | No | *preset* | Passed/failed constraint key arrays and mismatch reasons |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Record creation timestamp |

- **Check Constraints:**
  - `chk_candidate_results_price`: `price_usd IS NULL OR price_usd >= 0.0000`
  - `chk_candidate_results_availability`: `availability IN ('IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN')`
  - `chk_candidate_results_condition`: `condition IN ('NEW', 'REFURBISHED', 'USED', 'UNKNOWN')`
  - `chk_candidate_results_classification`: `classification IN ('EXACT_MATCH', 'NEAR_MATCH', 'PARTIALLY_VERIFIED', 'CONFLICTING', 'EXCLUDED')`
- **Indexes:**
  - `idx_candidate_results_run_id` on `(run_id)`
  - `idx_candidate_results_user_id` on `(user_id)`
  - `idx_candidate_results_classification` on `(classification)`
  - `idx_candidate_results_price` on `(price_usd)`

---

### 2.6 `evidence_records`
Maintains verified or contradicted factual claims backed by verbatim textual quotes.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `run_id` | `UUID` | No | — | FK -> `research_runs(id)` `ON DELETE CASCADE` |
| `source_id` | `UUID` | No | — | FK -> `source_documents(id)` `ON DELETE CASCADE` |
| `user_id` | `UUID` | No | — | Owner identifier |
| `candidate_id` | `UUID` | Yes | `NULL` | Optional FK -> `candidate_results(id)` `ON DELETE SET NULL` |
| `claim_key` | `VARCHAR(100)` | No | — | Evaluated claim attribute (e.g. `price`, `memory_ram`) |
| `extracted_raw_value` | `TEXT` | No | — | Raw literal value from document (e.g. `"$649.99"`) |
| `normalized_value` | `TEXT` | No | — | Typed string value (e.g. `"649.99"`, `"32"`) |
| `unit_or_currency` | `VARCHAR(20)` | Yes | `NULL` | Unit string (`USD`, `GB`, `mm`) |
| `verbatim_quote` | `TEXT` | No | — | Exact unaltered text excerpt from source |
| `verification_state` | `VARCHAR(50)` | No | — | `SUPPORTED`, `CONTRADICTED`, `UNKNOWN`, `CONFLICTING`, `STALE` |
| `conflict_details` | `TEXT` | Yes | `NULL` | Explanation if conflicting with another source |
| `extraction_method` | `VARCHAR(50)` | No | — | `LLM_STRUCTURED`, `REGEX_DETERMINISTIC`, `META_TAG`, `DOM_SELECTOR` |
| `location_in_document` | `TEXT` | Yes | `NULL` | Page section, CSS selector, or table coordinates |
| `confidence_score` | `NUMERIC(5, 4)` | Yes | `NULL` | Confidence score between `0.0000` and `1.0000` |
| `extracted_at` | `TIMESTAMPTZ` | No | `NOW()` | Extraction timestamp |

- **Check Constraints:**
  - `chk_evidence_records_verification`: `verification_state IN ('SUPPORTED', 'CONTRADICTED', 'UNKNOWN', 'CONFLICTING', 'STALE')`
  - `chk_evidence_records_method`: `extraction_method IN ('LLM_STRUCTURED', 'REGEX_DETERMINISTIC', 'META_TAG', 'DOM_SELECTOR')`
  - `chk_evidence_records_confidence`: `confidence_score IS NULL OR (confidence_score >= 0.0000 AND confidence_score <= 1.0000)`
- **Indexes:**
  - `idx_evidence_records_run_id` on `(run_id)`
  - `idx_evidence_records_source_id` on `(source_id)`
  - `idx_evidence_records_candidate_id` on `(candidate_id)`
  - `idx_evidence_records_claim_key` on `(claim_key)`
  - `idx_evidence_records_verification_state` on `(verification_state)`

---

### 2.7 `candidate_evidence_links`
Normalized N-to-M junction table preserving claim-to-evidence referential integrity.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `candidate_id` | `UUID` | No | — | FK -> `candidate_results(id)` `ON DELETE CASCADE` |
| `evidence_id` | `UUID` | No | — | FK -> `evidence_records(id)` `ON DELETE CASCADE` |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Junction creation timestamp |

- **Primary Key:** `(candidate_id, evidence_id)`
- **Index:** `idx_candidate_evidence_links_evidence_id` on `(evidence_id)`

---

### 2.8 `provider_configurations`
Stores non-secret metadata and enabled status for AI and search providers.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `user_id` | `UUID` | No | — | Owner identifier |
| `provider_id` | `VARCHAR(50)` | No | — | `openai`, `openrouter`, `nim`, `tavily`, `exa`, `firecrawl` |
| `is_enabled` | `BOOLEAN` | No | `TRUE` | Whether provider is enabled for research tasks |
| `selected_model_id` | `VARCHAR(100)` | Yes | `NULL` | Pinned or default model identifier |
| `custom_base_url` | `TEXT` | Yes | `NULL` | Optional private/custom base endpoint |
| `has_credential` | `BOOLEAN` | No | `FALSE` | Indicates encrypted secret exists in vault |
| `credential_preview` | `VARCHAR(20)` | Yes | `NULL` | Safe masked preview string (`sk-...4a89`, SEC-001) |
| `last_connection_test_at` | `TIMESTAMPTZ` | Yes | `NULL` | Timestamp of last health check |
| `last_connection_test_status` | `VARCHAR(50)` | Yes | `NULL` | `SUCCESS`, `FAILED`, `UNTESTED` |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Record update timestamp |

- **Uniqueness & Check Constraints:**
  - `uq_provider_configs_user_provider`: `UNIQUE (user_id, provider_id)`
  - `chk_provider_configs_provider`: `provider_id IN ('openai', 'openrouter', 'nim', 'tavily', 'exa', 'firecrawl')`
  - `chk_provider_configs_test_status`: `last_connection_test_status IS NULL OR last_connection_test_status IN ('SUCCESS', 'FAILED', 'UNTESTED')`
- **Index:** `idx_provider_configs_user_id` on `(user_id)`

---

### 2.9 `provider_vault_secrets`
Stores user-supplied provider API keys encrypted via AES-256-GCM. Isolated from metadata tables.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `user_id` | `UUID` | No | — | Owner identifier |
| `provider_id` | `VARCHAR(50)` | No | — | Provider identifier |
| `encrypted_blob` | `BYTEA` | No | — | Ciphertext payload |
| `initialization_vector` | `BYTEA` | No | — | Exactly 12 bytes IV (`length = 12`) |
| `auth_tag` | `BYTEA` | No | — | Exactly 16 bytes GCM tag (`length = 16`) |
| `key_version` | `INTEGER` | No | `1` | Master key version identifier |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Last rotation timestamp |

- **Uniqueness & Check Constraints:**
  - `uq_provider_vault_user_provider`: `UNIQUE (user_id, provider_id)`
  - `chk_provider_vault_iv_len`: `octet_length(initialization_vector) = 12`
  - `chk_provider_vault_tag_len`: `octet_length(auth_tag) = 16`
- **Index:** `idx_provider_vault_user_id` on `(user_id)`

---

### 2.10 `change_events`
Records audited differences detected between consecutive executions of scheduled tasks.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `task_id` | `UUID` | No | — | FK -> `research_tasks(id)` `ON DELETE CASCADE` |
| `schedule_id` | `UUID` | Yes | `NULL` | FK -> `research_schedules(id)` `ON DELETE SET NULL` |
| `user_id` | `UUID` | No | — | Owner identifier |
| `previous_run_id` | `UUID` | No | — | FK -> `research_runs(id)` `ON DELETE CASCADE` |
| `current_run_id` | `UUID` | No | — | FK -> `research_runs(id)` `ON DELETE CASCADE` |
| `change_type` | `VARCHAR(50)` | No | — | `PRICE_DROP`, `PRICE_INCREASE`, `STOCK_STATUS_CHANGE`, `SPECIFICATION_UPDATE`, `NEW_OFFER_DISCOVERED` |
| `field_name` | `VARCHAR(100)` | No | — | Field name altered (e.g. `price`, `availability`) |
| `previous_value` | `TEXT` | No | — | Value prior to run |
| `new_value` | `TEXT` | No | — | Value in current run |
| `percentage_delta` | `NUMERIC(8, 4)` | Yes | `NULL` | Signed percentage change (e.g. `-9.2700`) |
| `candidate_title` | `TEXT` | No | — | Name of product/item evaluated |
| `canonical_url` | `TEXT` | No | — | Target URL |
| `evidence_id` | `UUID` | Yes | `NULL` | Optional FK -> `evidence_records(id)` `ON DELETE SET NULL` |
| `detected_at` | `TIMESTAMPTZ` | No | `NOW()` | Detection timestamp |

- **Check Constraints:**
  - `chk_change_events_type`: `change_type IN ('PRICE_DROP', 'PRICE_INCREASE', 'STOCK_STATUS_CHANGE', 'SPECIFICATION_UPDATE', 'NEW_OFFER_DISCOVERED')`
- **Indexes:**
  - `idx_change_events_task_id` on `(task_id)`
  - `idx_change_events_schedule_id` on `(schedule_id)`
  - `idx_change_events_user_id` on `(user_id)`
  - `idx_change_events_detected_at` on `(detected_at DESC)`

---

### 2.11 `usage_ledger`
Maintains immutable financial accounting records tracking token, search, and page consumption.

| Column | Type | Nullable | Default | Description & Constraint |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key (UUIDv4) |
| `user_id` | `UUID` | No | — | Owner identifier |
| `task_id` | `UUID` | Yes | `NULL` | Optional FK -> `research_tasks(id)` `ON DELETE SET NULL` |
| `run_id` | `UUID` | Yes | `NULL` | Optional FK -> `research_runs(id)` `ON DELETE SET NULL` |
| `provider_id` | `VARCHAR(50)` | No | — | `openai`, `openrouter`, `nim`, `tavily`, `exa`, `firecrawl` |
| `model_id` | `VARCHAR(100)` | Yes | `NULL` | Model identifier if applicable |
| `operation_category` | `VARCHAR(50)` | No | — | `SEARCH`, `EXTRACTION`, `SYNTHESIS` |
| `units_consumed` | `BIGINT` | No | — | Quantity consumed (tokens, queries, pages) |
| `unit_type` | `VARCHAR(20)` | No | — | `TOKENS`, `QUERIES`, `PAGES` |
| `estimated_cost_usd` | `NUMERIC(12, 6)` | No | `0.000000` | Exact cost in USD |
| `currency` | `VARCHAR(3)` | No | `'USD'` | ISO 4217 currency |
| `recorded_at` | `TIMESTAMPTZ` | No | `NOW()` | Transaction timestamp |

- **Check Constraints:**
  - `chk_usage_ledger_provider`: `provider_id IN ('openai', 'openrouter', 'nim', 'tavily', 'exa', 'firecrawl')`
  - `chk_usage_ledger_category`: `operation_category IN ('SEARCH', 'EXTRACTION', 'SYNTHESIS')`
  - `chk_usage_ledger_unit_type`: `unit_type IN ('TOKENS', 'QUERIES', 'PAGES')`
  - `chk_usage_ledger_units`: `units_consumed >= 0`
  - `chk_usage_ledger_cost`: `estimated_cost_usd >= 0.000000`
- **Indexes:**
  - `idx_usage_ledger_user_id` on `(user_id)`
  - `idx_usage_ledger_run_id` on `(run_id)`
  - `idx_usage_ledger_recorded_at` on `(recorded_at DESC)`
  - `idx_usage_ledger_provider_time` on `(provider_id, recorded_at)`

---

## 3. Row-Level Security (RLS) Policy Architecture

All 11 tables enforce Row-Level Security:
```sql
ALTER TABLE research_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_vault_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_ledger ENABLE ROW LEVEL SECURITY;
```

RLS policies evaluate `user_id = auth.uid()` in Supabase managed environments, or `user_id = current_setting('app.current_user_id')::uuid` in direct PostgreSQL connections, providing defense-in-depth authorization against BOLA/IDOR vulnerabilities (`SEC-008`).
