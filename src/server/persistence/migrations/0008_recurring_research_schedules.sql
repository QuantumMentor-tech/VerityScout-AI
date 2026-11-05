-- ==============================================================================
-- VerityScout AI — Migration 0008: Recurring Research Schedules and Timezone-Aware Scheduling
-- ==============================================================================
-- Phase: 10 of 12 (Research Scheduling and Change Monitoring)
-- Step: 46 of 60
-- Governed by: ADR-002, ADR-004, ADR-010, DATA_CONTRACTS.md
-- Purpose:
-- 1. Enhances research_schedules with structured recurrence_rule, request_snapshot,
--    name, scheduled_time, and last_dispatched_at.
-- 2. Preserves query and constraint definitions for persistent server-side execution.
-- 3. Enables atomic due-schedule evaluation and safe dispatch to persistent research queue.
-- ==============================================================================

ALTER TABLE research_schedules
    ADD COLUMN IF NOT EXISTS name VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS recurrence_rule JSONB NULL,
    ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(10) NULL,
    ADD COLUMN IF NOT EXISTS request_snapshot JSONB NULL,
    ADD COLUMN IF NOT EXISTS last_dispatched_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS last_run_id UUID NULL REFERENCES research_runs(id) ON DELETE SET NULL;

-- Optimize index for due-schedule queries
CREATE INDEX IF NOT EXISTS idx_research_schedules_next_run_active
    ON research_schedules(status, next_run_at ASC)
    WHERE status = 'ACTIVE';

