# VerityScout AI — Reusable UI Components & Primitives

**Phase:** Phase 3 — Core Application Shell and Design Foundations  
**Step:** Step 14 of 60  
**Status:** Implemented & Verified  
**Governed by:** ADR-001 (Vanilla CSS Modules & Custom Properties), WCAG 2.2 AA Accessibility Standards, Two-Tier Motion Preference Policy  

---

## 1. Executive Summary & Architectural Scope

The **VerityScout AI Shared Component Library** provides a consistent, accessible, maintainable foundation of presentation primitives that future feature modules (query composition, evidence exploration, verification audit trails, provider settings, and scheduled monitors) will build upon.

### Architectural Invariants:
1. **Presentation-Only Responsibility:** Shared UI primitives contain **zero** business logic, research orchestration, provider scraping, or direct database calls (`ADR-002`).
2. **Design-Token Governance:** All styling exclusively consumes canonical design tokens established in Step 11 (`src/app/globals.css`) via Vanilla CSS Modules (`ADR-001`). No Tailwind, external component library, or competing visual system is used.
3. **Strict Accessibility (WCAG 2.2 AA):** All primitives enforce native semantic HTML, visible keyboard focus rings (`outline: 2px solid var(--color-focus-ring)`), explicit ARIA labeling, and non-color-exclusive state communication.
4. **Motion Preference Compliance:** All animations and transitions (modal scale, backdrop fade, spinner rotation, tooltip reveal) respect system `prefers-reduced-motion: reduce` and the in-app `data-reduce-motion="true"` policy from Step 12.
5. **Zero Data Leakage:** Error states and alerts are designed to display sanitized user-facing messages only, with no raw exception stack traces or secrets (`Step 9` boundary).

---

## 2. Component Inventory & Directory Architecture

```text
src/components/ui/
├── button/
│   ├── Button.tsx               # Reusable native button with variants, sizes, and loading state
│   ├── Button.module.css        # Scoped styles consuming cyan/slate tokens
│   └── Button.test.tsx          # 6 unit tests (click, disabled, loading, submit)
├── card/
│   ├── Card.tsx                 # Composable container with Header, Title, Description, Content, Footer
│   ├── Card.module.css          # Surface, border, radius, and elevation tokens
│   └── Card.test.tsx            # 4 unit tests (composition, polymorphism, headings)
├── form/
│   ├── Input.tsx                # Native text input with size and validation state
│   ├── Input.module.css         # Focus rings, invalid state, disabled styling
│   ├── Textarea.tsx             # Native multiline input
│   ├── Textarea.module.css      # Vertical resizing, focus states
│   ├── Checkbox.tsx             # Real accessible native checkbox with styled overlay
│   ├── Checkbox.module.css      # Custom checkmark and focus indicator
│   ├── FormField.tsx            # Accessible wrapper coordinating label, description, and error alert
│   ├── FormField.module.css     # Vertical layout and error styling
│   └── form.test.tsx            # 8 unit tests (value change, invalid, checked, label association)
├── dialog/
│   ├── Dialog.tsx               # Accessible modal dialog with focus trap and Escape listener
│   ├── Dialog.module.css        # Centered layout, backdrop blur, scale transition
│   └── Dialog.test.tsx          # 8 unit tests (modal semantics, focus trap, escape, backdrop click)
├── tooltip/
│   ├── Tooltip.tsx              # Supplementary hover/focus tooltip with aria-describedby
│   ├── Tooltip.module.css       # Positions (top, bottom, left, right)
│   └── Tooltip.test.tsx         # 4 unit tests (hover delay, focus immediate, escape, aria-describedby)
├── badge/
│   ├── Badge.tsx                # Compact status and category pill
│   ├── Badge.module.css         # Neutral, brand, info, success, warning, danger variants
│   └── Badge.test.tsx           # 3 unit tests (variants, dot indicator)
├── alert/
│   ├── Alert.tsx                # Inline message banner with semantic SVG icons
│   ├── Alert.module.css         # Status colors, dismiss button
│   └── Alert.test.tsx           # 3 unit tests (role="alert", role="status", dismiss callback)
├── state/
│   ├── LoadingSpinner.tsx       # Accessible SVG loading indicator
│   ├── LoadingSpinner.module.css# Rotation animation with reduced-motion suppression
│   ├── EmptyState.tsx           # Clean empty view container with title, description, and action slot
│   ├── EmptyState.module.css    # Dashed container layout
│   ├── SafeErrorState.tsx       # Sanitized error display with retry action
│   ├── SafeErrorState.module.css# Red subtle surface styling
│   └── state.test.tsx           # 3 unit tests (spinner role="status", empty state, safe error retry)
└── index.ts                     # Central barrel export for all UI primitives
```

---

## 3. Public Component APIs & Specification

### 3.1 Button (`Button.tsx`)
A native `<button>` element supporting semantic variants and a non-shifting loading indicator.

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'; // default: 'primary'
  size?: 'sm' | 'md' | 'lg';                                          // default: 'md'
  isLoading?: boolean;                                                 // default: false
}
```

- **Variants:**
  - `primary`: Canonical cyan accent (`--palette-cyan-500`) with dark high-contrast text (`--palette-slate-950`).
  - `secondary`: Elevated slate surface (`--color-surface-elevated`) with border (`--color-border`).
  - `outline`: Transparent background with border, turning cyan on hover.
  - `ghost`: Minimalist action for toolbars and compact rows.
  - `danger`: Semantic red (`--palette-rose-500`) for destructive actions.
- **Accessibility:**
  - Default `type="button"` prevents accidental form submissions. Explicit `type="submit"` supported.
  - When `isLoading=true`: Sets `aria-busy="true"`, disables interaction, and renders a loading spinner while preserving the readable button text.

---

### 3.2 Card (`Card.tsx`)
A composable content container family using design-token surfaces and borders.

```tsx
<Card variant="default | elevated | subtle" as="div | article | section">
  <CardHeader>
    <CardTitle as="h2 | h3 | h4">Card Title</CardTitle>
    <CardDescription>Supporting description</CardDescription>
  </CardHeader>
  <CardContent>Primary content body</CardContent>
  <CardFooter>Action controls or metadata</CardFooter>
</Card>
```

- **Non-Interactive by Default:** Cards are structural containers. They never wrap arbitrary links in pseudo-clickable divs.
- **Polymorphism:** Supports semantic HTML5 elements (`<article>`, `<section>`).

---

### 3.3 Form Controls & FormField

#### `Input.tsx` & `Textarea.tsx`
Native text controls supporting controlled/uncontrolled state, sizes, and validation states.

```tsx
<Input
  id="query"
  sizeVariant="sm | md | lg"
  isInvalid={hasError}
  placeholder="Enter search phrase"
/>
```

- When `isInvalid=true`, automatically applies `aria-invalid="true"` and border token `--palette-rose-400`.

#### `Checkbox.tsx`
A real native `<input type="checkbox">` overlaying a custom high-contrast SVG checkbox.

```tsx
<Checkbox id="deep-scrape" label="Enable Deep Extraction" checked={checked} onChange={...} />
```

- Full keyboard support (activates via <kbd>Space</kbd> key) and visible focus ring.

#### `FormField.tsx`
Coordinates accessible labeling, descriptions, and error alerts:

```tsx
<FormField
  label="Target Domain"
  htmlFor="target-domain"
  required
  description="Specify a verified retailer hostname."
  error={domainError}
>
  <Input id="target-domain" isInvalid={Boolean(domainError)} />
</FormField>
```

- Renders explicit `<label htmlFor="...">`.
- If `required=true`, appends a visual asterisk with `aria-hidden="true"`.
- If `description` is present, renders a `<p id={`${htmlFor}-description`}>`.
- If `error` is present, renders a `<div id={`${htmlFor}-error`} role="alert" aria-live="polite">` with an error icon.

---

### 3.4 Dialog (`Dialog.tsx`)
A controlled modal dialog primitive adhering to W3C WAI-ARIA Dialog (Modal) pattern.

```tsx
<Dialog
  isOpen={isOpen}
  onClose={handleClose}
  title="Confirm Action"
  description="This will clear your local verification cache."
  size="sm | md | lg"
  triggerRef={triggerButtonRef}
  footer={<Button onClick={handleClose}>Close</Button>}
>
  Dialog Body Content
</Dialog>
```

- **Modal Isolation:** Sets `role="dialog"` and `aria-modal="true"`.
- **Labeling:** Automatically links `aria-labelledby` to title and `aria-describedby` to description.
- **Focus Management:**
  - Auto-focuses the close button upon opening.
  - Traps Tab / Shift+Tab keyboard focus within the dialog.
  - Automatically restores focus to `triggerRef` or previously active element when dismissed.
- **Dismissal Policy:**
  - Dismisses on <kbd>Escape</kbd> key.
  - Dismisses on clicking the dark backdrop (`rgba(0, 0, 0, 0.7)`). Clicks inside the dialog body do not close it.
- **Body Scroll Locking:** Automatically sets `document.body.style.overflow = 'hidden'` while open and restores cleanly on close or unmount.

---

### 3.5 Tooltip (`Tooltip.tsx`)
Supplementary, non-interactive hover and focus tooltip following W3C WAI-ARIA Tooltip guidelines.

```tsx
<Tooltip content="Deterministic verification score" position="top | bottom | left | right">
  <button type="button">Score Info</button>
</Tooltip>
```

- **Dual-Trigger:** Appears on pointer hover (after configurable `delayMs`, default 150ms) and **immediately** on keyboard focus.
- **Accessibility:** Associates with the trigger element via `aria-describedby`. Sets `role="tooltip"`.
- **Keyboard Dismissal:** Pressing <kbd>Escape</kbd> immediately dismisses the tooltip without losing trigger focus.
- **No Focus Trapping:** Tooltips remain purely informational; keyboard focus never moves into the tooltip.

---

### 3.6 Badge & Alert

#### `Badge.tsx`
```tsx
<Badge variant="neutral | brand | info | success | warning | danger" size="sm | md" dot>
  Verified
</Badge>
```

- Uses semantic token palettes. The optional `dot` prop renders an accessible status indicator dot.

#### `Alert.tsx`
```tsx
<Alert variant="info | success | warning | danger" title="Notice" onDismiss={handleDismiss}>
  Alert content message.
</Alert>
```

- **Non-Color-Exclusive:** Each variant displays a unique semantic SVG icon (check, triangle alert, circle exclamation, info circle).
- **Semantics:** Danger/warning variants use `role="alert"`; info/success variants use `role="status"`.

---

### 3.7 State Primitives (`LoadingSpinner`, `EmptyState`, `SafeErrorState`)

#### `LoadingSpinner.tsx`
An accessible rotating SVG spinner with visually-hidden text (`role="status"`). Respects reduced motion.

#### `EmptyState.tsx`
A structured container featuring an optional icon, title, description, and action button slot.

#### `SafeErrorState.tsx`
A safe error presentation primitive:
```tsx
<SafeErrorState
  title="Provider Disconnected"
  message="The search provider was temporarily unreachable. Please retry."
  onRetry={handleRetry}
  retryLabel="Retry Search"
/>
```
- Sets `role="alert"`. Composes with `Button` for the retry action. Never renders raw exception objects or stack traces.

---

## 4. Design-Token Mapping Matrix

| UI Component | Surface Token | Border Token | Typography Token | Motion Policy |
|---|---|---|---|---|
| **Button (Primary)** | `--palette-cyan-500` | `--palette-cyan-400` | `--font-sans`, `--font-weight-semibold` | 0.15s ease-in-out; disabled under reduced motion |
| **Button (Secondary)** | `--color-surface-elevated` | `--color-border` | `--font-sans`, `--font-weight-semibold` | 0.15s ease-in-out; disabled under reduced motion |
| **Card** | `--color-surface` | `--color-border` | `--font-sans`, `--font-size-md` | 0.15s transition on hover/elevation |
| **Input / Textarea** | `--color-surface` | `--color-border` | `--font-sans`, `--font-size-sm` | Focus ring: `--color-focus-ring` (2px) |
| **Checkbox** | `--color-surface` / `--palette-cyan-500` | `--color-border` | `--font-sans`, `--font-size-sm` | Visible checkmark with high-contrast text |
| **Dialog** | `--color-surface` | `--color-border` | `--font-sans`, `--font-size-xl` (title) | 0.2s cubic-bezier scale; 0s under reduced motion |
| **Tooltip** | `--palette-slate-900` | `--color-border` | `--font-sans`, `--font-size-xs` | 0.15s fade; 0s under reduced motion |
| **Badge** | Semantic sub-surfaces (`--color-*-subtle`) | Semantic borders (`--color-*-border`) | `--font-sans`, `--font-size-xs` | Static |
| **Alert** | Semantic sub-surfaces (`--color-*-subtle`) | Semantic borders (`--color-*-border`) | `--font-sans`, `--font-size-sm` | Static |
| **LoadingSpinner** | Transparent | `--color-accent-cyan-text` | N/A | 0.9s spin; static/dotted under reduced motion |
| **SafeErrorState** | `--color-danger-subtle` | `--color-danger-border` | `--font-sans`, `--font-size-md` (title) | Static |

---

## 5. Verification & Test Coverage

All components are accompanied by co-located unit tests in Vitest:

| Test Suite File | Component(s) Tested | Number of Tests | Status |
|---|---|---|---|
| `Button.test.tsx` | `Button` | 6 tests | **PASS** |
| `Card.test.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | 4 tests | **PASS** |
| `form.test.tsx` | `Input`, `Textarea`, `Checkbox`, `FormField` | 8 tests | **PASS** |
| `Dialog.test.tsx` | `Dialog` | 8 tests | **PASS** |
| `Tooltip.test.tsx` | `Tooltip` | 4 tests | **PASS** |
| `Badge.test.tsx` | `Badge` | 3 tests | **PASS** |
| `Alert.test.tsx` | `Alert` | 3 tests | **PASS** |
| `state.test.tsx` | `LoadingSpinner`, `EmptyState`, `SafeErrorState` | 3 tests | **PASS** |
| **Total New Tests** | **All UI Primitives** | **39 tests** | **PASS (100%)** |
