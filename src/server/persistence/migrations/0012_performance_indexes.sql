-- Migration: 0012_performance_indexes.sql
-- Step 57: Performance Optimization and Validation
-- Purpose: Add targeted composite indexes to optimize high-frequency research history queries,
-- candidate evaluation, evidence traversal, and schedule execution.

-- 1. Ensure created_at exists on research_runs for deterministic temporal ordering
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Research Runs: Composite index for tenant history listings sorted by created_at DESC with tie-breaker
CREATE INDEX IF NOT EXISTS idx_research_runs_user_created ON research_runs(user_id, created_at DESC, id ASC);

-- 3. Research Runs: Composite index for status-filtered history queries
CREATE INDEX IF NOT EXISTS idx_research_runs_user_status_created ON research_runs(user_id, status, created_at DESC);

-- 4. Candidate Results: Composite index for run candidate listings ordered by creation sequence
CREATE INDEX IF NOT EXISTS idx_candidate_results_run_created ON candidate_results(run_id, created_at ASC);

-- 5. Evidence Records: Composite index for run evidence listings ordered by extraction time
CREATE INDEX IF NOT EXISTS idx_evidence_records_run_extracted ON evidence_records(run_id, extracted_at ASC);

-- 6. Schedule Occurrences: Composite index for schedule occurrence history ordered by scheduled time
CREATE INDEX IF NOT EXISTS idx_schedule_occurrences_sched_time ON schedule_occurrences(schedule_id, scheduled_at DESC);

-- 7. Change Events: Composite index for run change detection history ordered by detection time
CREATE INDEX IF NOT EXISTS idx_change_events_run_detected ON change_events(current_run_id, detected_at DESC);
