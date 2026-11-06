-- ==============================================================================
-- VerityScout AI — Migration 0006: Progress Tracking, Cancellation, Retries, and Recovery
-- ==============================================================================
-- Phase: 9 of 12 (Model Routing and Asynchronous Research)
-- Step: 44 of 60
-- Governed by: ADR-002, ADR-004, DATA_CONTRACTS.md
-- Purpose:
-- 1. Creates research_progress_events table for granular, sequential audit trail of run transitions.
-- 2. Extends research_runs table with progress_percent and execution_duration_ms columns.
-- 3. Extends research_job_queue table with lease_expires_at, scheduled_at, last_error, and failure_category.
-- 4. Updates dequeue index to respect scheduled_at for exponential backoff retries.
-- 5. Implements multi-tenant Row-Level Security on research_progress_events.
-- ==============================================================================

-- 1. Create research_progress_events table
CREATE TABLE IF NOT EXISTS research_progress_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    stage VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    sequence_number INT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_progress_stage CHECK (stage IN (
        'INITIATED',
        'PLANNING',
        'SEARCHING',
        'EXTRACTING',
        'VERIFYING',
        'SYNTHESIZING',
        'FINALIZING'
    )),
    CONSTRAINT chk_progress_event_type CHECK (event_type IN (
        'STAGE_STARTED',
        'PROGRESS_UPDATE',
        'STAGE_COMPLETED',
        'RETRY_SCHEDULED',
        'CANCELLATION_REQUESTED',
        'CANCELLED',
        'RECOVERED',
        'FAILED'
    )),
    CONSTRAINT uq_progress_run_seq UNIQUE (run_id, sequence_number)
);

-- Indexes for progress events retrieval
CREATE INDEX IF NOT EXISTS idx_research_progress_events_run_seq
ON research_progress_events(run_id, sequence_number ASC);

CREATE INDEX IF NOT EXISTS idx_research_progress_events_user_id
ON research_progress_events(user_id);

-- Enable Row-Level Security for research_progress_events
ALTER TABLE research_progress_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_research_progress_events_tenant ON research_progress_events;

CREATE POLICY rls_research_progress_events_tenant ON research_progress_events FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

-- 2. Extend research_runs table with progress percentage and execution duration
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS progress_percent INT NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS execution_duration_ms INT NULL;
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Extend research_job_queue table with lease heartbeat and retry scheduling columns
ALTER TABLE research_job_queue ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL;
ALTER TABLE research_job_queue ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE research_job_queue ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
ALTER TABLE research_job_queue ADD COLUMN IF NOT EXISTS failure_category VARCHAR(50) NULL;

-- 4. Update dequeue index to respect scheduled_at for delayed retries
DROP INDEX IF EXISTS idx_research_job_queue_dequeue;

CREATE INDEX IF NOT EXISTS idx_research_job_queue_dequeue
ON research_job_queue(priority DESC, scheduled_at ASC)
WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_research_job_queue_lease
ON research_job_queue(lease_expires_at)
WHERE status = 'PROCESSING';

