# Database Migrations and Schema Evolution Guide

**Document Identifier:** VS-DOC-MIGRATIONS-v1.0  
**Phase:** Phase 5 of 12 (Database, Authentication, and Persistence)  
**Step:** 22 of 60  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Governing ADRs:** `ADR-003` (Persistence & Relational Database), `ADR-010` (Auth, Secrets & Isolation), `DATA_CONTRACTS.md`

---

## 1. Schema Source of Truth

VerityScout AI follows an **SQL-first migration architecture**:

1. **Authoritative Schema Definition:** The canonical database schema is specified in sequential SQL migration files under [`src/server/persistence/migrations/`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/persistence/migrations).
2. **Initial Baseline:** [`0001_initial_schema.sql`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/persistence/migrations/0001_initial_schema.sql) declares all 11 domain tables, RFC 4122 UUIDv4 primary keys, foreign key cascade constraints, check constraints, indexes, and Row-Level Security policies established in Step 21.
3. **Server-Side TypeScript Types:** Strongly-typed TypeScript interfaces and enums reflecting database rows are maintained in [`src/server/persistence/types.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/persistence/types.ts).

There are no conflicting ORM schemas or DSL files. The SQL migration history is the single source of truth.

---

## 2. Migration Directory & Naming Conventions

Migration files must be placed in `src/server/persistence/migrations/` and adhere to an ordered 4-digit prefix naming convention:

```text
src/server/persistence/migrations/
├── 0001_initial_schema.sql              # Initial baseline: 11 domain tables, constraints, indexes
├── 0002_<concise_description>.sql       # Future sequential schema enhancements
└── ...
```

### Invariant Rules:
1. **Alphanumeric Ordering:** Migrations are discovered and executed in strict lexicographical order (`0001`, `0002`, etc.).
2. **Single Transaction Boundary:** Each migration script is executed inside a dedicated PostgreSQL transaction (`BEGIN ... COMMIT`). If any statement fails, the entire migration rolls back immediately (`ROLLBACK`).
3. **Immutability Once Applied:** Applied migrations must **never** be edited or reordered. Any subsequent schema alteration or index adjustment must be introduced as a new migration file.

---

## 3. Migration Tracking & Drift Detection

Migration history is tracked in the database using the internal `_migrations` table:

```sql
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64) NOT NULL
);
```

### Checksum Verification & Tamper Protection
- Before applying any pending migration, the migration engine calculates the SHA-256 hash of each migration file on disk.
- It compares the disk hash against the recorded `checksum` in `_migrations`.
- If an applied migration has been altered on disk, the engine aborts execution and raises a `MigrationDriftError`. This prevents silent schema divergence between environments.

---

## 4. Migration Execution Commands

The following npm scripts govern database migration and status checking:

```bash
# Check migration status, applied migrations, pending count, and drift status
npm run db:status

# Apply all pending migrations sequentially to the configured database
npm run db:migrate
```

### Local Development Workflow:
1. Start local development services: `npm run services:up` (launches PostgreSQL 16 Alpine in Docker).
2. Apply pending migrations: `npm run db:migrate`.
3. Check status: `npm run db:status`.

---

## 5. Production Execution Policy

1. **Zero Automatic CI Execution:** Production migrations must **never** run automatically during build or continuous integration pipelines.
2. **Pre-Deployment Review:** Every migration file must be code-reviewed for backward compatibility, locking overhead, and index impact before promotion.
3. **Controlled Maintenance Window:** Production schema migrations must be applied manually or via dedicated CD pipeline jobs with administrative review.
4. **Destructive Operations Prohibited:** No migration may issue `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE` against production without explicit architectural approval and data-migration scripts.

---

## 6. Safe Recovery and Limitations

- PostgreSQL supports transactional DDL for most schema changes (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `CREATE INDEX`).
- Certain operations (such as `CREATE INDEX CONCURRENTLY`) cannot run inside a multi-statement transaction in PostgreSQL; if concurrent indexing is required in high-traffic production environments, it must be run outside standard transaction wrappers.
- Reverting code does not automatically roll back database schema. In the event of a deployment rollback, compensating migrations must be authored and verified.
