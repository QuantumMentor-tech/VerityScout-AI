# Shared Presentation Components (`src/components/`)

**Module Layer:** Layer 1 — Presentation (Shared)  
**Established in:** Step 10 of 60 (Phase 2: Project Setup and Toolchain)  

---

## 1. Responsibility & Purpose

The `src/components/` directory is reserved for reusable, presentation-focused UI components that can be used across multiple features or route pages.

Examples of future shared components:
- **Navigation & Layout:** Top navigation bar, footer, container wrappers.
- **Controls & Form Elements:** Button, TextInput, Select, Checkbox, Toggle.
- **Data Display:** Badge, Tag, Tooltip, Modal, Card, Accordion.
- **Feedback & States:** LoadingSkeleton, Spinner, StatusIndicator, EmptyState.

---

## 2. Component Design & Architectural Invariants

1. **Presentation-Only Responsibility:**
   Components in this directory must **never** contain business logic, database queries, provider API calls, or research workflow orchestration.
2. **Component-Scoped Styling:**
   All styling must be authored using **Vanilla CSS Modules** (e.g. `Button.module.css`). Global styles are restricted to `globals.css`. Tailwind CSS is strictly excluded (`ADR-001`).
3. **Strict TypeScript & React Standards:**
   - Explicit `interface Props` for every component.
   - Props must be serializable and strongly typed.
   - No `any` or broad type assertions (`ENG-POL-001`).
4. **Accessibility First (WCAG 2.1 AA):**
   - Use semantic HTML5 elements (`<button>`, `<dialog>`, `<nav>`, `<aside>`).
   - Accessible roles, labels, and aria attributes where appropriate.
   - Full keyboard navigation and visible focus rings (`:focus-visible`).
   - Compliance with `prefers-reduced-motion`.
5. **No Direct Server Module Imports:**
   Components here must never import server-only utilities (`src/lib/config/server-env.ts`, `src/lib/logging/logger.ts`, or future `src/server/*`).

---

## 3. Directory & File Naming Conventions

```text
src/components/
├── Button/
│   ├── Button.tsx
│   ├── Button.module.css
│   └── Button.test.tsx
└── README.md
```

- Component identifiers: `PascalCase` (e.g., `Button.tsx`).
- Stylesheet: `[ComponentName].module.css`.
- Co-located unit test: `[ComponentName].test.tsx`.
