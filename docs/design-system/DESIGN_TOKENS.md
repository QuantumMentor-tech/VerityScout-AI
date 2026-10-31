# VerityScout AI — Design Tokens & Visual Foundations

**Document Identifier:** VS-DESIGN-TOKENS-v1.0  
**Status:** APPROVED DESIGN SYSTEM SPECIFICATION  
**Phase:** Phase 3 (Step 11 of 60)  
**Governed by:** [ADR-001: Frontend Architecture & TypeScript Unification Strategy](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-001-frontend-and-typescript.md)  
**Accessibility Baseline:** WCAG 2.2 Level AA ($\ge 4.5:1$ normal text, $\ge 3:1$ large text & UI component boundaries)  
**Source of Truth:** [`src/app/globals.css`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/app/globals.css)

---

## 1. Purpose & Visual Direction

VerityScout AI is a clean-room, evidence-first autonomous research and deterministic verification engine. The visual presentation must communicate:
- **Trust & Rigor:** Research evidence, extraction quotes, and verification criteria must be immediately legible with maximum typographic clarity.
- **Calm Focus:** A deep navy/slate dark palette that reduces eye strain during prolonged analysis, avoiding gratuitous glow or distracting high-saturation backgrounds.
- **Precision:** Deliberate spacing, clear surface hierarchies, and subtle structural boundaries that guide focus to research findings.
- **Accented Clarity:** Restrained cyan and violet brand accents used intentionally to denote links, focus rings, status badges, and emphasis without overpowering data content.

---

## 2. Canonical Token Architecture

The design token system is structured in two distinct layers:
1. **Primitive Tokens (`--palette-*`):** Raw color primitives defining base scales (Slate, Cyan, Violet, Emerald, Amber, Rose, Sky).
2. **Semantic Tokens (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`):** Purpose-driven tokens defining surface elevation, text hierarchies, brand accents, and spacing roles consumed by CSS Modules.

---

## 3. Color Token System

### 3.1 Background & Surface Hierarchy

| Semantic Token | Source Primitive | Hex Value | Purpose / Usage |
|---|---|---|---|
| `--color-background` | `--palette-slate-950` | `#090d16` | Root application viewport background |
| `--color-bg` | *alias* | `#090d16` | Backward compatibility alias for root background |
| `--color-surface` | `--palette-slate-850` | `#111827` | Primary card, modal container, and content card surface |
| `--color-surface-secondary` | `--palette-slate-900` | `#0f172a` | Secondary panels, sidebars, and sub-grouping containers |
| `--color-surface-elevated` | `--palette-slate-800` | `#1e293b` | Elevated cards, callouts, and status notice boxes |
| `--color-surface-hover` | `--palette-slate-750` | `#253349` | Interactive list items and button hover state |
| `--color-surface-subtle` | *transparency* | `rgba(255, 255, 255, 0.03)` | Subtle grid overlays and alternating table row striping |

### 3.2 Border & Divider Tokens

| Semantic Token | Source Primitive | Hex Value | Purpose / Usage |
|---|---|---|---|
| `--color-border` | `--palette-slate-700` | `#334155` | Default structural borders and card dividers |
| `--color-border-subtle` | *transparency* | `rgba(255, 255, 255, 0.08)` | Very subtle container separators |
| `--color-border-strong` | `--palette-slate-500` | `#64748b` | High-contrast component boundaries ($\ge 3:1$ non-text contrast) |
| `--color-border-focus` | `--palette-cyan-400` | `#22d3ee` | High-visibility focus indicators |

### 3.3 Text Hierarchy Tokens

| Semantic Token | Source Primitive | Hex Value | Contrast on Surface | Purpose / Usage |
|---|---|---|---|---|
| `--color-text-primary` | `--palette-slate-50` | `#f8fafc` | **16.96:1** | Page titles, primary card headings, primary body copy |
| `--color-text` | *alias* | `#f8fafc` | **16.96:1** | Backward compatibility alias for primary text |
| `--color-text-secondary` | `--palette-slate-300` | `#cbd5e1` | **11.95:1** | Secondary paragraphs, descriptive text, table cells |
| `--color-text-muted` | `--palette-slate-400` | `#94a3b8` | **6.92:1** | Footers, timestamps, metadata, supporting disclaimers |
| `--color-text-disabled` | `--palette-slate-600` | `#475569` | N/A (disabled) | Inactive or disabled form controls |
| `--color-text-inverse` | `--palette-slate-950` | `#090d16` | **18.57:1** | Text overlaid on light accent backgrounds |
| `--color-text-placeholder`| `--palette-slate-400` | `#94a3b8` | **6.92:1** | Input field placeholder labels |

### 3.4 Brand Accent & Focus Tokens

| Semantic Token | Source Primitive | Hex Value | Contrast on Surface | Purpose / Usage |
|---|---|---|---|---|
| `--color-accent-cyan` | `--palette-cyan-500` | `#06b6d4` | **8.00:1** (large) | Brand emblem highlight, display title gradient stop |
| `--color-accent-cyan-text` | `--palette-cyan-400` | `#22d3ee` | **9.82:1** (normal) | Accessible cyan body text, active state indicators |
| `--color-accent-cyan-subtle` | *transparency* | `rgba(6, 182, 212, 0.12)` | N/A | Emblem backdrops, active tab indicator fill |
| `--color-accent-cyan-border` | *transparency* | `rgba(6, 182, 212, 0.28)` | N/A | Brand emblem boundary, selected card border |
| `--color-accent-violet` | `--palette-violet-500` | `#8b5cf6` | **4.59:1** (large) | Brand gradient stop, secondary brand highlight |
| `--color-accent-violet-text` | `--palette-violet-400`| `#a78bfa` | **6.52:1** (normal) | Accessible violet body copy and tags |
| `--color-accent-violet-subtle`| *transparency* | `rgba(139, 92, 246, 0.12)`| N/A | AI-reasoning badge fill |
| `--color-accent-violet-border`| *transparency* | `rgba(139, 92, 246, 0.28)`| N/A | AI-reasoning badge border |
| `--color-link` | `--palette-cyan-400` | `#22d3ee` | **9.82:1** | Standard hyperlink text |
| `--color-link-hover` | `--palette-cyan-300` | `#67e8f9` | **13.08:1** | Hyperlink hover state |
| `--color-focus-ring` | `--palette-cyan-400` | `#22d3ee` | **9.82:1** | Visible `:focus-visible` keyboard indicator |

### 3.5 Semantic Status Feedback Tokens

| Semantic Token | Source Primitive | Hex Value | Contrast on Surface | Purpose / Usage |
|---|---|---|---|---|
| `--color-success` | `--palette-emerald-400` | `#34d399` | **9.23:1** | Verified constraints, exact matches, healthy status |
| `--color-success-subtle` | *transparency* | `rgba(16, 185, 129, 0.12)` | N/A | Status badge background fill |
| `--color-success-border` | *transparency* | `rgba(16, 185, 129, 0.3)` | N/A | Status badge boundary |
| `--color-warning` | `--palette-amber-400` | `#fbbf24` | **10.63:1** | Near matches, unverified assertions, budget warnings |
| `--color-warning-subtle` | *transparency* | `rgba(245, 158, 11, 0.12)` | N/A | Warning badge background fill |
| `--color-danger` | `--palette-rose-400` | `#f87171` | **6.41:1** | Violated constraints, failed runs, extraction errors |
| `--color-danger-subtle` | *transparency* | `rgba(239, 68, 68, 0.12)` | N/A | Error banner background fill |
| `--color-info` | `--palette-sky-400` | `#60a5fa` | **6.98:1** | Telemetry logs, informative notes, provider details |
| `--color-info-subtle` | *transparency* | `rgba(59, 130, 246, 0.12)` | N/A | Informational callout fill |

---

## 4. Typography System

### 4.1 Font Families

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
```

### 4.2 Font Scale & Weights

| Token | CSS Value | Equivalent Pixels | Target Usage |
|---|---|---|---|
| `--font-size-xs` | `0.75rem` | `12px` | Metadata, badges, section taglines, footers |
| `--font-size-sm` | `0.875rem` | `14px` | Form input labels, notice box text, status badges |
| `--font-size-md` | `1rem` | `16px` | Base body copy, default reading text |
| `--font-size-lg` | `1.125rem` | `18px` | Subtitles, lead paragraphs, card section headers |
| `--font-size-xl` | `1.25rem` | `20px` | Card headers, modal titles |
| `--font-size-2xl` | `1.5rem` | `24px` | Section titles, mobile page headings |
| `--font-size-3xl` | `2rem` | `32px` | Main display page titles (`<h1>`) |

**Font Weights:**
- `--font-weight-regular`: `400`
- `--font-weight-medium`: `500`
- `--font-weight-semibold`: `600`
- `--font-weight-bold`: `700`

**Line Heights:**
- `--line-height-none`: `1` (icons, compact labels)
- `--line-height-tight`: `1.25` (large headings)
- `--line-height-snug`: `1.375` (card titles)
- `--line-height-normal`: `1.5` (standard body copy)
- `--line-height-relaxed`: `1.625` (long reading notices)
- `--line-height-loose`: `2` (expanded legal notices)

**Letter Spacing:**
- `--letter-spacing-tight`: `-0.025em` (headings)
- `--letter-spacing-normal`: `0em` (body)
- `--letter-spacing-wide`: `0.025em` (uppercase metadata)
- `--letter-spacing-wider`: `0.05em` (status headings)

---

## 5. Spacing & Layout Tokens

### 5.1 Spacing Scale (4px / 0.25rem Baseline)

| Spacing Token | Rem Value | Pixel Value | Typical Application |
|---|---|---|---|
| `--space-0` | `0` | `0px` | Reset |
| `--space-1` | `0.25rem` | `4px` | Tight gaps, inline icon padding |
| `--space-2` | `0.5rem` | `8px` | Badge icon gaps, element margins |
| `--space-3` | `0.75rem` | `12px` | Badge horizontal padding, tight margins |
| `--space-4` | `1rem` | `16px` | Mobile container padding, card element separation |
| `--space-5` | `1.25rem` | `20px` | Notice box internal padding |
| `--space-6` | `1.5rem` | `24px` | Logo bottom margin, badge bottom margin |
| `--space-8` | `2rem` | `32px` | Section vertical margins, desktop main padding |
| `--space-10` | `2.5rem` | `40px` | Card internal desktop padding |
| `--space-12` | `3rem` | `48px` | Large container gutters |
| `--space-16` | `4rem` | `64px` | Hero section margins |
| `--space-20` | `5rem` | `80px` | Page section breaks |

### 5.2 Layout Dimensions

- `--layout-max-width`: `1200px` (Main application container limit)
- `--layout-card-max-width`: `640px` (Focused card & modal container limit)
- `--layout-gutter`: `var(--space-6)` (`24px` desktop gutter)
- `--layout-gutter-sm`: `var(--space-4)` (`16px` mobile gutter)

---

## 6. Radii, Borders, and Elevation Tokens

### 6.1 Corner Radii

- `--radius-none`: `0px`
- `--radius-xs`: `4px` (subtle tags, code blocks)
- `--radius-sm`: `6px` (form inputs, small badges)
- `--radius-md`: `12px` (notice boxes, nested cards)
- `--radius-lg`: `16px` (primary application cards)
- `--radius-xl`: `24px` (feature hero containers)
- `--radius-full`: `9999px` (pill badges, circular emblems)

### 6.2 Elevation Shadows

- `--shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.4)`
- `--shadow-md`: `0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)`
- `--shadow-lg`: `0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4)`
- `--shadow-card`: `0 10px 30px -10px rgba(0, 0, 0, 0.5)`

---

## 7. WCAG 2.2 AA Contrast Verification Matrix

All color pairings have been calculated and mathematically verified using standard WCAG relative luminance formulas:

| Foreground Token / Usage | Background Token / Surface | Foreground Hex | Background Hex | Contrast Ratio | Minimum Req. | Audit Result |
|---|---|---|---|---|---|---|
| Primary Text | Background | `#f8fafc` | `#090d16` | **18.57:1** | $\ge 4.5:1$ | **PASS** |
| Primary Text | Primary Surface | `#f8fafc` | `#111827` | **16.96:1** | $\ge 4.5:1$ | **PASS** |
| Primary Text | Elevated Surface | `#f8fafc` | `#1e293b` | **13.98:1** | $\ge 4.5:1$ | **PASS** |
| Secondary Text | Background | `#cbd5e1` | `#090d16` | **13.09:1** | $\ge 4.5:1$ | **PASS** |
| Secondary Text | Primary Surface | `#cbd5e1` | `#111827` | **11.95:1** | $\ge 4.5:1$ | **PASS** |
| Secondary Text | Elevated Surface | `#cbd5e1` | `#1e293b` | **9.85:1** | $\ge 4.5:1$ | **PASS** |
| Muted Text | Background | `#94a3b8` | `#090d16` | **7.58:1** | $\ge 4.5:1$ | **PASS** |
| Muted Text | Primary Surface | `#94a3b8` | `#111827` | **6.92:1** | $\ge 4.5:1$ | **PASS** |
| Muted Text | Elevated Surface | `#94a3b8` | `#1e293b` | **5.71:1** | $\ge 4.5:1$ | **PASS** |
| Link Cyan Text | Background | `#22d3ee` | `#090d16` | **10.75:1** | $\ge 4.5:1$ | **PASS** |
| Link Cyan Text | Primary Surface | `#22d3ee` | `#111827` | **9.82:1** | $\ge 4.5:1$ | **PASS** |
| Link Cyan Text | Elevated Surface | `#22d3ee` | `#1e293b` | **8.09:1** | $\ge 4.5:1$ | **PASS** |
| Violet Text | Background | `#a78bfa` | `#090d16` | **7.14:1** | $\ge 4.5:1$ | **PASS** |
| Violet Text | Primary Surface | `#a78bfa` | `#111827` | **6.52:1** | $\ge 4.5:1$ | **PASS** |
| Violet Text | Elevated Surface | `#a78bfa` | `#1e293b` | **5.38:1** | $\ge 4.5:1$ | **PASS** |
| Success Text | Primary Surface | `#34d399` | `#111827` | **9.23:1** | $\ge 4.5:1$ | **PASS** |
| Warning Text | Primary Surface | `#fbbf24` | `#111827` | **10.63:1** | $\ge 4.5:1$ | **PASS** |
| Danger Text | Primary Surface | `#f87171` | `#111827` | **6.41:1** | $\ge 4.5:1$ | **PASS** |
| Info Text | Primary Surface | `#60a5fa` | `#111827` | **6.98:1** | $\ge 4.5:1$ | **PASS** |
| Cyan Title (Large) | Background | `#06b6d4` | `#090d16` | **8.00:1** | $\ge 3.0:1$ | **PASS** |
| Violet Title (Large)| Background | `#8b5cf6` | `#090d16` | **4.59:1** | $\ge 3.0:1$ | **PASS** |
| Focus Ring | Background | `#22d3ee` | `#090d16` | **10.75:1** | $\ge 3.0:1$ | **PASS** |
| Focus Ring | Primary Surface | `#22d3ee` | `#111827` | **9.82:1** | $\ge 3.0:1$ | **PASS** |
| Strong Border | Primary Surface | `#64748b` | `#111827` | **3.73:1** | $\ge 3.0:1$ | **PASS** |

---

## 8. CSS Module Consumption Rules

To prevent token drift and maintain strict architectural boundaries ([ADR-001](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-001-frontend-and-typescript.md)), developers must follow these consumption rules:

1. **Consume Semantic Tokens, Not Primitives:**
   Components should reference `var(--color-surface)` or `var(--color-text-secondary)`, never `var(--palette-slate-850)` directly.
2. **Standard Spacing Scale:**
   All padding, margins, and flex/grid gaps must use `var(--space-*)` variables. Ad-hoc arbitrary pixel values are prohibited.
3. **Typography Inheritance:**
   Font sizes must use `var(--font-size-*)` and line heights must use `var(--line-height-*)`.
4. **Interactive Focus Standards:**
   Interactive controls must utilize `outline: var(--border-width-md) solid var(--color-focus-ring)` with `outline-offset: 2px` on `:focus-visible`.
5. **No Tailwind / Utility Class Bleed:**
   All styling remains scoped to `.module.css` files. Utility frameworks remain excluded per [ADR-001](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-001-frontend-and-typescript.md).

---

## 9. Implementation Status & Roadmap Boundaries

- **Implemented in Step 11:** Centralized design tokens, semantic dark color palette, typography scale, spacing scale, layout sizing tokens, radii, shadows, and WCAG 2.2 AA contrast matrix.
- **Explicitly Deferred to Step 12:**
  - Dynamic animated cyan-to-violet transition.
  - User-facing interactive reduced-motion preference toggle.
  - Component-level motion timings and keyframe animations.
- **Deferred to Phase 7 (Steps 43–48):**
  - Full research application shell, query composer, evidence drawer, candidate result cards, and sidebar navigation.
