# ADR-001: Frontend Architecture & TypeScript Unification Strategy

**Status:** APPROVED  
**Date:** 2026-10-30  
**Phase:** Phase 1 (Step 5 of 60)  
**Deciders:** Principal Software Architect, Frontend Lead  
**Related Requirements:** UR-001, UR-011, UR-021, NFR-003, NFR-004, NFR-006  
**Traceability:** Implements [DEC-002](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/DECISION_REGISTER.md#2-confirmed-technical-decisions-dec), maps to [AC-001](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-001-natural-language-query-input-and-parsing), [AC-011](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/ACCEPTANCE_CRITERIA.md#ac-011-theme-accent-customization-and-reduced-motion)

---

## 1. Context and Problem Statement

VerityScout AI requires a responsive, high-performance, accessible web application supporting natural-language research, real-time progress indicators, interactive evidence inspectors, and user-configurable theme controls (cyan/violet accents with reduced-motion support). The engineering team requires static type safety across API boundaries, high component reusability, and rapid iteration without managing mismatched data schemas between languages.

## 2. Considered Alternatives

1. **Alternative 1: Next.js (App Router) + React + Full-Stack TypeScript + Vanilla CSS Modules** *(Chosen)*
2. **Alternative 2: Single-Page Application (SPA) with Vite + React + Separate Python FastAPI Backend**
3. **Alternative 3: Next.js with Tailwind CSS**

## 3. Decision Outcome & Chosen Approach

We adopt **Next.js (App Router) with React, compiled from TypeScript, using Vanilla CSS / CSS Modules with standard CSS Custom Properties for design tokens**.

### Key Technical Tenets:
- **Unified TypeScript Contracts:** Shared data transfer objects (DTOs), Zod schemas, and domain interfaces between client UI components, API route handlers, and worker tasks.
- **Design Token System:** Pure Vanilla CSS using custom properties (`--color-bg`, `--color-accent-cyan`, `--color-accent-violet`) and strict media query enforcement (`prefers-reduced-motion: reduce`). Tailwind CSS is excluded to preserve fine-grained token control and avoid utility-class bloat.
- **Semantic HTML & WCAG 2.2 AA:** Semantic landmarks (`<main>`, `<nav>`, `<article>`, `<section>`), aria attributes, and keyboard navigation.

## 4. Consequences and Trade-offs

- **Benefits:**
  - Zero type drift between client forms and backend route validators.
  - Native Server Components reduce client-side JavaScript bundle sizes.
  - CSS Custom Properties enable effortless runtime accent theming without CSS re-compilation.
- **Trade-offs:**
  - Writing CSS modules requires slightly more initial boilerplate than Tailwind utility classes, but ensures strict adherence to custom design tokens.

## 5. Security & Privacy Implications

- Precludes client-side secret exposure: client bundles strictly exclude any environment variables not explicitly prefixed with `NEXT_PUBLIC_` (`SEC-001`).
- DOMPurify sanitization enforced on all evidence cards to eliminate XSS risks (`SEC-021`, `VS-THR-006`).

## 6. Implementation & Validation Plan

- **Implementation Steps:** Step 6 (Foundations), Step 7 (TypeScript & Linting), Step 11–17 (UI Components).
- **Validation Criteria:** 100% TypeScript compilation check (`tsc --noEmit`), automated WCAG 2.2 AA testing via `axe-core` in Playwright (`AC-026`).
