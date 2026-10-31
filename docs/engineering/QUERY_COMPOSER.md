# VerityScout AI — Query Composer Feature Specification

**Document Identifier:** VS-ENG-QUERY-COMPOSER-v1.0  
**Phase:** Phase 4 — Core Feature Workflows & Constraint Systems  
**Step:** Step 16 of 60  
**Status:** APPROVED FEATURE SPECIFICATION  
**Governed by:** ADR-001 (App Router & Vanilla CSS), ADR-002 (Modular Monolith), Requirements `UR-001` & `AC-001`  

---

## 1. Feature Purpose & Responsibilities

The `QueryComposer` is the primary research-intake component of VerityScout AI. It provides an intuitive, accessible multiline natural-language input field where users can enter, edit, and locally validate research queries without needing boolean search operators, complex query syntax, or rigid forms.

### 1.1 Strict Boundary Invariant
The Query Composer in Step 16 handles **client-side input composition and deterministic local validation only**. It deliberately does **not**:
- Launch background research jobs or BullMQ workers.
- Contact external LLM providers (OpenAI, OpenRouter, NVIDIA NIM).
- Query live web search engines (Tavily, Exa, Firecrawl).
- Persist drafts to `localStorage`, `sessionStorage`, or PostgreSQL.
- Perform constraint parsing or filter editing (deferred to Step 17).

---

## 2. Component Architecture & File Locations

All feature logic is encapsulated within the modular feature directory established in Step 10:

```
src/features/research/
├── components/
│   ├── QueryComposer.tsx          # Client Component ("use client")
│   └── QueryComposer.module.css   # Vanilla CSS module with tokens
├── types.ts                       # Public component & validation interfaces
├── constants.ts                   # MAX_QUERY_LENGTH, prompt examples, error messages
├── validation.ts                  # Pure deterministic query validation function
├── QueryComposer.test.tsx         # Comprehensive Vitest component tests (QUERY-UNIT-001–012)
└── index.ts                       # Feature barrel re-exporting public API
```

Integrated within:
- `src/app/research/page.tsx` — Research Workspace page (Server Component embedding `<QueryComposer />`).

---

## 3. Component Contract & Props

```typescript
export interface QueryComposerProps {
  /** Initial query text if pre-seeded by a parent route or workflow (default: '') */
  readonly initialQuery?: string;
  /** Integration-ready callback fired when the query passes local validation */
  readonly onQueryValidated?: (normalizedQuery: string) => void;
  /** Optional container class name for layout integration */
  readonly className?: string;
}
```

---

## 4. Deterministic Local Validation Rules

Validation is executed by `validateQuery(rawQuery: string): ValidationResult` located in `src/features/research/validation.ts`:

1. **Empty & Whitespace-Only Validation:**
   - Evaluates `rawQuery.trim()`.
   - If empty: returns `{ isValid: false, error: 'Enter a research question to continue.' }`.
2. **Length Boundary:**
   - Evaluates `rawQuery.length > MAX_QUERY_LENGTH` (1,000 characters).
   - If exceeded: returns `{ isValid: false, error: 'Query exceeds maximum length of 1,000 characters.' }`.
3. **Draft Preservation:**
   - The user's visible text is **never** mutated or auto-trimmed during editing.
   - Punctuation, capitalization, and newlines are fully preserved.
   - Only the callback receives the normalized trimmed string.
4. **Validation Timing:**
   - No validation errors are displayed on initial page load.
   - Validation triggers on clicking **"Validate & Stage Query"** or pressing **Ctrl+Enter / Cmd+Enter**.
   - Any active error or success banner is automatically cleared as soon as the user edits the query.

---

## 5. Input Experience & Keyboard Interaction

- **Multiline Textarea:** Standard native `<textarea>` wrapped in the reusable accessible `FormField` component.
- **Line Breaks:** Pressing <kbd>Enter</kbd> inserts a normal newline.
- **Keyboard Shortcut:** Pressing <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (or <kbd>Cmd</kbd> + <kbd>Enter</kbd> on macOS) triggers query validation.
- **Real-Time Character Counter:**
  - Displays `X / 1,000 characters` with tabular numbers.
  - Changes to warning color at 90% (900 chars) and error color when exceeding 1,000 chars.
- **Draft Reset:**
  - Clear button is disabled when query is empty.
  - Clicking Clear wipes the textarea, resets character count to 0, and dismisses all validation alerts.

---

## 6. Curated Example Starter Queries

To assist users in understanding the natural-language intake format, three realistic multi-constraint examples are available:

1. **`[Laptops]` ThinkPad T14 Gen 3:**
   > *"Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700"*
2. **`[PC Hardware]` RTX 4080 Super:**
   > *"RTX 4080 Super GPU under $950 in new condition with at least 3 display ports, excluding open-box"*
3. **`[Audio]` Sony WH-1000XM5:**
   > *"Sony WH-1000XM5 headphones under $300 in new condition, black color only, exclude eBay"*

*Interaction Rule:* Clicking an example populates the textarea without auto-submitting, allowing the user to review and edit before validating.

---

## 7. Truthful Submission & Execution Boundary

When a valid query is submitted, the component displays an explicit success `Alert`:
> **Query Passes Local Validation:** Your research question contains valid content and fits within length constraints. Constraint extraction and negative filter editing will connect in Step 17. Live execution (Step 18+ telemetry & Step 43 worker pipeline) is currently disconnected; no live API requests were made.

This prevents any false indication that web scraping or LLM extraction has already occurred.

---

## 8. Privacy, Security & Data Boundaries

1. **Zero External Transmission:** Query text is strictly confined to React component state. No network requests are made.
2. **Zero Storage Persistence:** Drafts are not written to `localStorage`, `sessionStorage`, or cookies.
3. **Zero Raw Logging:** Query text is not sent to server loggers or browser console logs, preventing confidential search intent from leaking.
4. **Safe DOM Rendering:** User input is rendered via React standard text nodes; `dangerouslySetInnerHTML` is strictly avoided.

---

## 9. Automated Testing & Verification

### 9.1 Unit & Component Tests (`vitest`)
File: `src/features/research/QueryComposer.test.tsx`
- `QUERY-UNIT-001`: Initial empty state without preloaded query or error.
- `QUERY-UNIT-002`: Text entry and character counter updates.
- `QUERY-UNIT-003`: Preservation of multiline text and newlines.
- `QUERY-UNIT-004`: Rejection of empty query string.
- `QUERY-UNIT-005`: Rejection of whitespace-only query string.
- `QUERY-UNIT-006`: Valid query passes validation and invokes callback.
- `QUERY-UNIT-007`: Draft preservation upon validation failure.
- `QUERY-UNIT-008`: Example query selection populates input without auto-submitting.
- `QUERY-UNIT-009`: Clear button resets input, counter, and alert states.
- `QUERY-UNIT-010`: Truthful disclosure of disconnected research execution.
- `QUERY-UNIT-011`: Character boundary enforcement at 1,000 characters.
- `QUERY-UNIT-012`: Keyboard shortcut <kbd>Ctrl</kbd>+<kbd>Enter</kbd> validation.

### 9.2 End-to-End Tests (`playwright`)
File: `tests/e2e/query-composer.spec.ts`
- `COMPOSER-E2E-001`: Accessible label, textarea, character counter, and button state checks.
- `COMPOSER-E2E-002`: Inline error rendering on empty and whitespace submission.
- `COMPOSER-E2E-003`: Example prompt selection and character counter sync.
- `COMPOSER-E2E-004`: Valid query submission and truthful disclosure display.
- `COMPOSER-E2E-005`: Clear button behavior and state restoration.
- `COMPOSER-E2E-006`: Keyboard shortcut navigation (<kbd>Enter</kbd> vs <kbd>Ctrl+Enter</kbd>).
- `COMPOSER-E2E-007`: Mobile 375px responsive layout and zero horizontal overflow.
