-- ==============================================================================
-- VerityScout AI — Migration 0003: Strict Row-Level Security & Tenant Isolation
-- ==============================================================================
-- Phase: 5 of 12 (Database, Authentication, and Persistence)
-- Step: 24 of 60
-- Governed by: ADR-003, ADR-010, SEC-008, SEC-010
-- Purpose: Hardens Row-Level Security (RLS) policies on all domain tables to
--          strictly fail-closed when app.current_user_id is missing or unset.
-- ==============================================================================

-- 1. Ensure RLS is active on all domain tables
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

-- 2. Drop prior fallback / demo policies if present
DROP POLICY IF EXISTS p_research_tasks_user_isolation ON research_tasks;
DROP POLICY IF EXISTS p_research_schedules_user_isolation ON research_schedules;
DROP POLICY IF EXISTS p_research_runs_user_isolation ON research_runs;
DROP POLICY IF EXISTS p_source_documents_user_isolation ON source_documents;
DROP POLICY IF EXISTS p_candidate_results_user_isolation ON candidate_results;
DROP POLICY IF EXISTS p_evidence_records_user_isolation ON evidence_records;
DROP POLICY IF EXISTS p_candidate_evidence_links_user_isolation ON candidate_evidence_links;
DROP POLICY IF EXISTS p_provider_configs_user_isolation ON provider_configurations;
DROP POLICY IF EXISTS p_provider_vault_user_isolation ON provider_vault_secrets;
DROP POLICY IF EXISTS p_change_events_user_isolation ON change_events;
DROP POLICY IF EXISTS p_usage_ledger_user_isolation ON usage_ledger;

-- 3. Install strict fail-closed policies
-- Any access where current_setting('app.current_user_id', true) is unset/empty evaluates
-- NULLIF(..., '') to NULL. In SQL, (user_id = NULL) evaluates to FALSE/UNKNOWN, safely
-- preventing data leaks across tenant boundaries.

CREATE POLICY rls_research_tasks_tenant ON research_tasks FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_research_schedules_tenant ON research_schedules FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_research_runs_tenant ON research_runs FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_source_documents_tenant ON source_documents FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_candidate_results_tenant ON candidate_results FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_evidence_records_tenant ON evidence_records FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_candidate_evidence_links_tenant ON candidate_evidence_links FOR ALL
    USING (EXISTS (
        SELECT 1 FROM candidate_results c
        WHERE c.id = candidate_evidence_links.candidate_id
          AND c.user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM candidate_results c
        WHERE c.id = candidate_evidence_links.candidate_id
          AND c.user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    ));

CREATE POLICY rls_provider_configs_tenant ON provider_configurations FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_provider_vault_tenant ON provider_vault_secrets FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_change_events_tenant ON change_events FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

CREATE POLICY rls_usage_ledger_tenant ON usage_ledger FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);
