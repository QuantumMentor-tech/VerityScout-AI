# ADR-008: RESTful API Design, Versioning & Strict Schema Validation

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, API Architect  
**Related Requirements:** UR-001, UR-002, UR-013, NFR-007, NFR-008  
**Traceability:** Maps to [AC-001](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-001-natural-language-query-input-and-parsing), [AC-014](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-014-structured-multi-format-research-exports), [SEC-024](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md#sec-024-input-schema-validation-on-all-api-boundaries)

---

## 1. Context and Problem Statement

VerityScout AI requires a robust API surface to support the web interface, automated scheduled executions, result exports, and future native clients. The API must enforce strict input boundaries, reject malformed payloads before business logic execution, prevent Mass Assignment vulnerabilities, provide stable machine-readable error responses, and support forward-compatible versioning.

## 2. Considered Alternatives

1. **Alternative 1: Versioned RESTful API (`/api/v1/*`) with Strict Zod Validation** *(Chosen)*
2. **Alternative 2: GraphQL API**
3. **Alternative 3: tRPC without REST Envelopes**

## 3. Decision Outcome & Chosen Approach

We adopt a **versioned RESTful API under the base path `/api/v1/`**, utilizing **Zod schemas for 100% of request and response boundaries**.

### Technical Contract Standards:
- **Base URI:** `/api/v1/`
- **HTTP Methods:** Standard semantics (`GET` for reads, `POST` for creation and commands, `PATCH` for partial updates, `DELETE` for removal).
- **Strict Ingress Parsing:** Every route handler validates `req.json()` against a Zod schema configured with `.strict()`. Unrecognized or extraneous fields trigger immediate HTTP 400 rejection (`SEC-024`).
- **Standard Envelope for Errors:**
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid query payload",
      "details": [{ "field": "query", "issue": "String must contain at least 3 characters" }],
      "requestId": "req_01h7x..."
    }
  }
  ```
- **Asynchronous Execution Pattern:** Resource-intensive research endpoints return **HTTP 202 Accepted** with a Location header and status object `{ "runId": "...", "status": "QUEUED" }`.

## 4. Consequences and Trade-offs

- **Benefits:**
  - Standard REST makes the API effortlessly consumable by third-party tooling, curl, and OpenAPI code generators.
  - Zod schemas compile directly to TypeScript types, guaranteeing 0% type divergence.
- **Trade-offs:**
  - Multiple endpoints require more routing definitions than a single GraphQL endpoint, but eliminate GraphQL query complexity and authorization bypass risks.

## 5. Security & Privacy Implications

- Neutralizes Mass Assignment: attackers cannot inject `{ "role": "admin" }` or `{ "verified": true }` because `.strict()` rejects unexpected keys (`VS-THR-004`).
- Standard error responses sanitize internal stack traces and database errors to prevent reconnaissance (`SEC-003`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 7 (Architecture Boundaries), Step 23 (API Ingress), Step 24 (Authorization).
- **Validation Criteria:** Integration test suite fuzzing all API routes with malformed JSON, invalid enums, and over-length strings (`SEC-TEST-004`).
