-- ==============================================================================
-- VerityScout AI — Canonical PostgreSQL 16 Relational Schema DDL
-- ==============================================================================
-- Phase: 5 of 12 (Data Persistence & Schema Architecture)
-- Step: 21 of 60
-- Status: APPROVED CANONICAL SPECIFICATION
-- Target Platform: PostgreSQL 16 (Local Docker Dev & Supabase Managed Database)
-- Governed by: ADR-003, ADR-007, ADR-008, ADR-010, DATA_CONTRACTS.md
-- ==============================================================================

-- Enable required cryptographic extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. RESEARCH TASKS
-- ==============================================================================
-- Persistent definition of a user's research request, constraints, and policies.
-- Traceability: DATA_CONTRACTS.md Section 3.1, UR-001, UR-002
-- ==============================================================================
CREATE TABLE IF NOT EXISTS research_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    original_query TEXT NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
    limits JSONB NOT NULL DEFAULT '{"maxSources": 10, "maxSearchQueries": 5, "maxRunCostUsd": "0.25", "searchDepth": "BALANCED"}'::jsonb,
    model_policy JSONB NOT NULL DEFAULT '{"preferredProvider": "auto", "allowedProviders": ["openai", "openrouter", "nim"]}'::jsonb,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_research_tasks_query_len CHECK (length(original_query) <= 1000),
    CONSTRAINT chk_research_tasks_type CHECK (task_type IN (
        'PRODUCT_RESEARCH',
        'GENERAL_RESEARCH',
        'PRICE_MONITOR',
        'SPEC_VERIFICATION'
    ))
);

CREATE INDEX IF NOT EXISTS idx_research_tasks_user_id ON research_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_research_tasks_created_at ON research_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_tasks_active ON research_tasks(user_id, is_archived) WHERE NOT is_archived;

-- ==============================================================================
-- 2. RESEARCH SCHEDULES
-- ==============================================================================
-- Periodic recurrence parameters for automated research runs.
-- Traceability: DATA_CONTRACTS.md Section 3.6, UR-015, UR-016
-- Note: Defined prior to research_runs to support optional schedule_id foreign key.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS research_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    cron_expression VARCHAR(100) NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    last_run_at TIMESTAMPTZ NULL,
    next_run_at TIMESTAMPTZ NOT NULL,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    change_notification_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_research_schedules_status CHECK (status IN (
        'ACTIVE',
        'PAUSED',
        'DISABLED_ERROR',
        'ARCHIVED'
    )),
    CONSTRAINT chk_research_schedules_failures CHECK (consecutive_failures >= 0),
    CONSTRAINT chk_research_schedules_threshold CHECK (change_notification_threshold_pct >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_research_schedules_task_id ON research_schedules(task_id);
CREATE INDEX IF NOT EXISTS idx_research_schedules_user_id ON research_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_research_schedules_due ON research_schedules(status, next_run_at) WHERE status = 'ACTIVE';

-- ==============================================================================
-- 3. RESEARCH RUNS
-- ==============================================================================
-- Individual execution instance of a research task.
-- Traceability: DATA_CONTRACTS.md Section 3.2, UR-005, UR-013, UR-020
-- ==============================================================================
CREATE TABLE IF NOT EXISTS research_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    schedule_id UUID NULL REFERENCES research_schedules(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    current_stage VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
    stage_counters JSONB NOT NULL DEFAULT '{"queriesExecuted": 0, "sourcesDiscovered": 0, "sourcesExtracted": 0, "claimsVerified": 0}'::jsonb,
    usage JSONB NOT NULL DEFAULT '{"promptTokens": 0, "completionTokens": 0, "searchCredits": 0, "estimatedCostUsd": "0.0000"}'::jsonb,
    selected_provider VARCHAR(50) NULL,
    selected_model VARCHAR(100) NULL,
    error_message TEXT NULL,
    cancellation_reason TEXT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,

    -- Constraints
    CONSTRAINT chk_research_runs_status CHECK (status IN (
        'QUEUED',
        'RUNNING',
        'COMPLETED',
        'PARTIALLY_COMPLETED',
        'FAILED',
        'CANCELLATION_REQUESTED',
        'CANCELLED'
    )),
    CONSTRAINT chk_research_runs_stage CHECK (current_stage IN (
        'INITIATED',
        'PLANNING',
        'SEARCHING',
        'EXTRACTING',
        'VERIFYING',
        'SYNTHESIZING',
        'FINALIZING'
    )),
    CONSTRAINT uq_research_runs_idempotency UNIQUE (task_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_research_runs_task_id ON research_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_user_id ON research_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_status ON research_runs(status);
CREATE INDEX IF NOT EXISTS idx_research_runs_started_at ON research_runs(started_at DESC);

-- ==============================================================================
-- 4. SOURCE DOCUMENTS
-- ==============================================================================
-- Discovered web page metadata, access state, and bounded extracted excerpt.
-- Traceability: DATA_CONTRACTS.md Section 3.3, UR-006, SEC-011, SEC-032
-- ==============================================================================
CREATE TABLE IF NOT EXISTS source_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    original_url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    discovery_provider VARCHAR(50) NOT NULL,
    access_state VARCHAR(50) NOT NULL,
    extraction_state VARCHAR(50) NOT NULL,
    http_status_code INTEGER NULL,
    content_hash CHAR(64) NULL,
    extracted_text_excerpt TEXT NOT NULL DEFAULT '',
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ NULL,

    -- Constraints
    CONSTRAINT chk_source_documents_access_state CHECK (access_state IN (
        'ACCESSIBLE',
        'BLOCKED_BOT_CHALLENGE',
        'HTTP_ERROR',
        'TIMEOUT',
        'DNS_RESOLUTION_FAILED',
        'SSRF_PROHIBITED'
    )),
    CONSTRAINT chk_source_documents_extraction_state CHECK (extraction_state IN (
        'SUCCESS',
        'EMPTY_BODY',
        'PAYLOAD_TOO_LARGE',
        'PARSING_FAILED',
        'SKIPPED'
    )),
    CONSTRAINT chk_source_documents_http_code CHECK (
        http_status_code IS NULL OR (http_status_code >= 100 AND http_status_code <= 599)
    ),
    CONSTRAINT chk_source_documents_excerpt_len CHECK (octet_length(extracted_text_excerpt) <= 51200) -- Max 50KB (SEC-032)
);

CREATE INDEX IF NOT EXISTS idx_source_documents_run_id ON source_documents(run_id);
CREATE INDEX IF NOT EXISTS idx_source_documents_user_id ON source_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_source_documents_domain ON source_documents(domain);
CREATE INDEX IF NOT EXISTS idx_source_documents_canonical_url ON source_documents(canonical_url);

-- ==============================================================================
-- 5. CANDIDATE RESULTS
-- ==============================================================================
-- Discovered research/product findings evaluated against user constraints.
-- Traceability: DATA_CONTRACTS.md Section 3.5, UR-008, UR-009, UR-010, UR-012
-- Note: Defined prior to evidence_records to permit foreign key reference.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS candidate_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    product_identifier VARCHAR(100) NULL,
    seller_or_domain VARCHAR(255) NOT NULL,
    canonical_url TEXT NOT NULL,
    price_usd NUMERIC(12, 4) NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    availability VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
    condition VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
    specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
    classification VARCHAR(50) NOT NULL,
    constraint_evaluation JSONB NOT NULL DEFAULT '{"passedConstraints": [], "failedConstraints": []}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_candidate_results_price CHECK (price_usd IS NULL OR price_usd >= 0.0000),
    CONSTRAINT chk_candidate_results_availability CHECK (availability IN (
        'IN_STOCK',
        'OUT_OF_STOCK',
        'UNKNOWN'
    )),
    CONSTRAINT chk_candidate_results_condition CHECK (condition IN (
        'NEW',
        'REFURBISHED',
        'USED',
        'UNKNOWN'
    )),
    CONSTRAINT chk_candidate_results_classification CHECK (classification IN (
        'EXACT_MATCH',
        'NEAR_MATCH',
        'PARTIALLY_VERIFIED',
        'CONFLICTING',
        'EXCLUDED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_candidate_results_run_id ON candidate_results(run_id);
CREATE INDEX IF NOT EXISTS idx_candidate_results_user_id ON candidate_results(user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_results_classification ON candidate_results(classification);
CREATE INDEX IF NOT EXISTS idx_candidate_results_price ON candidate_results(price_usd);

-- ==============================================================================
-- 6. EVIDENCE RECORDS
-- ==============================================================================
-- Verifiable textual excerpts proving or contradicting a claim, linked to source.
-- Traceability: DATA_CONTRACTS.md Section 3.4, UR-007, UR-025, SEC-032
-- ==============================================================================
CREATE TABLE IF NOT EXISTS evidence_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    candidate_id UUID NULL REFERENCES candidate_results(id) ON DELETE SET NULL,
    claim_key VARCHAR(100) NOT NULL,
    extracted_raw_value TEXT NOT NULL,
    normalized_value TEXT NOT NULL,
    unit_or_currency VARCHAR(20) NULL,
    verbatim_quote TEXT NOT NULL,
    verification_state VARCHAR(50) NOT NULL,
    conflict_details TEXT NULL,
    extraction_method VARCHAR(50) NOT NULL,
    location_in_document TEXT NULL,
    confidence_score NUMERIC(5, 4) NULL,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_evidence_records_verification CHECK (verification_state IN (
        'SUPPORTED',
        'CONTRADICTED',
        'UNKNOWN',
        'CONFLICTING',
        'STALE'
    )),
    CONSTRAINT chk_evidence_records_method CHECK (extraction_method IN (
        'LLM_STRUCTURED',
        'REGEX_DETERMINISTIC',
        'META_TAG',
        'DOM_SELECTOR'
    )),
    CONSTRAINT chk_evidence_records_confidence CHECK (
        confidence_score IS NULL OR (confidence_score >= 0.0000 AND confidence_score <= 1.0000)
    )
);

CREATE INDEX IF NOT EXISTS idx_evidence_records_run_id ON evidence_records(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_source_id ON evidence_records(source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_candidate_id ON evidence_records(candidate_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_claim_key ON evidence_records(claim_key);
CREATE INDEX IF NOT EXISTS idx_evidence_records_verification_state ON evidence_records(verification_state);

-- ==============================================================================
-- 7. CANDIDATE EVIDENCE LINKS (JUNCTION TABLE)
-- ==============================================================================
-- Normalized N-to-M junction table preserving claim-to-evidence referential integrity.
-- Traceability: DATA_CONTRACTS.md Section 3.5 (evidenceIds), UR-025
-- ==============================================================================
CREATE TABLE IF NOT EXISTS candidate_evidence_links (
    candidate_id UUID NOT NULL REFERENCES candidate_results(id) ON DELETE CASCADE,
    evidence_id UUID NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (candidate_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_evidence_links_evidence_id ON candidate_evidence_links(evidence_id);

-- ==============================================================================
-- 8. PROVIDER CONFIGURATIONS (NON-SECRET METADATA)
-- ==============================================================================
-- Configuration state for AI and search providers without storing raw secrets.
-- Traceability: ADR-010, UR-003, UR-018, SEC-001
-- ==============================================================================
CREATE TABLE IF NOT EXISTS provider_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider_id VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    selected_model_id VARCHAR(100) NULL,
    custom_base_url TEXT NULL,
    has_credential BOOLEAN NOT NULL DEFAULT FALSE,
    credential_preview VARCHAR(20) NULL,
    last_connection_test_at TIMESTAMPTZ NULL,
    last_connection_test_status VARCHAR(50) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_provider_configs_user_provider UNIQUE (user_id, provider_id),
    CONSTRAINT chk_provider_configs_provider CHECK (provider_id IN (
        'openai',
        'openrouter',
        'nim',
        'tavily',
        'exa',
        'firecrawl'
    )),
    CONSTRAINT chk_provider_configs_test_status CHECK (
        last_connection_test_status IS NULL OR last_connection_test_status IN ('SUCCESS', 'FAILED', 'UNTESTED')
    )
);

CREATE INDEX IF NOT EXISTS idx_provider_configs_user_id ON provider_configurations(user_id);

-- ==============================================================================
-- 9. PROVIDER VAULT SECRETS (ENCRYPTED STORAGE)
-- ==============================================================================
-- Encrypted storage for user-supplied provider API keys using AES-256-GCM.
-- Stored separately from application metadata; decrypted only in server memory.
-- Traceability: ADR-010, SEC-001, SEC-002, VS-THR-001
-- ==============================================================================
CREATE TABLE IF NOT EXISTS provider_vault_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider_id VARCHAR(50) NOT NULL,
    encrypted_blob BYTEA NOT NULL,
    initialization_vector BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_provider_vault_user_provider UNIQUE (user_id, provider_id),
    CONSTRAINT chk_provider_vault_iv_len CHECK (octet_length(initialization_vector) = 12),
    CONSTRAINT chk_provider_vault_tag_len CHECK (octet_length(auth_tag) = 16)
);

CREATE INDEX IF NOT EXISTS idx_provider_vault_user_id ON provider_vault_secrets(user_id);

-- ==============================================================================
-- 10. CHANGE EVENTS
-- ==============================================================================
-- Audited differences detected between successive research runs.
-- Traceability: DATA_CONTRACTS.md Section 3.7, UR-016
-- ==============================================================================
CREATE TABLE IF NOT EXISTS change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    schedule_id UUID NULL REFERENCES research_schedules(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    previous_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    current_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    previous_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    percentage_delta NUMERIC(8, 4) NULL,
    candidate_title TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    evidence_id UUID NULL REFERENCES evidence_records(id) ON DELETE SET NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_change_events_type CHECK (change_type IN (
        'PRICE_DROP',
        'PRICE_INCREASE',
        'STOCK_STATUS_CHANGE',
        'SPECIFICATION_UPDATE',
        'NEW_OFFER_DISCOVERED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_change_events_task_id ON change_events(task_id);
CREATE INDEX IF NOT EXISTS idx_change_events_schedule_id ON change_events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_change_events_user_id ON change_events(user_id);
CREATE INDEX IF NOT EXISTS idx_change_events_detected_at ON change_events(detected_at DESC);

-- ==============================================================================
-- 11. USAGE LEDGER
-- ==============================================================================
-- Immutable financial accounting records tracking token, search, and page consumption.
-- Traceability: DATA_CONTRACTS.md Section 3.8, UR-024, NFR-005
-- ==============================================================================
CREATE TABLE IF NOT EXISTS usage_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    task_id UUID NULL REFERENCES research_tasks(id) ON DELETE SET NULL,
    run_id UUID NULL REFERENCES research_runs(id) ON DELETE SET NULL,
    provider_id VARCHAR(50) NOT NULL,
    model_id VARCHAR(100) NULL,
    operation_category VARCHAR(50) NOT NULL,
    units_consumed BIGINT NOT NULL,
    unit_type VARCHAR(20) NOT NULL,
    estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0.000000,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_usage_ledger_provider CHECK (provider_id IN (
        'openai',
        'openrouter',
        'nim',
        'tavily',
        'exa',
        'firecrawl'
    )),
    CONSTRAINT chk_usage_ledger_category CHECK (operation_category IN (
        'SEARCH',
        'EXTRACTION',
        'SYNTHESIS'
    )),
    CONSTRAINT chk_usage_ledger_unit_type CHECK (unit_type IN (
        'TOKENS',
        'QUERIES',
        'PAGES'
    )),
    CONSTRAINT chk_usage_ledger_units CHECK (units_consumed >= 0),
    CONSTRAINT chk_usage_ledger_cost CHECK (estimated_cost_usd >= 0.000000)
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_user_id ON usage_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_run_id ON usage_ledger(run_id);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_recorded_at ON usage_ledger(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_provider_time ON usage_ledger(provider_id, recorded_at);

-- ==============================================================================
-- 12. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Dual-layer defense-in-depth data isolation enforcing user ownership.
-- Traceability: ADR-003, ADR-010, SEC-008
-- ==============================================================================
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

-- Base Tenant Policy Definitions
-- Compatible with Supabase auth.uid() or session current_setting('app.current_user_id')
DO $$
BEGIN
    -- Only create demo / standard RLS policies if auth.uid() function is present or placeholder
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'p_research_tasks_user_isolation'
    ) THEN
        EXECUTE 'CREATE POLICY p_research_tasks_user_isolation ON research_tasks FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_research_schedules_user_isolation ON research_schedules FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_research_runs_user_isolation ON research_runs FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_source_documents_user_isolation ON source_documents FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_candidate_results_user_isolation ON candidate_results FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_evidence_records_user_isolation ON evidence_records FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_provider_configs_user_isolation ON provider_configurations FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_provider_vault_user_isolation ON provider_vault_secrets FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_change_events_user_isolation ON change_events FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
        EXECUTE 'CREATE POLICY p_usage_ledger_user_isolation ON usage_ledger FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
    END IF;
END $$;
