# VerityScout AI — Research History and Multi-Format Exports Architecture

**Document Identifier:** VS-ARCH-EXPORTS-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 10 (Step 49 of 60)  
**Author:** Senior Full-Stack Engineer, Senior Data Engineer, Senior Application Security Engineer  
**Traceability:** Mapped to [MVP_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/MVP_REQUIREMENTS.md) (UR-014, AC-014), [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md) (SEC-008, SEC-010, SEC-021, SEC-025), and [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md).

---

## 1. Executive Summary and Purpose

Step 49 implements a production-grade, reproducible research history exploration and multi-format export capability (`JSON`, `CSV`, `Markdown`) for VerityScout AI. It enables analysts, procurement teams, and developers to:
1. Search, filter, inspect, and paginate past research runs and their associated verification evidence across all task types, schedules, and statuses.
2. Export comprehensive, tamper-evident snapshots of individual research runs or aggregated history datasets.
3. Preserve strict epistemic honesty, provenance links, unit distinctions, and change records without synthesizing or hallucinating missing fields.
4. Enforce strict application security controls, notably OWASP ASVS CSV Formula Injection protection (`SEC-025`), secure filename sanitization preventing directory traversal or header manipulation, sensitive secret redaction, and tenant-scoped Row-Level Security (`RLS`).

---

## 2. Core Architecture and Module Organization

The export and history subsystems are organized under clean domain boundaries:

```
src/
├── app/
│   ├── api/research/
│   │   ├── history/
│   │   │   ├── route.ts                 # GET /api/research/history (List/Search)
│   │   │   └── export/
│   │   │       └── route.ts             # GET /api/research/history/export (Aggregated Export)
│   │   └── runs/[runId]/
│   │       └── export/
│   │           └── route.ts             # GET /api/research/runs/[runId]/export (Run Export)
│   ├── history/
│   │   └── page.tsx                     # Research History Exploration Shell
│   └── research/runs/[runId]/
│       └── page.tsx                     # Research Run Detail with Integrated ExportToolbar
├── features/
│   └── history/
│       ├── components/
│       │   ├── ResearchHistoryList.tsx   # Interactive History Explorer with Filter Bar & Cards
│       │   ├── ResearchHistoryList.module.css
│       │   ├── ExportToolbar.tsx        # Multi-Format Download Trigger Toolbar
│       │   └── ExportToolbar.module.css
│       ├── types.ts                     # UI-facing TypeScript Interfaces
│       └── index.ts                     # Barrel Module Export
└── server/
    ├── history/
    │   ├── history.types.ts             # Filter Options & Query Types
    │   └── history.service.ts           # ResearchHistoryService (Database Aggregation & Snapshots)
    └── export/
        ├── export.types.ts              # Canonical DTOs, Envelopes & Serialization Schemas
        ├── csv-serializer.ts            # RFC 4180 CSV Serializer + Formula Injection Sanitizer
        ├── json-serializer.ts           # Versioned Envelope Serializer with Secret Redaction
        ├── markdown-serializer.ts       # Evidence-Linked Markdown Report Generator
        ├── export.service.ts            # ExportService Orchestrator & Safe Filename Generator
        └── index.ts                     # Barrel Module Export
```

---

## 3. Serialization Formats and Dataset Semantics

### 3.1 JSON Format (`application/json; charset=utf-8`)
- **Schema Envelope Version:** `1.0.0`
- **Structure:**
  - `schema_version`: Semantic schema identifier.
  - `exported_at`: ISO 8601 UTC timestamp of export generation.
  - `system`: Product branding and origin disclaimer (`VerityScout AI`).
  - `data`: Complete domain object snapshot:
    - **Single Run:** Includes `run`, `task`, `schedule`, `candidates`, `evidence`, `sources`, `synthesis`, `comparison`, and `changes`.
    - **History:** Includes `runs` array and `totalCount`.
- **Security & Redaction:** Provider API keys, webhook secrets, encryption keys, password hashes, and session tokens are strictly excluded.

### 3.2 CSV Format (`text/csv; charset=utf-8`)
Implements RFC 4180 compliance with deterministic column headers:
- **`candidates` dataset:**
  - Headers: `Candidate ID`, `Run ID`, `Title`, `Product Identifier`, `Seller / Domain`, `Price`, `Currency`, `Availability`, `Condition`, `Classification`, `Canonical URL`, `Created At`.
- **`evidence` dataset:**
  - Headers: `Evidence ID`, `Run ID`, `Source Document ID`, `Attribute Key`, `Raw Value`, `Extracted Value`, `Confidence`, `Verification State`, `Verbatim Quote`, `Source URL`, `Created At`.
- **`changes` dataset:**
  - Headers: `Change ID`, `Comparison ID`, `Run ID`, `Baseline Run ID`, `Candidate Title`, `Attribute Key`, `Change Type`, `Change Status`, `Previous Value`, `Current Value`, `Unit`, `Observed At`.
- **`history` dataset:**
  - Headers: `Run ID`, `Task ID`, `Task Title`, `Original Query`, `Task Type`, `Status`, `Candidates Found`, `Queries Executed`, `Sources Discovered`, `Sources Extracted`, `Claims Verified`, `Provider`, `Model`, `Estimated Cost USD`, `Started At`, `Completed At`.

### 3.3 Markdown Format (`text/markdown; charset=utf-8`)
Generates standalone, human-readable verification reports containing:
- Executive summary with run status, stage counters, and LLM model execution metadata.
- Synthesis summary, findings, multi-source conflict preservation, and identified limitations.
- Verified Candidate Results table with prices, availability, and match classification.
- Full Evidence and Source Citation table mapping claim quotes to verified web source URLs.
- Change Detection delta log comparing results against prior baseline runs.

---

## 4. Security Controls and Mitigations

### 4.1 OWASP ASVS CSV Formula Injection Mitigation (`SEC-025`)
Spreadsheet applications (Microsoft Excel, LibreOffice Calc, Google Sheets) execute dynamic formulas if a cell starts with special command symbols (`=`, `+`, `-`, `@`, `\t`, `\r`). Attackers can leverage untrusted crawled product titles or extracted claims to execute arbitrary DDE commands or exfiltrate local data via hyperlink payloads.

**Mitigation Algorithm (`sanitizeCsvCell`):**
1. Null, undefined, or empty values are rendered as empty strings `""`.
2. Numbers are rendered directly without modification.
3. String values are checked against valid numeric representations (e.g., `-15.2`, `+42`, `-0.005`) using `/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/`. Valid numbers are rendered bare.
4. Any string beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` (or leading whitespace followed by these characters) is prepended with a single quote `'` to force spreadsheet engines to parse the cell as raw string text rather than an executable formula.
5. RFC 4180 escaping is applied: any cell containing quotes (`"`), commas (`,`), or newlines (`\n`, `\r`) is enclosed in double quotes with embedded quotes escaped as `""`.

### 4.2 Safe Filename Sanitization
Filenames generated in `Content-Disposition` headers are sanitized via `sanitizeFilename`:
- Directory traversal sequences (`../`, `..\`) and path separators are stripped.
- Control characters and reserved symbols (`< > : " / \ | ? * \0-\x1F`) are removed or replaced with safe underscores.
- Length is capped at 64 characters to prevent buffer issues in downstream clients.
- Content-Disposition header is properly set with `attachment; filename="<sanitized>"`.

### 4.3 Multi-Tenant Isolation and RLS Verification (`SEC-008`, `SEC-010`)
All export endpoints enforce strict authentication via `getSession()`. All queries execute within user-scoped filters (`WHERE user_id = $1`) and PostgreSQL Row-Level Security policies. Users cannot view, query, or export runs, tasks, candidates, or evidence belonging to any other user.

### 4.4 Markdown Injection and XSS Prevention (`SEC-021`)
- Table pipe characters (`|`) in Markdown data cells are escaped as `\|`.
- Line breaks in cells are replaced with spaces to avoid breaking table layout.
- URLs embedded into Markdown links (`[text](url)`) are validated against safe protocols (`http://` and `https://` only) to prevent `javascript:` or `data:` URI execution.

---

## 5. REST API Specifications

### 5.1 `GET /api/research/history`
- **Description:** Search, filter, and paginate past research runs.
- **Parameters:**
  - `page`: Page number (default: 1).
  - `limit`: Items per page (default: 20, max: 100).
  - `query`: Text search matching task title or query string.
  - `status`: Filter by `RunStatus` (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`).
  - `scheduleId`: Filter by associated recurring schedule UUID.
  - `taskType`: Filter by `TaskType`.
  - `fromDate` / `toDate`: ISO 8601 creation timestamp bounds.
- **Response:** JSON with `{ success: true, data: { runs, total, page, limit, totalPages } }`.

### 5.2 `GET /api/research/runs/[runId]/export`
- **Description:** Export complete artifact for a single research run.
- **Parameters:**
  - `format`: Export format (`json`, `csv`, `markdown`).
  - `dataset`: Required for CSV format (`candidates`, `evidence`, `changes`).
- **Response:** Binary download with appropriate `Content-Type`, `Content-Disposition`, and `Cache-Control: no-store`.

### 5.3 `GET /api/research/history/export`
- **Description:** Export filtered research run history.
- **Parameters:** Same filter parameters as history search, plus `format` (`json`, `csv`).
- **Response:** Binary download of aggregated history table or JSON collection.

---

## 6. Verification and Quality Assurance

Comprehensive unit and integration test suites cover all export and history modules:
1. `tests/unit/csv-serializer.test.ts`: Formula injection protection, valid signed number preservation, dataset serialization.
2. `tests/unit/json-serializer.test.ts`: Schema envelope, secret redaction, full run & history snapshots.
3. `tests/unit/markdown-serializer.test.ts`: Report generation, table pipe escaping, safe citation URL enforcement.
4. `tests/unit/export-service.test.ts`: ExportService formatting, MIME types, filename sanitization.
5. `tests/unit/history-service.test.ts`: List history filtering, pagination, snapshot retrieval.
6. `tests/unit/export-api.test.ts`: Authenticated route handling, query validation, Content-Disposition headers.
7. `tests/unit/history-ui.test.tsx`: History UI component rendering, filter interactions, export toolbars.

