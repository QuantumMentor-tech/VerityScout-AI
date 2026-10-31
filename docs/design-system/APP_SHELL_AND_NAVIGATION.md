# VerityScout AI — Responsive Application Shell & Navigation

**Phase:** Phase 3 — Core Application Shell and Design Foundations  
**Step:** Step 13 of 60  
**Status:** Implemented & Verified  
**Governed by:** ADR-001 (Vanilla CSS Modules & Custom Properties), WCAG 2.2 AA Contrast & Interaction Policy  

---

## 1. Executive Summary & Purpose

The **VerityScout AI Application Shell** establishes the unified, responsive, and accessible structural framework for the platform. It provides a standardized top header, persistent desktop sidebar, accessible mobile navigation drawer, and an adaptive central content region.

The shell delivers a clean, professional AI research workspace experience designed to support upcoming complex workflows (query composition, source-linked evidence exploration, verification history, and scheduling) without introducing speculative controls, dead links, or premature feature placeholders.

---

## 2. Component Architecture & File Inventory

All shell components are co-located under `src/components/shell/` and `src/components/navigation/`:

| Component / File | File Path | Responsibilities | Render Boundary |
|---|---|---|---|
| `navigation-config.ts` | [`src/components/navigation/navigation-config.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/navigation/navigation-config.ts) | Canonical typed navigation definitions, group hierarchies, route validity flags, and descriptions. | Data / Configuration |
| `AppShell.tsx` | [`src/components/shell/AppShell.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/AppShell.tsx) | Root application shell coordinating header, desktop sidebar, mobile drawer state, skip link, and main content slot. | Client Component (`'use client'`) |
| `AppShell.module.css` | [`src/components/shell/AppShell.module.css`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/AppShell.module.css) | Flexbox shell container, skip-link positioning, and responsive breakpoint adjustments. | CSS Module |
| `AppHeader.tsx` | [`src/components/shell/AppHeader.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/AppHeader.tsx) | Sticky top application bar, brand emblem link to `/`, engine status pill, and accessible mobile menu toggle. | Client Component (`'use client'`) |
| `AppHeader.module.css` | [`src/components/shell/AppHeader.module.css`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/AppHeader.module.css) | Sticky header layout (60px height), button sizing (44x44px target), and responsive toggle visibility. | CSS Module |
| `AppSidebar.tsx` | [`src/components/shell/AppSidebar.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/AppSidebar.tsx) | Persistent desktop sidebar (`<aside>`), housing navigation groups and versioning metadata. | Server / Presentation Component |
| `AppSidebar.module.css` | [`src/components/shell/AppSidebar.module.css`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/AppSidebar.module.css) | Fixed width (260px), sticky positioning (`calc(100vh - 60px)`), and `@media (max-width: 1023px) { display: none; }`. | CSS Module |
| `NavigationLinks.tsx` | [`src/components/shell/NavigationLinks.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/NavigationLinks.tsx) | Route-aware `<nav aria-label="Main Navigation">`, active pathname detection via `usePathname()`, and disabled item rendering. | Client Component (`'use client'`) |
| `NavigationLinks.module.css` | [`src/components/shell/NavigationLinks.module.css`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/NavigationLinks.module.css) | Navigation item states (default, hover, active cyan accent with left border, disabled non-interactive styling). | CSS Module |
| `MobileNavDrawer.tsx` | [`src/components/shell/MobileNavDrawer.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/MobileNavDrawer.tsx) | Responsive modal drawer with backdrop, focus trap, Escape key handling, and body scroll lock. | Client Component (`'use client'`) |
| `MobileNavDrawer.module.css` | [`src/components/shell/MobileNavDrawer.module.css`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/shell/MobileNavDrawer.module.css) | Slide-in transform transitions, backdrop blur, and reduced-motion suppression. | CSS Module |
| `layout.tsx` | [`src/app/layout.tsx`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/app/layout.tsx) | Server-rendered root layout embedding `{children}` into `<AppShell>`. | Server Component |

---

## 3. Server vs. Client Component Boundaries

To adhere to Next.js App Router performance best practices:
1. **Root Layout (`src/app/layout.tsx`) remains a Server Component**: Exports static metadata (`Metadata`) and renders the core `<html>` and `<body>` tags.
2. **`AppShell` Client Slot Pattern**: `AppShell` receives `children` as a slot. The page content itself remains server-rendered.
3. **Narrow Client Components**: Pathname awareness (`usePathname()`) and mobile drawer toggling (`useState`, keyboard listeners) are strictly contained inside presentation components without polluting the application root or server modules.

---

## 4. Route Inventory & Navigation Governance

### 4.1 Implemented vs. Planned Routes

The repository route inventory authorizes exactly one active route at Step 13:

| Route Destination | Status | Render Behavior | Screen Reader Exposure |
|---|---|---|---|
| `/` (Overview / Home) | **Implemented** | Next.js `<Link href="/">` | Interactive link with `aria-current="page"` when active |
| `/research` (Research Query) | **Planned (Step 15+)** | Semantic `<div>` with `Planned` badge | `aria-disabled="true"`, not focusable or clickable |
| `/evidence` (Evidence Explorer) | **Planned (Step 23+)** | Semantic `<div>` with `Planned` badge | `aria-disabled="true"`, not focusable or clickable |
| `/history` (Run History) | **Planned (Step 35+)** | Semantic `<div>` with `Planned` badge | `aria-disabled="true"`, not focusable or clickable |
| `/settings` (Provider Settings) | **Planned (Step 46+)** | Semantic `<div>` with `Planned` badge | `aria-disabled="true"`, not focusable or clickable |
| `/schedules` (Scheduled Monitors) | **Planned (Step 50+)** | Semantic `<div>` with `Planned` badge | `aria-disabled="true"`, not focusable or clickable |

### 4.2 Invariant: Zero Dead Links

- No `href="#"` or unmapped anchors are permitted.
- No dummy route redirects or mock endpoints were introduced.
- Unimplemented items explicitly display an accessible text badge (`Planned`), preventing user confusion while maintaining visibility of the future platform roadmap.

---

## 5. Responsive Breakpoint & Viewport Behavior

### 5.1 Selected Breakpoint: `1024px`

- **Desktop ($\ge 1024\text{px}$):**
  - Persistent sidebar (`width: 260px`) is fixed on the left.
  - Header mobile toggle button is hidden via CSS (`display: none`).
  - Central content region fills remaining width (`flex: 1; min-width: 0`).
- **Tablet & Mobile ($< 1024\text{px}$):**
  - Persistent sidebar is hidden via CSS (`display: none`).
  - Header displays a 44x44px touch target toggle button.
  - Toggling displays the slide-in drawer (`width: 280px; max-width: 85vw`) with a backdrop (`rgba(0, 0, 0, 0.65)`).

---

## 6. Accessibility & Keyboard Interaction (WCAG 2.2 AA)

1. **Landmarks & Structure:**
   - Skip to main content link: `<a href="#main-content">` jumps directly past navigation.
   - Header landmark: `<header>` with brand link and engine status.
   - Navigation landmark: `<nav aria-label="Main Navigation">` with structured `<ul>` / `<li>` lists.
   - Main content landmark: `<main>` (rendered by current and future page views inside `<div id="main-content">`).
2. **Accessible Names & Controls:**
   - Mobile toggle: `aria-expanded="true|false"`, `aria-controls="mobile-navigation-drawer"`, dynamic `aria-label="Open navigation menu" / "Close navigation menu"`.
   - Drawer close button: `aria-label="Close navigation drawer"`.
   - Decorative icons: marked with `aria-hidden="true"` and `focusable="false"`.
3. **Modal Focus Management & Keyboard Dismissal:**
   - When opened, focus shifts automatically to the close button inside the drawer.
   - Tab key focus trap ensures keyboard navigation stays within the modal while open.
   - Pressing <kbd>Escape</kbd> immediately dismisses the drawer.
   - On dismissal, focus is returned to the header toggle button (`triggerRef`).
   - Document body scroll is locked (`overflow: hidden`) during drawer display and restored upon closure.

---

## 7. Design Tokens & Motion Integration

1. **Design Tokens (Step 11):**
   - Header & Sidebar Backgrounds: `var(--color-surface-secondary)` (`#0f172a`).
   - Structural Borders: `var(--color-border-subtle)` (`rgba(255, 255, 255, 0.08)`) and `var(--color-border)` (`#334155`).
   - Active Navigation: `var(--color-accent-cyan-subtle)` background with `3px solid var(--color-accent-cyan)` left accent and `var(--color-accent-cyan-text)` typography.
   - Interactive Touch Targets: All clickable targets satisfy $\ge 40\text{px}$ (links) and $\ge 44\text{px}$ (mobile buttons).
2. **Motion Preference Policy (Step 12):**
   - Slide-in transition (`0.25s ease-in-out`) applies only under normal motion.
   - When OS `prefers-reduced-motion: reduce` is active OR user toggles `data-reduce-motion="true"`, all drawer transforms and backdrop opacity transitions are immediately set to `0s` / `none !important`.

---

## 8. Verification & Test Coverage

### 8.1 Automated Test Suites

- **Unit / Component Tests (`src/components/shell/AppShell.test.tsx`):**
  - Renders landmarks (skip link, header, navigation, content area).
  - Brand identity link rendering.
  - Active route highlighting (`aria-current="page"`).
  - Planned items rendered with non-link semantics and badges.
  - Mobile toggle state transitions (`aria-expanded`).
  - Escape key dismissal.
  - Backdrop click dismissal.
  - Document scroll lock and restoration.
- **End-to-End Tests (`tests/e2e/shell.spec.ts`):**
  - `SHELL-E2E-001`: Application shell rendering.
  - `SHELL-E2E-002`: Existing route preservation.
  - `SHELL-E2E-003`: Desktop navigation.
  - `SHELL-E2E-004`: Mobile navigation opening and closing.
  - `SHELL-E2E-005`: Keyboard dismissal via Escape key.
  - `SHELL-E2E-006`: Current-page semantics.
  - `SHELL-E2E-007`: Responsive layout across 375px, 430px, 768px, 1024px, 1440px.
  - `SHELL-E2E-008`: Motion compatibility with reduced motion.

---

## 9. Future Route Onboarding Guide

When subsequent roadmap steps implement new pages (e.g., Step 15 Page Shells):
1. Create the page under `src/app/<route-segment>/page.tsx`.
2. Update [`src/components/navigation/navigation-config.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/components/navigation/navigation-config.ts):
   - Set `isImplemented: true`.
   - Set `href: '/<route-segment>'`.
   - Remove or update `badge`.
3. The shell will automatically render the destination as a functional Next.js `<Link>` with active route detection and keyboard focus support.
