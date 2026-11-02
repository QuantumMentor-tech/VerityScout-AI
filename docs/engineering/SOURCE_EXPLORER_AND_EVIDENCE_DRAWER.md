# SOURCE EXPLORER AND EVIDENCE DRAWER SPECIFICATION

**Feature:** Source Explorer, Evidence Drawer, Source Provenance, and Claim-to-Source Traceability  
**Phase:** 4 of 12 (Frontend Foundation & Interaction Layer)  
**Step:** 20 of 60  
**Status:** Implemented & Verified  
**Governance:** `DATA_CONTRACTS.md` (Sections 2.2, 3.3, 3.4)

---

## 1. Overview & Purpose

The **Source Explorer** and **Evidence Drawer** form the provenance and traceability interface layer of VerityScout AI. The layer enables users to examine discovered web documents and inspect verifiable excerpts associated with candidate research results, without ever fabricating citations, claims, or verification statuses.

- **Source Explorer (`SourceExplorer.tsx`)**: Reusable presentation component displaying the collection of discovered web source documents, canonical domains, access/extraction states, timestamps, and safe external navigation links.
- **Evidence Drawer (`EvidenceDrawer.tsx`)**: Accessible modal detail drawer (reusing the Step 14 `Dialog` primitive) that displays verbatim source excerpts, document locations, extraction methodologies, and explicit verification states.
- **Candidate Traceability View (`CandidateEvidenceView.tsx`)**: Interactive coordinator linking candidate cards, attribute-level evidence triggers, and the Evidence Drawer.

---

## 2. Source & Evidence Data Contracts

The domain models conform strictly to `DATA_CONTRACTS.md`:

```typescript
export enum SourceAccessState {
  ACCESSIBLE = 'ACCESSIBLE',
  BLOCKED_BOT_CHALLENGE = 'BLOCKED_BOT_CHALLENGE',
  HTTP_ERROR = 'HTTP_ERROR',
  TIMEOUT = 'TIMEOUT',
  DNS_RESOLUTION_FAILED = 'DNS_RESOLUTION_FAILED',
  SSRF_PROHIBITED = 'SSRF_PROHIBITED',
}

export enum ExtractionState {
  SUCCESS = 'SUCCESS',
  EMPTY_BODY = 'EMPTY_BODY',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  PARSING_FAILED = 'PARSING_FAILED',
  SKIPPED = 'SKIPPED',
}

export enum VerificationState {
  SUPPORTED = 'SUPPORTED',
  CONTRADICTED = 'CONTRADICTED',
  UNKNOWN = 'UNKNOWN',
  CONFLICTING = 'CONFLICTING',
  STALE = 'STALE',
}

export type ExtractionMethod = 'LLM_STRUCTURED' | 'REGEX_DETERMINISTIC' | 'META_TAG' | 'DOM_SELECTOR';

export interface SourceDocument {
  readonly id: string;
  readonly runId: string;
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly domain: string;
  readonly title: string;
  readonly discoveryProvider: string;
  readonly accessState: SourceAccessState;
  readonly extractionState: ExtractionState;
  readonly httpStatusCode?: number | undefined;
  readonly contentHash?: string | undefined;
  readonly extractedTextExcerpt?: string | undefined;
  readonly retrievedAt: string;
  readonly publishedAt?: string | undefined;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly runId?: string | undefined;
  readonly sourceId: string;
  readonly candidateId?: string | undefined;
  readonly claimKey: string;
  readonly extractedRawValue: string;
  readonly normalizedValue?: string | number | undefined;
  readonly unitOrCurrency?: string | undefined;
  readonly verbatimQuote?: string | undefined;
  readonly verificationState: VerificationState;
  readonly conflictDetails?: string | undefined;
  readonly extractionMethod: ExtractionMethod;
  readonly extractedAt?: string | undefined;
  readonly locationInDocument?: string | undefined;
  readonly confidenceScore?: number | undefined;
  readonly capturedAt?: string | undefined;
}
```

---

## 3. Provenance & Relationship Rules

1. **Explicit Identifiers**: Evidence records reference their parent source strictly via `evidence.sourceId === source.id`. Lookup failures never silently fall back to unrelated sources.
2. **Candidate & Attribute Specificity**: Evidence is bound to a specific candidate (`candidateId`) and specific attribute/claim (`claimKey`). Supporting evidence for "RAM" does not verify "Price" or "Condition".
3. **Source Existence ≠ Claim Verification**: A valid source URL or title does not infer verification. Verification status must be explicitly supplied by the engine (`SUPPORTED`, `CONTRADICTED`, `CONFLICTING`, `UNKNOWN`, `STALE`).
4. **Verbatim Fidelity**: Direct source excerpts (`verbatimQuote`) are rendered as plain text nodes without paraphrasing, rewriting, or summarizing.

---

## 4. URL Validation & Security Boundary

Source URLs originate from external search engines and third-party web content and are treated as untrusted data.

### Validation Function (`src/features/evidence/url-validator.ts`)

- **Protocol Whitelist**: Only `http:` and `https:` schemes are permitted.
- **Protocol Rejection**: `javascript:`, `data:`, `file:`, `blob:`, `vbscript:`, and malformed URLs are rejected.
- **Credential Protection**: URLs with embedded username/password (`https://user:pass@host`) are strictly rejected.
- **Link Rendering**:
  - Valid URLs: Rendered as an anchor with `target="_blank"` and `rel="noopener noreferrer"`.
  - Untrusted/Prohibited URLs: Rendered as inert badge text with `role="status"` displaying `Link unavailable (Unsupported or prohibited protocol...)`.
- **Zero Live Network Requests**: Step 20 components never fetch external URLs, invoke iframes, load screenshots, or unfurl links.

---

## 5. Evidence Content Safety

- **Text-Only Rendering**: React standard JSX text nodes are used for all titles, domains, excerpts, and values.
- **Zero HTML Injection**: No `dangerouslySetInnerHTML`, `innerHTML`, or raw HTML rendering.
- **Inert Prompt Handling**: Excerpts containing instructions or markup-like characters (e.g. `<script>`, `Ignore previous instructions`) are displayed inertly as text.

---

## 6. Component Architecture & UI Hierarchy

```
CandidateEvidenceView (Container & Drawer Orchestrator)
 ├── Candidate Cards List
 │    └── Attribute Grid
 │         └── "View Evidence" Button (per verified attribute with evidence)
 ├── SourceExplorer
 │    └── Source Grid
 │         └── Source Cards (Title, Domain, Badges, Safe URL / Status, Inspect Evidence)
 └── EvidenceDrawer (Reuses Dialog primitive)
      ├── Header: Title & Description
      ├── Badges: VerificationState, ExtractionMethod, Evidence ID
      ├── Target Claim Card (Claim Key, Extracted Value, Candidate Name)
      ├── Conflict Details Alert (if CONFLICTING/CONTRADICTED)
      ├── Verbatim Quote Box (exact quoted text)
      ├── Document Location Tag
      ├── Source Document Metadata Grid (Domain, Provider, AccessState, Retrieval timestamp)
      ├── Safe Link to Original Source
      └── Synthetic Fixture Disclosure Notice
```

---

## 7. Accessibility & Responsive Support

- **Dialog Semantics**: Full ARIA dialog semantics (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`).
- **Focus Management**: Focus trapped within modal while active; restored to trigger button upon close.
- **Keyboard Navigation**: Accessible close button and Escape key dismissal (`closeOnEscape`).
- **Responsive Viewports**: Tested and verified at 375px, 768px, 1024px, and 1440px. Zero horizontal page overflow.
- **Reduced Motion**: Respects app-level and system `prefers-reduced-motion` settings.

---

## 8. Verification & Test Coverage

### Automated Test Suites

| Suite | File | Tests | Status |
|---|---|---|---|
| URL Validator Unit Tests | `src/features/evidence/url-validator.test.ts` | 8 | PASS |
| Source Explorer Unit Tests | `src/features/evidence/SourceExplorer.test.tsx` | 8 | PASS |
| Evidence Drawer Unit Tests | `src/features/evidence/EvidenceDrawer.test.tsx` | 14 | PASS |
| Evidence Explorer E2E | `tests/e2e/evidence-explorer.spec.ts` | 6 | PASS |
| Full Vitest Suite | `npx vitest run` | 132 | PASS |
| Full Playwright Suite | `npx playwright test` | 36 | PASS |
| TypeScript Typecheck | `tsc --noEmit` | 0 errors | PASS |
| ESLint Linting | `eslint .` | 0 warnings | PASS |
| Production Build | `next build` | 8/8 pages | PASS |

### Test IDs Mapped to Requirements

- `SOURCE-UNIT-001` through `007`: Valid metadata, safe external URL, invalid URL handling, missing optional metadata, derived source counts, empty source collection, zero live fetching.
- `EVIDENCE-UNIT-001` through `007`: Valid source association, invalid source association handling, candidate isolation, attribute specificity, missing excerpt handling, exact verbatim excerpt rendering, no fabricated verification.
- `DRAWER-UNIT-001` through `007`: Drawer opening, drawer closing, focus and ARIA attributes, source context, null/missing record safety, inert text rendering, state reset on candidate change.
- `EVIDENCE-E2E-001` through `006`: Full end-to-end integration across candidate cards, attribute triggers, source grid, safe external links, untrusted protocol rejection, and 375px mobile viewport responsiveness.

---

## 9. Boundary Declaration & Next Steps

- **Completed**: Step 20 (Source Explorer, Evidence Drawer, Source Provenance, and Claim-to-Source Traceability).
- **Phase 4 Status**: Complete.
- **Strict Stop Boundary**: Step 21 (PostgreSQL database schema & migrations) has **NOT** been started.
