-- ==============================================================================
-- VerityScout AI — Migration 0009: Idempotent Schedule Occurrences, Pause/Resume, Edit/Delete, and Recovery
-- ==============================================================================
-- Phase: 10 of 12 (Research Scheduling and Change Monitoring)
-- Step: 47 of 60
-- Governed by: ADR-002, ADR-004, ADR-010, DATA_CONTRACTS.md
-- Purpose:
-- 1. Adds revision integer tracking to research_schedules for optimistic concurrency and edit versioning.
-- 2. Creates schedule_occurrences ledger establishing stable, durable identities for each planned execution.
-- 3. Enforces uniqueness on (schedule_id, scheduled_at) and idempotency_key to prevent duplicate runs.
-- 4. Establishes state machine (PLANNED, DISPATCHING, DISPATCHED, RUNNING, COMPLETED, FAILED, CANCELLED, SKIPPED, RECONCILIATION_REQUIRED).
-- 5. Enables Row Level Security (RLS) on schedule_occurrences for tenant isolation.
-- ==============================================================================

-- 1. Add revision tracking to research_schedules
ALTER TABLE research_schedules
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

-- 2. Create schedule_occurrences table
CREATE TABLE IF NOT EXISTS schedule_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES research_schedules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    schedule_revision INTEGER NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED',
    queue_job_id UUID NULL REFERENCES research_jobs(id) ON DELETE SET NULL,
    research_run_id UUID NULL REFERENCES research_runs(id) ON DELETE SET NULL,
    dispatched_at TIMESTAMPTZ NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    error_message TEXT NULL,
    recovery_metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_schedule_occurrences_status CHECK (status IN (
        'PLANNED',
        'DISPATCHING',
        'DISPATCHED',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'SKIPPED',
        'RECONCILIATION_REQUIRED'
    )),
    CONSTRAINT uq_schedule_occurrences_schedule_scheduled_at UNIQUE (schedule_id, scheduled_at)
);

-- Indexes for occurrence query performance
CREATE INDEX IF NOT EXISTS idx_schedule_occurrences_schedule_id
    ON schedule_occurrences(schedule_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_occurrences_status
    ON schedule_occurrences(status, scheduled_at ASC);

CREATE INDEX IF NOT EXISTS idx_schedule_occurrences_run_id
    ON schedule_occurrences(research_run_id)
    WHERE research_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_occurrences_job_id
    ON schedule_occurrences(queue_job_id)
    WHERE queue_job_id IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE schedule_occurrences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'p_schedule_occurrences_user_isolation'
    ) THEN
        EXECUTE 'CREATE POLICY p_schedule_occurrences_user_isolation ON schedule_occurrences FOR ALL USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), ''''), user_id::text)::uuid)';
    END IF;
END $$;

