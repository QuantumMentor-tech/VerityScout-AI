-- ==============================================================================
-- VerityScout AI — Migration 0004: Source Deduplication & Discovery Provenance
-- ==============================================================================
-- Phase: 7 of 12 (Search and Extraction)
-- Step: 35 of 60
-- Governed by: ADR-005, DEC-006, SEC-008, UR-006, AC-006
-- Purpose:
-- 1. Enforces uniqueness of canonical source documents within a research run
--    to prevent duplicate persistent source records.
-- 2. Creates the source_discoveries table to preserve distinct query, provider,
--    ranking, snippet, and timestamp provenance for all discovery events.
-- 3. Implements strict Row-Level Security on source_discoveries.
-- ==============================================================================

-- 1. Enforce unique canonical URL identity per research run
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_documents_run_canonical
ON source_documents(run_id, canonical_url);

-- 2. Create source_discoveries table for multi-query provenance audit
CREATE TABLE IF NOT EXISTS source_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    query_variant_id VARCHAR(100) NULL,
    query_text TEXT NOT NULL,
    discovery_provider VARCHAR(50) NOT NULL,
    provider_result_id VARCHAR(255) NULL,
    original_url TEXT NOT NULL,
    title TEXT NOT NULL,
    snippet TEXT NULL,
    relevance_score NUMERIC(5, 4) NULL,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create performance indexes for relational lookups
CREATE INDEX IF NOT EXISTS idx_source_discoveries_source_id ON source_discoveries(source_document_id);
CREATE INDEX IF NOT EXISTS idx_source_discoveries_run_id ON source_discoveries(run_id);
CREATE INDEX IF NOT EXISTS idx_source_discoveries_user_id ON source_discoveries(user_id);
CREATE INDEX IF NOT EXISTS idx_source_discoveries_query_variant ON source_discoveries(query_variant_id);

-- 4. Enable Row-Level Security for multi-tenant isolation
ALTER TABLE source_discoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_source_discoveries_tenant ON source_discoveries;

CREATE POLICY rls_source_discoveries_tenant ON source_discoveries FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID);

