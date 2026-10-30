# Server-Side Application Boundary (`src/server/`)

**Module Layer:** Layers 3–8 (Domain, Verification Engine, Adapters, Persistence, Security)  
**Established in:** Step 10 of 60 (Phase 2: Project Setup and Toolchain)  

---

## 1. Responsibility & Server Boundary

The `src/server/` directory contains all privileged server-side application logic, domain business rules, provider adapters, persistence interfaces, and worker integration contracts.

Modules inside `src/server/` are strictly **server-only**. They must never be imported into any Client Component (`'use client'`) or bundled for browser consumption.

---

## 2. Planned Subsystems & Layer Structure

When implemented across subsequent phases, `src/server/` will be structured into the following decoupled sublayers:

```text
src/server/
├── domain/            # Layer 3: Pure domain models, state machines, business invariants
├── verification/      # Layer 4: Deterministic constraint checker, price & spec auditor
├── providers/         # Layer 5: Adapter implementations (Tavily, Exa, OpenAI, NIM)
│   ├── search/
│   ├── extraction/
│   └── llm/
├── worker/            # Layer 6: BullMQ job processors, dispatchers, queue contracts
├── persistence/       # Layer 7: PostgreSQL repositories, Supabase client, RLS policies
└── security/          # Layer 8: Cryptographic key manager, SSRF guard, rate limiter
```

---

## 3. Downward-Only Dependency Flow

Dependencies between server layers must follow a strict downward hierarchy:

```text
[API Ingress / App Router Routes] (src/app/api/v1/)
       │
       ▼
[Domain & Application Services] (src/server/domain/)
       │
       ├─────────────────────────┐
       ▼                         ▼
[Verification Engine]    [Provider Adapters]
(src/server/verification/) (src/server/providers/)
       │                         │
       └───────────┬─────────────┘
                   ▼
       [Persistence & Worker Queue]
       (src/server/persistence/ & src/server/worker/)
```

### Invariant Rules:
1. **Domain Isolation:** Pure domain rules in `src/server/domain/` must have zero external dependencies on Next.js, HTTP, databases, or third-party APIs.
2. **Provider Adapter Inversion:** Adapters in `src/server/providers/` must implement contract interfaces (`ISearchProvider`, `IExtractionProvider`, `ILLMProvider`) defined in `docs/architecture/PROVIDER_ADAPTER_CONTRACTS.md`.
3. **Database Isolation:** Database queries, Supabase clients, and SQL queries exist solely within `src/server/persistence/`. Business logic never issues raw SQL.
4. **Persistent Worker Boundary:** The future background worker process shares domain and provider code with the Next.js web application via `src/server/`, decoupled via Redis BullMQ queues (`ADR-010`).
