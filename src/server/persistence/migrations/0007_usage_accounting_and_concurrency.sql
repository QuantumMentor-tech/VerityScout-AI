-- ==============================================================================
-- VerityScout AI — Migration 0007: Usage Accounting, Cost Tracking, and Concurrency
-- ==============================================================================
-- Phase: 9 of 12 (Model Routing and Asynchronous Research)
-- Step: 45 of 60
-- Governed by: ADR-002, ADR-004, ADR-010, DATA_CONTRACTS.md
-- Purpose:
-- 1. Creates model_usage_events table for granular, idempotent AI usage and cost accounting.
-- 2. Distinguishes provider-reported usage, local estimates, and unknown states.
-- 3. Creates concurrency_slots table for distributed cross-worker concurrency limits.
-- 4. Establishes indexes and multi-tenant Row-Level Security isolation.
-- ==============================================================================

-- 1. Model Usage Events Table
CREATE TABLE IF NOT EXISTS model_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    run_id UUID NULL REFERENCES research_runs(id) ON DELETE SET NULL,
    task_id UUID NULL REFERENCES research_tasks(id) ON DELETE SET NULL,
    attempt INT NOT NULL DEFAULT 1,
    provider_id VARCHAR(50) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    request_id VARCHAR(128) NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    input_tokens INT NULL,
    output_tokens INT NULL,
    total_tokens INT NULL,
    cached_tokens INT NULL,
    reasoning_tokens INT NULL,
    usage_source VARCHAR(50) NOT NULL DEFAULT 'PROVIDER_REPORTED',
    estimated_cost_usd NUMERIC(12, 6) NULL,
    provider_cost_usd NUMERIC(12, 6) NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    cost_status VARCHAR(50) NOT NULL DEFAULT 'CALCULATED_ESTIMATE',
    pricing_version VARCHAR(100) NULL,
    cost_explanation TEXT NULL,
    latency_ms INT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_model_usage_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_model_usage_tokens CHECK (
        (input_tokens IS NULL OR input_tokens >= 0) AND
        (output_tokens IS NULL OR output_tokens >= 0) AND
        (total_tokens IS NULL OR total_tokens >= 0) AND
        (cached_tokens IS NULL OR cached_tokens >= 0) AND
        (reasoning_tokens IS NULL OR reasoning_tokens >= 0)
    ),
    CONSTRAINT chk_model_usage_source CHECK (usage_source IN (
        'PROVIDER_REPORTED',
        'LOCALLY_ESTIMATED',
        'PARTIAL',
        'UNKNOWN'
    )),
    CONSTRAINT chk_model_usage_cost_status CHECK (cost_status IN (
        'CALCULATED_ESTIMATE',
        'PROVIDER_REPORTED_COST',
        'UNKNOWN_COST'
    ))
);

-- Indexes for model_usage_events
CREATE INDEX IF NOT EXISTS idx_model_usage_user_id ON model_usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_run_id ON model_usage_events(run_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_task_id ON model_usage_events(task_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_recorded_at ON model_usage_events(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_usage_provider_model ON model_usage_events(provider_id, model_id);

-- Enable Row-Level Security for model_usage_events
ALTER TABLE model_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_model_usage_events_tenant ON model_usage_events;

CREATE POLICY rls_model_usage_events_tenant ON model_usage_events FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

-- 2. Distributed Concurrency Slots Table
CREATE TABLE IF NOT EXISTS concurrency_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_key VARCHAR(128) NOT NULL,
    holder_id VARCHAR(128) NOT NULL,
    slot_number INT NOT NULL,
    max_slots INT NOT NULL,
    lease_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_concurrency_slots UNIQUE (scope_key, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_concurrency_slots_lease
ON concurrency_slots(scope_key, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_concurrency_slots_holder
ON concurrency_slots(holder_id);

