-- ==============================================================================
-- VerityScout AI — Migration 0011: In-App Alerts and Research Notifications
-- ==============================================================================
-- Phase: 10 of 12 (Research Scheduling and Change Monitoring)
-- Step: 50 of 60
-- Governed by: ADR-002, ADR-004, ADR-007, ADR-010, DATA_CONTRACTS.md
-- Purpose:
-- 1. Creates in_app_notifications table to store persistent, evidence-grounded alerts
--    originating from eligible research comparisons and change events.
-- 2. Enforces event-level idempotency via unique idempotency_key constraint.
-- 3. Implements distinct read_at and dismissed_at timestamps for user interaction state.
-- 4. Creates optimized indexes for high-frequency unread count and user chronological queries.
-- 5. Enables Row Level Security (RLS) on in_app_notifications for strict tenant isolation.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    notification_type VARCHAR(64) NOT NULL,
    source_event_type VARCHAR(64) NOT NULL DEFAULT 'CHANGE_EVENT',
    source_event_id UUID NULL,
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    research_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    schedule_id UUID NULL REFERENCES research_schedules(id) ON DELETE SET NULL,
    comparison_id UUID NOT NULL REFERENCES research_comparisons(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(191) NOT NULL,
    read_at TIMESTAMPTZ NULL,
    dismissed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_in_app_notifications_idempotency UNIQUE (idempotency_key)
);

-- Fast lookup for unread notifications count and list
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread
    ON in_app_notifications(user_id, read_at)
    WHERE read_at IS NULL AND dismissed_at IS NULL;

-- Chronological user notification listing
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
    ON in_app_notifications(user_id, created_at DESC);

-- Association lookups
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_comparison
    ON in_app_notifications(comparison_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_run
    ON in_app_notifications(research_run_id);

-- Enable Row Level Security (RLS)
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'p_in_app_notifications_user_isolation'
    ) THEN
        EXECUTE 'CREATE POLICY p_in_app_notifications_user_isolation ON in_app_notifications FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
    END IF;
END $$;

