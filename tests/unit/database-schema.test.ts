import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Database Schema DDL & Architecture Validation (Step 21)', () => {
  const schemaPath = path.resolve(process.cwd(), 'docs/database/schema.sql');
  const serverSchemaPath = path.resolve(process.cwd(), 'src/server/persistence/schema.sql');

  it('SCHEMA-TEST-001: Schema DDL files exist and are identical in docs/ and src/server/', () => {
    expect(fs.existsSync(schemaPath), 'docs/database/schema.sql must exist').toBe(true);
    expect(fs.existsSync(serverSchemaPath), 'src/server/persistence/schema.sql must exist').toBe(true);

    const docContent = fs.readFileSync(schemaPath, 'utf-8');
    const serverContent = fs.readFileSync(serverSchemaPath, 'utf-8');

    // Both files should be identical in substance
    expect(docContent.trim()).toBe(serverContent.trim());
  });

  it('SCHEMA-TEST-002: Defines all 11 required domain entities with CREATE TABLE statements', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    const expectedTables = [
      'research_tasks',
      'research_schedules',
      'research_runs',
      'source_documents',
      'candidate_results',
      'evidence_records',
      'candidate_evidence_links',
      'provider_configurations',
      'provider_vault_secrets',
      'change_events',
      'usage_ledger',
    ];

    for (const table of expectedTables) {
      const regex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i');
      expect(regex.test(ddl), `Table "${table}" must be defined in schema DDL`).toBe(true);
    }
  });

  it('SCHEMA-TEST-003: Enforces RFC 4122 UUIDv4 primary keys across all standalone tables', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    const standaloneTables = [
      'research_tasks',
      'research_schedules',
      'research_runs',
      'source_documents',
      'candidate_results',
      'evidence_records',
      'provider_configurations',
      'provider_vault_secrets',
      'change_events',
      'usage_ledger',
    ];

    for (const table of standaloneTables) {
      const regex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\([\\s\\S]*?id UUID PRIMARY KEY DEFAULT gen_random_uuid\\(\\)`, 'i');
      expect(regex.test(ddl), `Table "${table}" must have UUID primary key`).toBe(true);
    }

    // Junction table has composite primary key
    expect(ddl).toContain('PRIMARY KEY (candidate_id, evidence_id)');
  });

  it('SCHEMA-TEST-004: Enforces referential integrity and cascading deletes from parent to child records', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    // Task -> Runs cascade
    expect(ddl).toContain('REFERENCES research_tasks(id) ON DELETE CASCADE');

    // Run -> Sources, Candidates, Evidence cascade
    expect(ddl).toContain('REFERENCES research_runs(id) ON DELETE CASCADE');

    // Source -> Evidence cascade
    expect(ddl).toContain('REFERENCES source_documents(id) ON DELETE CASCADE');

    // Candidate Evidence Links cascade
    expect(ddl).toContain('REFERENCES candidate_results(id) ON DELETE CASCADE');
    expect(ddl).toContain('REFERENCES evidence_records(id) ON DELETE CASCADE');

    // Usage ledger uses ON DELETE SET NULL for audit preservation
    expect(ddl).toContain('REFERENCES research_tasks(id) ON DELETE SET NULL');
    expect(ddl).toContain('REFERENCES research_runs(id) ON DELETE SET NULL');
  });

  it('SCHEMA-TEST-005: Prohibits raw plaintext credentials in metadata and isolates encrypted vault', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    // provider_configurations must NOT contain raw api_key column
    expect(ddl).not.toMatch(/api_key\s+TEXT/i);
    expect(ddl).not.toMatch(/api_key\s+VARCHAR/i);
    expect(ddl).not.toMatch(/secret_key\s+TEXT/i);

    // provider_configurations has only non-secret metadata
    expect(ddl).toContain('has_credential BOOLEAN NOT NULL DEFAULT FALSE');
    expect(ddl).toContain('credential_preview VARCHAR(20) NULL');

    // provider_vault_secrets uses BYTEA fields for AES-256-GCM ciphertext, IV, and auth tag
    expect(ddl).toContain('encrypted_blob BYTEA NOT NULL');
    expect(ddl).toContain('initialization_vector BYTEA NOT NULL');
    expect(ddl).toContain('auth_tag BYTEA NOT NULL');

    // Checks 12-byte IV and 16-byte tag constraints
    expect(ddl).toContain('octet_length(initialization_vector) = 12');
    expect(ddl).toContain('octet_length(auth_tag) = 16');
  });

  it('SCHEMA-TEST-006: Uses exact NUMERIC types for monetary fields and avoids IEEE-754 floats', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    // candidate_results price
    expect(ddl).toContain('price_usd NUMERIC(12, 4) NULL');

    // usage_ledger estimated cost
    expect(ddl).toContain('estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0.000000');

    // change_events percentage delta
    expect(ddl).toContain('percentage_delta NUMERIC(8, 4) NULL');

    // Ensure float types are not used for monetary figures
    expect(ddl).not.toMatch(/price_usd\s+REAL/i);
    expect(ddl).not.toMatch(/price_usd\s+DOUBLE/i);
    expect(ddl).not.toMatch(/price_usd\s+FLOAT/i);
    expect(ddl).not.toMatch(/estimated_cost_usd\s+FLOAT/i);
  });

  it('SCHEMA-TEST-007: Enforces data minimization constraint on extracted text excerpts (50KB cap)', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    // SEC-032 50KB boundary check
    expect(ddl).toContain('octet_length(extracted_text_excerpt) <= 51200');
  });

  it('SCHEMA-TEST-008: Enables Row Level Security (RLS) across all 11 domain tables', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    const expectedTables = [
      'research_tasks',
      'research_schedules',
      'research_runs',
      'source_documents',
      'candidate_results',
      'evidence_records',
      'candidate_evidence_links',
      'provider_configurations',
      'provider_vault_secrets',
      'change_events',
      'usage_ledger',
    ];

    for (const table of expectedTables) {
      expect(ddl).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('SCHEMA-TEST-009: Enforces canonical enumerations via database CHECK constraints', () => {
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    // TaskType
    expect(ddl).toContain('PRODUCT_RESEARCH');
    expect(ddl).toContain('SPEC_VERIFICATION');

    // RunStatus
    expect(ddl).toContain('QUEUED');
    expect(ddl).toContain('CANCELLATION_REQUESTED');

    // VerificationState
    expect(ddl).toContain('SUPPORTED');
    expect(ddl).toContain('CONTRADICTED');
    expect(ddl).toContain('CONFLICTING');

    // MatchClassification
    expect(ddl).toContain('EXACT_MATCH');
    expect(ddl).toContain('NEAR_MATCH');
    expect(ddl).toContain('EXCLUDED');

    // ChangeType
    expect(ddl).toContain('PRICE_DROP');
    expect(ddl).toContain('STOCK_STATUS_CHANGE');
  });
});
