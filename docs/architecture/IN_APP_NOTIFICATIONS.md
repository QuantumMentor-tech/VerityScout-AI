# VerityScout AI — In-App Alerts and Research Change Notifications Architecture

**Document Identifier:** VS-ARCH-NOTIFICATIONS-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 10 (Step 50 of 60)  
**Author:** Senior Full-Stack Engineer, Senior Backend Architect, Senior Application Security Engineer  
**Traceability:** Mapped to [MVP_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/requirements/MVP_REQUIREMENTS.md) (UR-016, UR-017, AC-016, AC-017), [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md) (SEC-008, SEC-010, SEC-021), and [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md).

---

## 1. Executive Summary and Scope

Step 50 implements a persistent, idempotent, evidence-grounded in-app alert and notification system for VerityScout AI. It enables users to discover, review, and act upon important verified changes identified across recurring research schedules and historical comparisons without manufacturing false claims or altering source evidence.

### Strict Scope Boundary
- **In-App Notifications Only:** This implementation is strictly bounded to the in-app notification center, database-persisted notifications, and authenticated REST APIs.
- **Explicit Exclusions:** No email, SMS, mobile push, browser push, Slack, Discord, webhooks, or third-party messaging integrations have been implemented. External channels require separate approval in a later roadmap step.

---

## 2. Core Architecture and Event Lifecycle

The lifecycle follows a persistent, event-driven flow from research execution to UI display:

```
+------------------------------------+
|  Completed Eligible Research Run   |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|    Step 48 Comparison Session      |
|     (ResearchComparisonRow)        |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|  Alert Eligibility Evaluation      |
|      (evaluateComparisonAlerts)    |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|   Idempotent Notification Creation |
|      (UNIQUE idempotency_key)      |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|    Authorized Notification API     |
|   (/api/notifications endpoints)   |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|    Frontend Notification Center    |
|   (NotificationBell + Popover)     |
+------------------------------------+
```

---

## 3. Change-Classification and Alert Eligibility Policy

Alert generation is governed by epistemic honesty principles and strict uncertainty protection (Section 6):

### 3.1 Eligible Alert Types (Confirmed Changes)
- **`PRICE_DROP` (`NotificationType.PRICE_DROP`):** Verified price reduction. If the associated research schedule defines `change_notification_threshold_pct` (e.g. 2%), price changes below this threshold are suppressed as minor fluctuations.
- **`PRICE_INCREASE` (`NotificationType.PRICE_INCREASE`):** Verified price increase meeting materiality thresholds.
- **`STOCK_STATUS_CHANGED` (`NotificationType.STOCK_STATUS_CHANGED`):** Verified stock transition (e.g. `OUT_OF_STOCK` to `IN_STOCK`).
- **`SPECIFICATION_UPDATED` (`NotificationType.SPECIFICATION_UPDATED`):** Verified update to technical attributes (RAM, storage, warranty, display).
- **`NEW_OFFER_DISCOVERED` (`NotificationType.NEW_OFFER_DISCOVERED`):** Verified addition of a new retailer or marketplace offer.

### 3.2 Specially Labeled States (Uncertainty Protection)
- **`NEWLY_OBSERVED` (`NotificationType.NEW_CANDIDATE_OBSERVED`):** Explicitly labeled as a search observation from latest sources; never claimed as a confirmed real-world product launch or creation.
- **`NO_LONGER_OBSERVED` (`NotificationType.ATTRIBUTE_NO_LONGER_OBSERVED`):** Explicitly labeled as not observed in latest search; never claimed as proof of real-world deletion or discontinuation.
- **`CONFLICTING` (`NotificationType.CONFLICTING_EVIDENCE_OBSERVED`):** Explicitly labeled as multi-source evidence disagreement without selecting a false winner.

### 3.3 Suppressed States (Zero Alerts Generated)
- **`UNCHANGED`, `NOT_COMPARABLE`, `UNKNOWN`:** Suppressed to prevent alert noise.
- **`FIRST_RUN_BASELINE_ESTABLISHED` (`ComparisonStatus.FIRST_RUN_BASELINE`):** Suppressed to prevent noise when establishing the initial baseline.
- **`INELIGIBLE_SCOPE` (`ComparisonStatus.INELIGIBLE_SCOPE`):** Suppressed when query scope or schedule revision has materially shifted.
- **Failed, cancelled, or aborted runs:** Suppressed.

---

## 4. Persistent Notification Data Model

The schema is defined in migration `0011_in_app_notifications.sql`:

```sql
CREATE TABLE in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(64) NOT NULL,
    source_event_type VARCHAR(64) NOT NULL DEFAULT 'CHANGE_EVENT',
    source_event_id UUID NULL,
    task_id UUID NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,
    research_run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    schedule_id UUID NULL REFERENCES research_schedules(id) ON DELETE SET NULL,
    comparison_id UUID NOT NULL REFERENCES research_comparisons(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(191) NOT NULL,
    read_at TIMESTAMPTZ NULL,
    dismissed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_in_app_notifications_idempotency UNIQUE (idempotency_key)
);
```

### 4.1 Indexing & Performance
- `idx_in_app_notifications_user_unread`: Partial index on `(user_id, read_at) WHERE read_at IS NULL AND dismissed_at IS NULL` for sub-millisecond unread count calculations.
- `idx_in_app_notifications_user_created`: B-Tree index on `(user_id, created_at DESC)` for chronological listing.
- `idx_in_app_notifications_comparison`: Foreign key index linking to parent comparison session.
- `idx_in_app_notifications_run`: Foreign key index linking to triggering research run.

### 4.2 Idempotency and Race Safety
- **Idempotency Key:** `notif:${userId}:${comparisonId}:${logicalEventKey}`
- Uniqueness is enforced at the database level (`CONSTRAINT uq_in_app_notifications_idempotency UNIQUE (idempotency_key)`).
- Replays, worker restarts, or duplicate dispatch attempts execute with `ON CONFLICT (idempotency_key) DO NOTHING`, guaranteeing zero duplicate alerts.

---

## 5. REST API Specifications

All endpoints require session authentication (`requireAuthenticatedCaller`) and enforce Row-Level Security:

1. **`GET /api/notifications`:**
   - Query Parameters: `page` (int, default 1), `limit` (int, default 20, max 100), `unreadOnly` (bool), `includeDismissed` (bool).
   - Response: `{ success: true, data: { data: InAppNotificationDto[], pagination: { page, limit, total, totalPages } } }`
2. **`GET /api/notifications/unread-count`:**
   - Response: `{ success: true, data: { unreadCount: number } }`
3. **`PATCH /api/notifications/[id]/read`:**
   - Marks single notification as read (`read_at = NOW()`), verifying owner isolation.
   - Response: `{ success: true, data: InAppNotificationDto }`
4. **`POST /api/notifications/read-all`:**
   - Marks all unread, non-dismissed notifications for the caller as read.
   - Response: `{ success: true, data: { updatedCount: number } }`
5. **`PATCH /api/notifications/[id]/dismiss`:**
   - Sets `dismissed_at = NOW()` without deleting the record or altering underlying research evidence.
   - Response: `{ success: true, data: InAppNotificationDto }`

---

## 6. Frontend Notification Center

- **`NotificationBell`:**
  - Located in the application header next to `AuthStatusIndicator`.
  - Accessible button with dynamic unread count pill badge (`aria-haspopup="dialog"`, `aria-expanded`).
  - Configurable polling (default 30s) that cleanly unmounts with `clearInterval`.
- **`NotificationCenter`:**
  - Popover dialog with filter tabs: "All" and "Unread".
  - "Mark all as read" button.
  - "Load more" bounded pagination.
  - Deep-linking directly to `/research/runs/[runId]` and `/history`.
  - Accessible keyboard navigation (Escape to close, click outside to dismiss).
- **`NotificationItem`:**
  - Distinct color-coded category badges (Price Drop: green, Price Increase: amber, Stock Change: blue, Spec Update: purple, Observation: indigo, Conflict: orange).
  - Unread indicator dot.
  - Actions: "Mark Read", "Dismiss", and "View Run →".

