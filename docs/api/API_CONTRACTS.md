# VerityScout AI — RESTful API Specification (v1)

**Document Identifier:** VS-API-SPEC-v1.0  
**Base Path:** `/api/v1`  
**Protocol:** HTTPS / TLS 1.3  
**Status:** APPROVED ARCHITECTURAL CONTRACT  
**Phase:** Phase 1 (Step 5 of 60)  
**Author:** Principal Software Architect, API Architect  
**Traceability:** Mapped to [DATA_CONTRACTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/DATA_CONTRACTS.md), [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md), and [ADR-008](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-008-api-design-and-contract-versioning.md).

---

## 1. Global Ingress Conventions & Error Handling

### 1.1 Headers & Content Negotiation
- **`Content-Type: application/json`** required on all `POST`, `PUT`, and `PATCH` requests.
- **`Idempotency-Key: <UUIDv4>`** optional on `POST /api/v1/research-runs` to prevent duplicate submissions on client retry (`SEC-027`).
- **Authentication:** Cookie-based session (`Cookie: vs_session=...`) verified by middleware (`SEC-006`).

### 1.2 Standard Error Response Schema
All error responses (HTTP 4xx and 5xx) strictly follow this standard envelope:
```json
{
  "error": {
    "code": "STRING_ENUM",
    "message": "Human-readable diagnostic message (sanitized, zero secrets)",
    "details": [
      {
        "field": "query",
        "issue": "Query must not exceed 500 characters"
      }
    ],
    "requestId": "req_01h8abc123",
    "retryable": false
  }
}
```

#### Standard Error Codes:
- `UNAUTHENTICATED` (401): Missing or expired session cookie.
- `FORBIDDEN` (403): User lacks permission to access resource.
- `NOT_FOUND` (404): Resource does not exist or belongs to another tenant (`SEC-007`).
- `VALIDATION_ERROR` (400): Zod schema violation or unrecognized fields.
- `RATE_LIMIT_EXCEEDED` (429): Ingress or authentication throttling tripped (`SEC-009`).
- `BUDGET_CAP_EXCEEDED` (400): Requested operation violates spending limits (`SEC-035`).
- `INVALID_SCHEDULE_INTERVAL` (400): Scheduled frequency is below 6-hour minimum (`SEC-036`).
- `PROVIDER_CIRCUIT_OPEN` (503): External provider circuit breaker is currently tripped (`SEC-038`).
- `INTERNAL_ERROR` (500): Unexpected failure; trace logged with secrets redacted.

---

## 2. API Endpoint Catalog

### 2.1 Health & Operational Status

#### `GET /api/v1/health`
- **Purpose:** Public liveness and dependency readiness probe.
- **Auth:** None (Public).
- **Response 200 OK:**
  ```json
  {
    "status": "HEALTHY",
    "version": "1.0.0",
    "timestamp": "2026-10-30T12:00:00.000Z",
    "services": {
      "database": "CONNECTED",
      "redis": "CONNECTED"
    }
  }
  ```

#### `GET /api/v1/capabilities`
- **Purpose:** Exposes active system boundaries, supported providers, and feature flags.
- **Auth:** Authenticated user session.
- **Response 200 OK:**
  ```json
  {
    "supportedProviders": ["openai", "openrouter", "nim", "tavily"],
    "limits": {
      "maxSourcesPerRun": 20,
      "maxSearchQueriesPerRun": 5,
      "maxRunCostUsd": "0.25",
      "minScheduleIntervalHours": 6
    }
  }
  ```

---

### 2.2 Research Tasks (`/api/v1/research-tasks`)

#### `GET /api/v1/research-tasks`
- **Purpose:** List saved research tasks owned by authenticated user.
- **Query Parameters:** `page` (int, default: 1), `limit` (int, default: 20, max: 50), `archived` (boolean, default: false).
- **Response 200 OK:** Paginated list of `ResearchTask` objects.

#### `POST /api/v1/research-tasks`
- **Purpose:** Create and normalize a new research task.
- **Request Body:**
  ```json
  {
    "title": "RTX 4070 GPU under $550",
    "originalQuery": "Find new RTX 4070 GPUs under $550 with length <= 320mm",
    "taskType": "PRODUCT_RESEARCH",
    "constraints": {
      "maxPrice": "550.00",
      "currency": "USD",
      "requiredCondition": "NEW",
      "requiredBrand": "NVIDIA",
      "excludedKeywords": ["mining", "broken"],
      "requiredSpecs": { "maxGpuLengthMm": 320 }
    },
    "limits": {
      "maxSources": 10,
      "searchDepth": "BALANCED"
    },
    "modelPolicy": {
      "preferredProvider": "auto",
      "allowedProviders": ["openai", "openrouter"]
    }
  }
  ```
- **Response 201 Created:** Complete `ResearchTask` record with generated `id`.

#### `GET /api/v1/research-tasks/{taskId}`
- **Purpose:** Retrieve task details.
- **Ownership Check:** Returns HTTP 404 if `task.userId != auth.userId` (`SEC-007`).
- **Response 200 OK:** `ResearchTask` record.

#### `PATCH /api/v1/research-tasks/{taskId}`
- **Purpose:** Update task constraints, limits, or archive status.
- **Response 200 OK:** Updated `ResearchTask` record.

#### `DELETE /api/v1/research-tasks/{taskId}`
- **Purpose:** Permanently delete task and cascade-purge all runs, evidence, and BullMQ jobs (`SEC-033`).
- **Response 204 No Content.**

---

### 2.3 Research Runs (`/api/v1/research-runs`)

#### `POST /api/v1/research-runs`
- **Purpose:** Trigger a new research execution (ad-hoc or bound to a saved task).
- **Execution Pattern:** Asynchronous background dispatch via BullMQ.
- **Request Headers:** Optional `Idempotency-Key: <UUIDv4>`.
- **Request Body:**
  ```json
  {
    "taskId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Response 202 Accepted:**
  - **Headers:** `Location: /api/v1/research-runs/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d`
  - **Body:**
    ```json
    {
      "runId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "taskId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "QUEUED",
      "currentStage": "INITIATED",
      "eventsUrl": "/api/v1/research-runs/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/events"
    }
    ```

#### `GET /api/v1/research-runs/{runId}`
- **Purpose:** Poll run status and high-level progress telemetry.
- **Response 200 OK:** `ResearchRun` record.

#### `GET /api/v1/research-runs/{runId}/events`
- **Purpose:** Live Server-Sent Events (SSE) stream for real-time progress visualization (`ADR-009`).
- **Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`.
- **Sample Event Stream:**
  ```text
  event: stage_change
  data: {"stage": "SEARCHING", "queriesExecuted": 2}

  event: source_discovered
  data: {"domain": "retailer.com", "sourcesTotal": 8}

  event: run_completed
  data: {"status": "COMPLETED", "durationMs": 24150}
  ```

#### `POST /api/v1/research-runs/{runId}/cancel`
- **Purpose:** Request immediate cancellation of in-flight research (`SEC-035`).
- **Response 200 OK:** `{ "status": "CANCELLATION_REQUESTED" }`.

#### `GET /api/v1/research-runs/{runId}/results`
- **Purpose:** Retrieve verified and categorized research findings.
- **Query Parameters:** `classification` (optional filter: `EXACT_MATCH`, `NEAR_MATCH`, etc.).
- **Response 200 OK:**
  ```json
  {
    "runId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "summaryMarkdown": "Found 3 verified retail offers under $550...",
    "resultsByTier": {
      "exactMatches": [ /* CandidateResult[] */ ],
      "nearMatches": [ /* CandidateResult[] */ ],
      "partiallyVerified": [ /* CandidateResult[] */ ],
      "conflicting": [ /* CandidateResult[] */ ],
      "excluded": [ /* CandidateResult[] */ ]
    }
  }
  ```

---

### 2.4 Sources & Evidence (`/api/v1/evidence`, `/api/v1/research-runs/{runId}/sources`)

#### `GET /api/v1/research-runs/{runId}/sources`
- **Purpose:** List all remote web pages extracted during the run.
- **Response 200 OK:** Array of `SourceDocument` objects (excluding full bodies; excerpt only).

#### `GET /api/v1/research-runs/{runId}/evidence`
- **Purpose:** List all field-level verified/refuted evidence records.
- **Response 200 OK:** Array of `EvidenceRecord` objects with verbatim quotes.

#### `GET /api/v1/evidence/{evidenceId}`
- **Purpose:** Inspect deep provenance and source context for a specific claim.
- **Response 200 OK:** `EvidenceRecord` joined with source metadata.

---

### 2.5 Provider Settings & Key Vault (`/api/v1/settings/providers`)

#### `GET /api/v1/settings/providers`
- **Purpose:** List configured provider keys and connection statuses.
- **Security Guarantee:** **Never returns raw API keys (`SEC-001`).**
- **Response 200 OK:**
  ```json
  [
    {
      "provider": "openai",
      "isConfigured": true,
      "maskedKey": "sk-...4a89",
      "connectionStatus": "VERIFIED",
      "lastTestedAt": "2026-10-30T10:15:00.000Z"
    }
  ]
  ```

#### `POST /api/v1/settings/providers`
- **Purpose:** Submit a new or updated provider API key.
- **Processing:** Encrypts key via AES-256-GCM into database vault (`SEC-002`).
- **Request Body:** `{ "provider": "openai", "apiKey": "sk-proj-..." }`.
- **Response 200 OK:** `{ "provider": "openai", "status": "STORED_ENCRYPTED" }`.

#### `POST /api/v1/settings/providers/test`
- **Purpose:** Ephemeral zero-side-effect connection test (`SEC-004`).
- **Response 200 OK:** `{ "valid": true, "latencyMs": 142 }`.

#### `DELETE /api/v1/settings/providers/{providerId}`
- **Purpose:** Remove stored credential from vault.
- **Response 204 No Content.**

---

### 2.6 Schedules & Recurring Monitoring (`/api/v1/schedules`)

#### `GET /api/v1/schedules`
- **Purpose:** List user's active and paused recurring monitoring tasks.
- **Response 200 OK:** Array of `ResearchSchedule` objects.

#### `POST /api/v1/schedules`
- **Purpose:** Schedule a task for periodic re-execution.
- **Validation:** Minimum interval enforced at 6 hours (`SEC-036`). Submitting `*/5 * * * *` returns HTTP 400.
- **Request Body:**
  ```json
  {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "cronExpression": "0 0 * * *",
    "timezone": "America/New_York",
    "changeNotificationThresholdPct": 2.0
  }
  ```
- **Response 201 Created:** `ResearchSchedule` record.

#### `PATCH /api/v1/schedules/{scheduleId}`
- **Purpose:** Pause or resume schedule (`{ "status": "PAUSED" }` or `{ "status": "ACTIVE" }`).
- **Response 200 OK:** Updated `ResearchSchedule`.

#### `GET /api/v1/schedules/{scheduleId}/changes`
- **Purpose:** Retrieve chronological audit log of detected price drops and stock changes.
- **Response 200 OK:** Array of `ChangeEvent` objects.

---

### 2.7 Multi-Format Export (`/api/v1/research-runs/{runId}/export`)

#### `GET /api/v1/research-runs/{runId}/export`
- **Purpose:** Export research report and evidence tables.
- **Query Parameters:** `format` (`json`, `csv`, `markdown`).
- **Security Guarantees:**
  - Formula injection neutralization (`'` prepended to `=,+,-,@`) on CSV (`SEC-025`).
  - Regex filename sanitization (`Content-Disposition: attachment; filename="report-2026-10-30.csv"`).
  - Absolute exclusion of API keys and private tokens.
- **Response 200 OK:** File stream with appropriate MIME type.

---

### 2.8 AI Provider Settings & Credential Configuration (`/api/settings/providers`)

Governed by **Step 26** (AI Provider Settings CRUD, Secure Credential UI, Connection Tests).

#### `GET /api/settings/providers`
- **Purpose:** List safe metadata for all supported AI providers (OpenAI, OpenRouter, NVIDIA NIM).
- **Auth:** Authenticated Session Required (`requireAuthenticatedCaller`).
- **Response 200 OK:**
  ```json
  {
    "providers": [
      {
        "id": "openai",
        "name": "OpenAI",
        "description": "Industry-standard frontier models including GPT-4o.",
        "category": "Primary AI Model",
        "docsUrl": "https://platform.openai.com/api-keys",
        "keyPlaceholder": "sk-proj-...",
        "helpText": "Generate a secret key from your OpenAI platform dashboard.",
        "isConfigured": true,
        "isEnabled": true,
        "credentialPreview": "sk-...4321",
        "lastConnectionTestStatus": "SUCCESS",
        "lastConnectionTestAt": "2026-11-02T08:00:00.000Z",
        "selectedModelId": null,
        "updatedAt": "2026-11-02T08:00:00.000Z"
      }
    ]
  }
  ```

#### `POST /api/settings/providers`
- **Purpose:** Save or replace provider API credential securely via AES-256-GCM vault encryption.
- **Auth:** Authenticated Session Required.
- **Request Body:**
  ```json
  {
    "providerId": "openai",
    "apiKey": "sk-proj-example1234567890",
    "isEnabled": true,
    "selectedModelId": null
  }
  ```
- **Response 200 OK:** Sanitized `ProviderSettingsItemDTO` with `credentialPreview`. Plaintext key is never returned.

#### `GET /api/settings/providers/{providerId}`
- **Purpose:** Retrieve configuration metadata for a single supported provider.
- **Auth:** Authenticated Session Required.

#### `PATCH /api/settings/providers/{providerId}`
- **Purpose:** Update non-secret metadata (`isEnabled`, `selectedModelId`).
- **Auth:** Authenticated Session Required.

#### `DELETE /api/settings/providers/{providerId}`
- **Purpose:** Permanently remove provider credential ciphertext from vault and delete configuration record.
- **Auth:** Authenticated Session Required.
- **Response 200 OK:** `{ "success": true, "providerId": "openai" }`.

#### `POST /api/settings/providers/{providerId}/test`
- **Purpose:** User-initiated explicit connection probe to verify connectivity and API key validity.
- **Auth:** Authenticated Session Required.
- **Characteristics:** Strictly non-inference. Probes lightweight metadata endpoint (`/v1/models` or `/v1/auth/key`) with 5s timeout and manual redirect handling. Zero prompt tokens consumed.
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "code": "SUCCESS",
    "message": "Connection and API key successfully verified with provider.",
    "testedAt": "2026-11-02T08:05:00.000Z",
    "durationMs": 142
  }
  ```

