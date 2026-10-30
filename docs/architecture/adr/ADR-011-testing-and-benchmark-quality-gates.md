# ADR-011: Automated Testing Strategy, Benchmark Integration & Release Gates

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, QA Lead  
**Related Requirements:** NFR-001, NFR-006, NFR-007, NFR-009  
**Traceability:** Implements [DEC-007](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [RESEARCH_BENCHMARK_SPEC.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/benchmark/RESEARCH_BENCHMARK_SPEC.md), [SECURITY_TEST_PLAN.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_TEST_PLAN.md)

---

## 1. Context and Problem Statement

VerityScout AI requires a multi-layered automated testing harness covering pure TypeScript logic, database queries, Redis queues, browser DOM rendering, accessibility compliance, security protections (SSRF, XSS, prompt injection), and factual research quality. Testing must run rapidly in CI without incurring live third-party API costs.

## 2. Considered Alternatives

1. **Alternative 1: Vitest (Unit/Integration) + Playwright (E2E/A11y) + Canonical Benchmark Dataset** *(Chosen)*
2. **Alternative 2: Jest + Cypress**
3. **Alternative 3: Manual Testing Only**

## 3. Decision Outcome & Chosen Approach

We adopt a **three-tier automated testing hierarchy**:
1. **Tier 1: Unit & Contract Tests (Vitest):**
   - High-speed in-memory execution of domain logic, constraint verification arithmetic, URL parsing, Zod schemas, and logging redaction.
   - Target: >85% code coverage on core domain modules.
2. **Tier 2: Integration & Security Tests (Vitest + Local Test Containers / Stubs):**
   - Database transactions, PostgreSQL RLS policies, BullMQ worker lifecycle, and Dead-Letter Queue retries.
   - Mock HTTP server testing for SSRF blocklist, redirect hop verification, and decompression bombs (`SEC-TEST-005` to `SEC-TEST-008`).
3. **Tier 3: End-to-End Browser & Accessibility (Playwright + axe-core):**
   - Full browser execution testing query input, SSE progress visualization, evidence modal inspection, and theme switching.
   - Automated WCAG 2.2 AA accessibility audit asserting zero high/critical accessibility violations (`NFR-006`).
4. **Research Quality Benchmark Gate:**
   - Pre-deployment validation against the 60 canonical ground-truth cases in `verityscout_benchmark.jsonl`.
   - Quality Gate: $\ge 90\%$ overall factual accuracy score, 100% pass on negative constraint verification cases, and 0% budget-exceeding items in Strong Match tier (`EVALUATION_RUBRIC.md`).

## 4. Consequences and Trade-offs

- **Benefits:**
  - Fast feedback loop: Vitest runs native ESM in milliseconds.
  - Complete protection against factual regressions and security vulnerabilities in CI before code merges.
- **Trade-offs:**
  - Maintaining realistic HTML source fixtures requires updating fixtures when retail site DOM structures evolve.

## 5. Security & Privacy Implications

- CI tests execute against synthetic fixtures and mock server stubs; zero real billing keys or live production databases are touched during testing.

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 8 (Test Toolchain), Steps 51–56 (Comprehensive Verification Phase).
- **Validation Criteria:** 100% test suite execution passing in automated CI pipeline before Step 60 Release Gate.
