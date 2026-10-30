# VerityScout AI — Engineering Policy: TypeScript Strictness, Dependency Governance, Linting & Architecture Boundaries

**Document ID:** `ENG-POL-001`  
**Version:** `1.0.0`  
**Status:** `ACTIVE / FROZEN`  
**Step Alignment:** Step 7 of 60 (Phase 2: Project Setup and Toolchain)  
**Last Updated:** 2026-10-30  

---

## 1. Purpose and Scope

This document establishes the binding engineering rules, compiler strictness criteria, linting standards, dependency governance processes, naming conventions, and architectural import boundaries for the VerityScout AI codebase.

The scope covers:
- All source code in `src/` (presentation, API ingress, domain logic, verification engine, provider adapters, worker, and persistence).
- Root configuration files (`tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `package.json`).
- Script tooling and automation runners.
- Any future test files under `tests/`.

This policy ensures long-term codebase hygiene, zero circular dependencies, strict type safety, predictable build artifacts, and strict separation between privileged server modules and browser-accessible code.

---

## 2. Supported Runtime and Toolchain Assumptions

| Component | Verified Specification | Support Status & Governance Policy |
| :--- | :--- | :--- |
| **Node.js Runtime** | `v26.8.1` (Active Environment) / Node.js LTS (v20+, v22+) | Active runtime verified compatible with Next.js 15. CI will validate across Node.js LTS releases. |
| **Package Manager** | `npm` (`v11.19.0`) | Single authoritative package manager for this repository. `package-lock.json` is the sole lockfile. No competing package managers (yarn, pnpm, bun) permitted. |
| **Framework** | Next.js `15.5.28` (App Router) | React 19 (`19.0.0`) foundation. Server Components by default; Client Components explicit via `'use client'`. |
| **Language** | TypeScript `5.7.2` | Static type checking via `tsc --noEmit`. No untyped JavaScript application code in `src/`. |
| **Linter** | ESLint `9.17.0` | Modern Flat Config (`eslint.config.mjs`). Directly executed via `npx eslint .`. |
| **Styling** | Vanilla CSS & CSS Modules | Strictly component-scoped CSS Modules + CSS Custom Properties. Tailwind CSS is excluded (`ADR-001`). |

---

## 3. TypeScript Strictness Policy

VerityScout AI mandates an uncompromised strict TypeScript baseline. The TypeScript compiler (`tsc`) must pass with **0 errors and 0 warnings** under all configured flags before any PR or commit may be integrated.

### 3.1 Strict Compiler Options (`tsconfig.json`)

The following options are active in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 4. Rationale for Important Compiler Options

1. **`"strict": true`:**
   Enables the full TypeScript strict suite: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, and `alwaysStrict`. Eliminates accidental `undefined` dereferences and unchecked type coercions.

2. **`"noUncheckedIndexedAccess": true`:**
   When accessing elements in arrays or dictionary maps (`arr[i]`, `map[key]`), TypeScript infers the result as `T | undefined` rather than `T`. This prevents out-of-bounds runtime errors in source extraction and evidence ranking.

3. **`"exactOptionalPropertyTypes": true`:**
   Distinguishes between a property being omitted (`{ prop?: string }`) and explicitly set to `undefined` (`{ prop: undefined }`). Ensures data contracts and API serialization match schema specifications exactly without ambiguous property shapes.

4. **`"noImplicitOverride": true`:**
   Enforces that sub-classes or provider adapter implementations explicitly mark overridden methods with `override`. Guarantees adapter signature drift is caught at compile-time.

5. **`"noFallthroughCasesInSwitch": true`:**
   Ensures that every `case` statement in a `switch` block either terminates (`break`, `return`, `throw`) or is deliberately structured. Critical for parsing state-machine transitions and candidate classification statuses.

6. **`"forceConsistentCasingInFileNames": true`:**
   Guarantees that import paths adhere strictly to filesystem casing, preventing silent Windows-vs-Linux CI build failures.

7. **`"noUnusedLocals": true` and `"noUnusedParameters": true`:**
   Prevents dead variables, orphaned imports, and unused parameters from polluting domain modules.

---

## 5. Lint Configuration and Rule Philosophy

VerityScout AI utilizes ESLint 9 Flat Configuration (`eslint.config.mjs`) leveraging `@eslint/eslintrc` `FlatCompat` to extend `next/core-web-vitals` and `next/typescript`, augmented with custom security and quality rules.

### 5.1 Enforced Rules & Rationale

- **Security (`no-eval`, `no-implied-eval`, `no-new-func`):**
  Set to `"error"`. Dynamic code execution is strictly prohibited across all application layers (`SEC-022`, `VS-THR-002`).
- **Debugging Safety (`no-debugger`):**
  Set to `"error"`. Debugger statements must never reach production builds.
- **Strict Equality (`eqeqeq: ["error", "always", { null: "ignore" }]`):**
  Enforces type-safe comparisons while allowing convenient `value == null` checks for simultaneous null/undefined detection.
- **Variable Immutability (`prefer-const: "error"`):**
  Enforces immutability by default unless mutation is demonstrably required.
- **Console Hygiene (`no-console: ["warn", { allow: ["warn", "error", "info"] }]`):**
  Disallows raw `console.log` statements in application modules; structured logging via domain logger is required.

### 5.2 Global Ignores

The following directories and files are ignored globally by ESLint:
- `.next/**` (Next.js build artifacts)
- `node_modules/**`
- `out/**`, `build/**`, `dist/**`
- `next-env.d.ts` (Auto-generated Next.js framework type declarations)
- `scripts/**` (Benchmarking and evaluation test runners)
- `data/**` (JSONL/CSV benchmark datasets)
- `docs/**` (Markdown architectural documentation)
- `tests/**` (Fixtures and test definitions)

---

## 6. Naming Conventions

Consistency across naming eliminates cognitive overhead and prevents casing discrepancies:

| Artifact | Convention | Example | Rationale |
| :--- | :--- | :--- | :--- |
| **Directories** | `kebab-case` | `src/app/`, `src/evidence-engine/` | Portable across case-sensitive and case-insensitive OS filesystems. |
| **React Components** | `PascalCase` | `EvidenceCard.tsx`, `CandidateGrid.tsx` | Standard React identifier convention. |
| **Next.js Reserved Files** | Exact Next.js names | `page.tsx`, `layout.tsx`, `route.ts`, `not-found.tsx` | Required by Next.js App Router conventions. |
| **Hooks** | `camelCase` with `use` prefix | `useEvidenceStream.ts`, `useSearchState.ts` | Enforces React Hook rules. |
| **Utility Functions** | `camelCase` | `formatCurrency.ts`, `calculateEvidenceConfidence.ts` | Standard functional JavaScript/TypeScript convention. |
| **Constants** | `UPPER_SNAKE_CASE` | `MAX_CONCURRENT_DISPATCHES`, `DEFAULT_CACHE_TTL_MS` | Readily distinguishes immutable module constants from variables. |
| **Types, Interfaces, Enums** | `PascalCase` | `CandidateProduct`, `ResearchRunState`, `ISearchProvider` | Standard TypeScript naming; no redundant `I` prefixes on domain entities. |
| **CSS Modules** | `[name].module.css` | `page.module.css`, `header.module.css` | Next.js CSS Modules scoping convention. |
| **Environment Variables** | `UPPER_SNAKE_CASE` | `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` | Shell-compatible variable standard. |

---

## 7. Import and Path-Alias Conventions

### 7.1 Path Aliases

The repository defines a single root alias in `tsconfig.json`:
- `@/*` $\rightarrow$ `./src/*`

### 7.2 Import Rules

1. **Root Module Imports:** Use `@/...` for cross-layer or deep imports (e.g., `import { CandidateStatus } from '@/types/candidate';`).
2. **Local Sibling Imports:** Use `./...` for imports within the immediate component folder (e.g., `import styles from './page.module.css';`).
3. **No Deep Relative Traversals:** Avoid `../../../../` relative path traversal across layer boundaries.
4. **Casing Exactness:** Filename imports must match actual filesystem casing exactly (e.g. `import Header from '@/components/Header'` will fail on Linux CI if file is `header.tsx`).
5. **No Circular Dependencies:** Cycles between modules are strictly forbidden. Dependency flow must always be acyclic.

---

## 8. Server / Client Separation Principles

Next.js App Router enforces a hard architectural boundary between Server and Client components:

1. **Server Components by Default:**
   All components in `src/app/` are React Server Components (RSC) unless explicitly marked with `'use client';` at the top of the file.
2. **Privileged Modules Server-Only:**
   Database connections (`src/lib/db/`), Redis clients (`src/lib/queue/`), cryptographic utilities (`src/security/`), and provider API secrets must **never** be imported into any Client Component or client-bundle file.
3. **Credential Guard:**
   Environment variables without the `NEXT_PUBLIC_` prefix are accessible only on the server. Code attempting to access private secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) on the client will be rejected during build.
4. **Data Transmission via Serialization:**
   Server-to-client data transfer props must be strictly JSON-serializable (no classes, functions, or circular references).

---

## 9. Dependency Classification and Approval Rules

### 9.1 Dependency Categorization

- **`dependencies` (Production Runtime):**
  Only packages strictly required for running the production server and serving HTTP requests (e.g., `next`, `react`, `react-dom`).
  Every candidate runtime dependency must be audited for bundle size impact, transitive footprint, and license compatibility (MIT/Apache 2.0).
- **`devDependencies` (Build & Quality Tooling):**
  Packages required solely for compilation, type checking, linting, testing, and development servers (e.g., `typescript`, `eslint`, `@types/*`).

### 9.2 Prohibited Additions (Step 7 Baseline)

The following dependency classes are strictly prohibited in Step 7:
- No database ORMs or query builders (e.g., Prisma, Drizzle) until database step.
- No AI provider SDKs (e.g., `@google/genai`, `openai`) until adapter implementation steps.
- No Redis / Queue packages (e.g., `ioredis`, `bullmq`) until worker step.
- No UI styling frameworks (e.g., `tailwindcss`) — Vanilla CSS & CSS Modules are frozen.
- No unapproved third-party analytics or client trackers.

---

## 10. Package Manager and Lockfile Rules

- **Authoritative Tool:** `npm` (Node Package Manager).
- **Sole Lockfile:** `package-lock.json` must be committed and kept strictly in sync with `package.json`.
- **Lockfile Integrity:**
  - Never manually edit `package-lock.json`.
  - Never use `--force` or `--legacy-peer-deps` without prior documented architectural review.
  - Competing lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) are strictly forbidden and excluded via `.gitignore`.
- **Reproducible Installs:**
  In CI environments, dependencies must be installed using `npm ci` rather than `npm install`.

---

## 11. Dependency Update and Security Advisory Procedure

### 11.1 Security Advisory Inspection (`npm audit`)

`npm audit` must be executed during periodic security reviews and CI pipelines.

### 11.2 Handling Transitive Advisories

When a vulnerability is flagged:
1. **Analyze Direct vs. Transitive:** Identify if the vulnerable package is directly declared or bundled transitively through an upstream framework (e.g. Next.js).
2. **Assess Exploitability:** Determine if the affected code path is reachable in VerityScout AI's architecture.
3. **Evaluate Remediation:** Check if an official patch is available within the current major semver range.
4. **Reject Breaking Overrides:** Never execute `npm audit fix --force` if it forces an unreleased, canary, or breaking major framework upgrade.
5. **Document Deferred Advisories:** If an upstream framework patch is pending, document the CVE/GHSA ID, upstream tracking issue, and compensating controls.

---

## 12. Approved Exception and Suppression Process

Directives such as `@ts-ignore`, `@ts-expect-error`, and `eslint-disable` weaken static analysis and are generally prohibited.

### Strict Suppression Guidelines:
1. **`@ts-ignore` is Strictly Banned:** Use `@ts-expect-error` instead, so that when the underlying type error is fixed, the unused suppression triggers a compiler error.
2. **Documented Rationale Mandatory:** Every `@ts-expect-error` or `eslint-disable-next-line` directive must include an inline justification explaining why the suppression is unavoidable and when it will be removed.
3. **Narrowest Possible Scope:** Always use line-scoped suppressions (`eslint-disable-next-line <rule>`). Never disable a rule for an entire file or project.

---

## 13. Canonical Verification Commands

The following commands represent the canonical verification pipeline for VerityScout AI:

| Command | Script Invocation | Purpose | Expected Output |
| :--- | :--- | :--- | :--- |
| **Type Check** | `npm run typecheck` | Validates strict TypeScript compilation (`tsc --noEmit`). | Exit Code 0, 0 errors. |
| **Lint Check** | `npm run lint` | Executes ESLint CLI across all source modules (`eslint .`). | Exit Code 0, 0 errors/warnings. |
| **Lint Fix** | `npm run lint:fix` | Automatically fixes fixable styling and formatting issues (`eslint . --fix`). | Modifies applicable files safely. |
| **Production Build** | `npm run build` | Compiles production Next.js bundle and verifies static generation. | Exit Code 0, 4/4 pages generated. |
| **Development Server** | `npm run dev` | Runs local Next.js development server on port 3000. | Serves HTTP 200 on `http://localhost:3000`. |

---

## 14. Known Limitations and Deferred Strictness Rules

| Rule / Advisory | Status | Details & Rationale |
| :--- | :--- | :--- |
| **PostCSS GHSA-qx2v-qp2m-jg93 / GHSA-6g55-p6wh-862q** | `DOCUMENTED / UPSTREAM` | Flagged by `npm audit` inside Next.js 15.5.28 internal dependencies (`postcss <=8.5.22`). Next.js 16 canary introduces the fix, but upgrading to an unreleased canary is prohibited. Exploitation is impossible as VerityScout AI does not expose user-controlled CSS sourcemaps. |
| **Architecture Boundary Plugin** | `DEFERRED TO STEP 10` | Full structural ESLint boundary plugin (`eslint-plugin-boundaries`) deferred until Step 10 scaffolds the domain and application submodules. Step 7 establishes policy and manual guidelines. |

---

## 15. Governance Evolution

This policy is a living document maintained under version control. As the project progresses through Phase 2 (Steps 8–12) and Phase 3 (Steps 13–20):
- **Step 8:** Will append Vitest and Playwright testing conventions and CI scripts.
- **Step 9:** Will integrate Zod-based environment variable schema validation.
- **Step 10:** Will codify module boundary imports as physical directory trees are instantiated.
- **Step 11:** Will document CSS Custom Property design tokens and accessibility contrast standards.
