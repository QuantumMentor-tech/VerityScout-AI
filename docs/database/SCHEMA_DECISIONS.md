# Database Schema Architectural Decisions

**Document Identifier:** VS-DB-DECISIONS-v1.0  
**Phase:** Phase 5 of 12 (Data Persistence & PostgreSQL Schema Architecture)  
**Step:** 21 of 60  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Governing Documents:** `ADR-003`, `ADR-007`, `ADR-010`, `DECISION_REGISTER.md`

---

## 1. Resolved Architectural Decisions

### 1.1 Primary Key Strategy: RFC 4122 UUIDv4
- **Decision:** All primary keys utilize `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- **Rationale:** 
  - Prevents sequential ID enumeration attacks (IDOR / BOLA vulnerability protection, `SEC-007`).
  - Enables client-side and worker-side ID pre-generation without database roundtrips.
  - Aligns with Supabase Auth user IDs (`auth.users.id`).

### 1.2 Timestamps: UTC `TIMESTAMPTZ` with Explicit Local Timezone
- **Decision:** All instant timestamps use `TIMESTAMPTZ NOT NULL DEFAULT NOW()`. For recurrence schedules, the user's local IANA timezone is stored as a separate `VARCHAR(100)` column (e.g. `'America/New_York'`).
- **Rationale:** Prevents daylight savings ambiguity while allowing deterministic UTC cron triggers.

### 1.3 Monetary Storage: Exact `NUMERIC` vs. Floating Point
- **Decision:**
  - Product prices: `NUMERIC(12, 4)`
  - Run usage & token costs: `NUMERIC(12, 6)`
  - Percentage deltas: `NUMERIC(8, 4)`
- **Rationale:** IEEE 754 binary floating-point types (`REAL`, `DOUBLE PRECISION`, or JS `number`) suffer from precision loss (e.g. `0.1 + 0.2 !== 0.3`). Exact fixed-point numeric storage is strictly required for financial evaluations (`DEC-008`, `UR-008`).

### 1.4 Structured Attributes: Relational Integrity vs. JSONB
- **Decision:**
  - Relational tables for core entities: tasks, runs, sources, candidates, evidence, schedules, change events, ledger.
  - `JSONB` reserved strictly for:
    - Dynamic specification maps (`candidate_results.specifications`).
    - Flexible constraint rule dictionaries (`research_tasks.constraints`).
    - Telemetry metrics and counters (`research_runs.stage_counters`).
- **Rationale:** Avoids entity-attribute-value (EAV) antipatterns for product specs while preserving indexing capability (`GIN` indexes on JSONB) and keeping relational foreign-key integrity where entities relate.

### 1.5 Provider Credential Vault: AES-256-GCM
- **Decision:** Store user-supplied AI/search provider API keys in an isolated vault table (`provider_vault_secrets`) containing `encrypted_blob BYTEA`, `initialization_vector BYTEA` (12 bytes), and `auth_tag BYTEA` (16 bytes).
- **Rationale:** Plaintext keys are never stored in metadata tables or logs (`SEC-001`, `SEC-002`, `VS-THR-001`). Keys are decrypted exclusively in server memory during outbound HTTP requests.

### 1.6 Data Minimization: 50KB Bounded Source Excerpts
- **Decision:** Database check constraint `chk_source_documents_excerpt_len`: `octet_length(extracted_text_excerpt) <= 51200`.
- **Rationale:** Raw full-page HTML (often megabytes) is discarded after processing; only normalized, bounded text snippets (< 50KB) are retained, preventing database bloat and memory exhaustion (`SEC-032`).

---

## 2. Open Decisions Deferred to Subsequent Steps

1. **ORM Tooling Selection (Step 22):** Prisma vs. Kysely vs. Typed SQL Migrations. Step 21 delivers the canonical SQL DDL; Step 22 implements the repository data-access layer.
2. **User Authentication Provider (Step 23):** Supabase Auth vs. NextAuth / custom session cookie provider (`OPEN-008`). Schema uses standard `user_id UUID` compatible with both.
3. **Data Retention & Auto-Archival Policy (Step 22):** Indefinite local retention vs. 30-day rolling purge for non-favorite runs (`OPEN-009`).
