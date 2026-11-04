-- ==============================================================================
-- VerityScout AI — Migration 0005: Research Job Queue for Asynchronous Runs
-- ==============================================================================
-- Phase: 9 of 12 (Model Routing and Asynchronous Research)
-- Step: 43 of 60
-- Governed by: ADR-002, ADR-004, DATA_CONTRACTS.md
-- Purpose:
-- 1. Creates research_job_queue table to persist queued asynchronous research jobs.
-- 2. Enables high-concurrency atomic job claim via SELECT FOR UPDATE SKIP LOCKED.
-- 3. Implements Row-Level Security and foreign keys referencing research_runs and research_tasks.
-- 4. Extends research_runs table with synthesis JSONB storage for persisted report outputs.
-- ==============================================================================

-- 1. Create research_job_queue table
CREATE TABLE IF NOT EXISTS research_job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    claimed_by VARCHAR(128) NULL,
    claimed_at TIMESTAMPTZ NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Status constraints
    CONSTRAINT chk_research_job_queue_status CHECK (status IN (
        'QUEUED',
        'PROCESSING',
        'COMPLETED',
        'FAILED'
    )),
    CONSTRAINT uq_research_job_queue_run_id UNIQUE (run_id)
);

-- 2. Create high-efficiency dequeue index (skip locked priority queue)
CREATE INDEX IF NOT EXISTS idx_research_job_queue_dequeue
ON research_job_queue(priority DESC, created_at ASC)
WHERE status = 'QUEUED';

-- 3. Create relational and tenant indexes
CREATE INDEX IF NOT EXISTS idx_research_job_queue_user_id ON research_job_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_research_job_queue_task_id ON research_job_queue(task_id);
CREATE INDEX IF NOT EXISTS idx_research_job_queue_status ON research_job_queue(status);

-- 4. Enable Row-Level Security for multi-tenant isolation
ALTER TABLE research_job_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_research_job_queue_tenant ON research_job_queue;

CREATE POLICY rls_research_job_queue_tenant ON research_job_queue FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

-- 5. Extend research_runs table with synthesis JSONB storage
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS synthesis JSONB NULL;

