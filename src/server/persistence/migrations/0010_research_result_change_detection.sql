-- ==============================================================================
-- VerityScout AI — Migration 0010: Research Result Change Detection
-- ==============================================================================
-- Phase: 10 of 12 (Research Scheduling and Change Monitoring)
-- Step: 48 of 60
-- Governed by: ADR-002, ADR-004, ADR-010, DATA_CONTRACTS.md
-- Purpose:
-- 1. Creates research_comparisons table to store parent comparison sessions between
--    eligible baseline and subsequent completed research runs.
-- 2. Enhances change_events with comparison reference, candidate link, baseline evidence link,
--    reason code, change status, explanation, and idempotency key.
-- 3. Expands change_type constraints to support general research and product change taxonomies.
-- 4. Enables Row Level Security (RLS) on research_comparisons for tenant isolation.
-- ==============================================================================

-- 1. Create research_comparisons table
CREATE TABLE IF NOT EXISTS research_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    schedule_id UUID NULL REFERENCES research_schedules(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    baseline_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    current_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    comparison_policy_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    reason_code VARCHAR(100) NULL,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_research_comparisons_runs UNIQUE (baseline_run_id, current_run_id)
);

CREATE INDEX IF NOT EXISTS idx_research_comparisons_task_id
    ON research_comparisons(task_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_comparisons_schedule_id
    ON research_comparisons(schedule_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_comparisons_user_id
    ON research_comparisons(user_id);

ALTER TABLE research_comparisons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'p_research_comparisons_user_isolation'
    ) THEN
        EXECUTE 'CREATE POLICY p_research_comparisons_user_isolation ON research_comparisons FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
    END IF;
END $$;

-- 2. Enhance change_events table
ALTER TABLE change_events
    ADD COLUMN IF NOT EXISTS comparison_id UUID NULL REFERENCES research_comparisons(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS candidate_id UUID NULL REFERENCES candidate_results(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS baseline_evidence_id UUID NULL REFERENCES evidence_records(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reason_code VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS change_status VARCHAR(50) NOT NULL DEFAULT 'SUPPORTED',
    ADD COLUMN IF NOT EXISTS explanation TEXT NULL,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128) NULL;

-- 3. Expand change_type constraint
ALTER TABLE change_events DROP CONSTRAINT IF EXISTS chk_change_events_type;

ALTER TABLE change_events ADD CONSTRAINT chk_change_events_type CHECK (change_type IN (
    'PRICE_DROP',
    'PRICE_INCREASE',
    'STOCK_STATUS_CHANGE',
    'SPECIFICATION_UPDATE',
    'NEW_OFFER_DISCOVERED',
    'ADDED',
    'REMOVED',
    'CHANGED',
    'UNCHANGED',
    'NEWLY_OBSERVED',
    'NO_LONGER_OBSERVED',
    'CONFLICTING',
    'UNKNOWN',
    'NOT_COMPARABLE'
));

CREATE INDEX IF NOT EXISTS idx_change_events_comparison_id
    ON change_events(comparison_id)
    WHERE comparison_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_change_events_candidate_id
    ON change_events(candidate_id)
    WHERE candidate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_change_events_idempotency_key
    ON change_events(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

