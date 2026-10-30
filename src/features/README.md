# Product Feature Modules (`src/features/`)

**Module Layer:** Layer 1 — Presentation & Client Feature Orchestration  
**Established in:** Step 10 of 60 (Phase 2: Project Setup and Toolchain)  

---

## 1. Responsibility & Feature Boundaries

The `src/features/` directory contains vertical, domain-cohesive UI feature packages. Each feature module encapsulates its own components, client hooks, state management, and view models.

Planned future feature packages (to be implemented in subsequent phases):
- **`research/` (Phase 7):** Query input bar, constraint selector, budget filters, progress telemetry display.
- **`evidence/` (Phase 7):** Side-by-side evidence card, source quote drawer, URL snapshot viewer, provenance badge.
- **`candidates/` (Phase 7):** Accurate-match grid, near-match breakdown, constraint comparison table.
- **`history/` (Phase 7):** Past research runs, run comparison, JSON/CSV export actions.
- **`settings/` (Phase 5 & 8):** Model routing preferences, provider API key management, cost budget caps.

---

## 2. Feature Encapsulation Rules

1. **High Cohesion, Low Coupling:**
   A feature module owns everything specific to that feature:
   ```text
   src/features/research/
   ├── components/       # Feature-specific presentation components
   ├── hooks/            # Custom React hooks (e.g. useResearchRun.ts)
   ├── types/            # View-model interfaces and state types
   └── index.ts          # Explicit public exports only
   ```
2. **Cross-Feature Imports:**
   - Features must **never** import private internal submodules of other features (e.g. `import { InternalItem } from '@/features/evidence/components/InternalItem'`).
   - If a component or helper is genuinely shared across multiple features, it must be promoted to `src/components/` or `src/lib/`.
3. **Client/Server Separation:**
   - Features are client-facing or hybrid presentation modules.
   - They must communicate with the backend via API endpoints (`/api/v1/...`) or typed server actions.
   - Features must **never** import server database clients, redis connections, or private provider secrets.
4. **No Barrel Cycles:**
   Barrel `index.ts` files must only re-export the public API of the feature. Circular dependencies between features are strictly forbidden.
