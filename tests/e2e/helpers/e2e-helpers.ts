import { Page, Route } from '@playwright/test';
import {
  MOCK_E2E_RESEARCH_RUN,
  MOCK_E2E_SCHEDULES,
  MOCK_E2E_OCCURRENCES,
  MOCK_E2E_NOTIFICATIONS,
  MOCK_E2E_PROVIDERS,
  E2EResearchRun,
  E2ESchedule,
  E2ENotification,
  E2EProviderSettings,
} from '../fixtures/mock-data';

export interface E2EHistoryRun {
  runId: string;
  taskId: string;
  taskTitle: string;
  query: string;
  taskType: string;
  status: string;
  queriesExecuted?: number;
  sourcesDiscovered?: number;
  sourcesExtracted?: number;
  claimsVerified?: number;
  candidateCount: number;
  durationMs?: number;
  totalCostUsd?: string | number | null;
  startedAt?: string;
  createdAt: string;
  completedAt?: string | null;
}

/**
 * Route interception helper for Research workflow APIs.
 */
export async function mockResearchApis(
  page: Page,
  options?: {
    run?: E2EResearchRun;
    submitStatus?: number;
    submitError?: string;
  }
): Promise<void> {
  const currentRun = options?.run ?? { ...MOCK_E2E_RESEARCH_RUN };

  await page.route(/\/api\/research\/runs$/, async (route: Route) => {
    if (route.request().method() === 'POST') {
      if (options?.submitStatus && options.submitStatus >= 400) {
        await route.fulfill({
          status: options.submitStatus,
          contentType: 'application/json',
          body: JSON.stringify({
            error: options.submitError ?? 'Simulated research submission failure',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          runId: currentRun.id,
          status: 'QUEUED',
          message: 'Research task accepted and enqueued',
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(new RegExp(`/api/research/runs/${currentRun.id}/progress`), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        runId: currentRun.id,
        status: currentRun.status,
        currentStage: currentRun.currentStage,
        progressPercent: currentRun.progressPercent,
        events: currentRun.events,
      }),
    });
  });

  await page.route(new RegExp(`/api/research/runs/${currentRun.id}/cancel`), async (route: Route) => {
    currentRun.status = 'CANCELLED';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        status: 'CANCELLED',
        message: 'Research run cancelled per user request',
      }),
    });
  });
}

/**
 * Route interception helper for History and Export APIs.
 */
export async function mockHistoryAndExportApis(
  page: Page,
  options?: {
    runs?: E2EHistoryRun[];
    simulateExportError?: boolean;
  }
): Promise<void> {
  const historyRuns: E2EHistoryRun[] = options?.runs ?? [
    {
      runId: 'run-e2e-live-001',
      taskId: 'task-e2e-001',
      taskTitle: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
      query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
      taskType: 'PRICE_MONITOR',
      status: 'COMPLETED',
      queriesExecuted: 4,
      sourcesDiscovered: 12,
      sourcesExtracted: 8,
      claimsVerified: 6,
      candidateCount: 2,
      durationMs: 85000,
      totalCostUsd: '0.0452',
      startedAt: '2026-11-07T08:00:00Z',
      createdAt: '2026-11-07T08:00:00Z',
      completedAt: '2026-11-07T08:01:25Z',
    },
    {
      runId: 'run-e2e-live-002',
      taskId: 'task-e2e-002',
      taskTitle: 'MacBook Air M2 16GB RAM 512GB SSD under $900',
      query: 'MacBook Air M2 16GB RAM 512GB SSD under $900',
      taskType: 'PRODUCT_RESEARCH',
      status: 'FAILED',
      queriesExecuted: 1,
      sourcesDiscovered: 3,
      sourcesExtracted: 0,
      claimsVerified: 0,
      candidateCount: 0,
      durationMs: 30000,
      totalCostUsd: '0.0120',
      startedAt: '2026-11-06T12:00:00Z',
      createdAt: '2026-11-06T12:00:00Z',
      completedAt: '2026-11-06T12:00:30Z',
    },
  ];

  await page.route(/\/api\/research\/history(\?.*)?$/, async (route: Route) => {
    const url = new URL(route.request().url());
    const queryFilter = url.searchParams.get('query')?.toLowerCase() ?? '';
    const statusFilter = url.searchParams.get('status') ?? 'ALL';

    let filtered = historyRuns;
    if (queryFilter) {
      filtered = filtered.filter((r) => r.query.toLowerCase().includes(queryFilter));
    }
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        runs: filtered,
        pagination: {
          page: 1,
          limit: 15,
          total: filtered.length,
          totalPages: 1,
        },
      }),
    });
  });

  // Export handlers
  await page.route(/\/api\/research\/(?:runs\/[^/]+|history)\/export/, async (route: Route) => {
    if (options?.simulateExportError) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Export generation failed due to an internal error' }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const format = url.searchParams.get('format') || 'json';
    const dataset = url.searchParams.get('dataset');

    if (format === 'json') {
      const jsonPayload = {
        schemaVersion: '1.0.0',
        exportedAt: '2026-11-07T08:30:00Z',
        runId: 'run-e2e-live-001',
        query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
        status: 'COMPLETED',
        candidates: MOCK_E2E_RESEARCH_RUN.candidates,
        sources: [
          {
            id: 'src-001',
            title: 'eBay Direct ThinkPad T14 Store',
            url: 'https://example.com/item/thinkpad-t14-gen3',
            domain: 'example.com',
          },
        ],
      };

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="verityscout-run-e2e-live-001.json"',
        },
        body: JSON.stringify(jsonPayload, null, 2),
      });
      return;
    }

    if (format === 'csv') {
      let csvContent = '';
      let filename = 'verityscout-export.csv';

      if (dataset === 'evidence') {
        filename = 'verityscout-evidence-run-e2e-live-001.csv';
        csvContent = [
          '"id","candidateId","attribute","value","confidence","sourceUrl"',
          '"ev-1","cand-e2e-001","Price","$649.99","HIGH","https://example.com/item/thinkpad-t14-gen3"',
          '"ev-2","cand-e2e-001","Memory","32GB LPDDR5","HIGH","https://example.com/item/thinkpad-t14-gen3"',
        ].join('\n');
      } else {
        filename = 'verityscout-candidates-run-e2e-live-001.csv';
        // Includes formula injection test with prepended quote
        csvContent = [
          '"id","name","price","retailer","classification"',
          '"cand-e2e-001","Lenovo ThinkPad T14 Gen 3","$649.99","eBay Direct","EXACT_MATCH"',
          '"cand-e2e-002","Lenovo ThinkPad T14 Gen 3 16GB","$529.00","Amazon Renewed","NEAR_MATCH"',
        ].join('\n');
      }

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: csvContent,
      });
      return;
    }

    if (format === 'markdown') {
      const mdContent = `# VerityScout AI Research Report: Refurbished ThinkPad T14 AMD Gen 3

## Executive Summary
- **Query:** Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700
- **Status:** COMPLETED
- **Verified Candidates:** 2 verified results
- **Exported At:** 2026-11-07 08:30:00 UTC

## Verified Candidates
### 1. Lenovo ThinkPad T14 Gen 3 AMD Ryzen 7 32GB RAM
- **Price:** $649.99 (Ceiling $700.00) — Match
- **Memory:** 32GB LPDDR5-6400 — Match
- **Retailer:** eBay Refurbished Direct
- **Classification:** EXACT_MATCH

### 2. Lenovo ThinkPad T14 Gen 3 AMD Ryzen 5 16GB RAM
- **Price:** $529.00 (Ceiling $700.00) — Match
- **Memory:** 16GB (Requires 32GB) — Constraint Mismatch
- **Retailer:** Amazon Renewed
- **Classification:** NEAR_MATCH
`;

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': 'attachment; filename="verityscout-report-run-e2e-live-001.md"',
        },
        body: mdContent,
      });
      return;
    }

    await route.continue();
  });
}

/**
 * Route interception helper for Schedule and Change Monitoring APIs.
 */
export async function mockScheduleApis(
  page: Page,
  options?: {
    schedules?: E2ESchedule[];
  }
): Promise<void> {
  const currentSchedules: E2ESchedule[] = options?.schedules
    ? [...options.schedules]
    : JSON.parse(JSON.stringify(MOCK_E2E_SCHEDULES));

  // GET /api/schedules
  await page.route(/\/api\/schedules$/, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schedules: currentSchedules }),
      });
      return;
    }

    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      const newSchedule: E2ESchedule = {
        id: `sched-created-${Date.now()}`,
        name: body.name || 'New Research Monitor',
        revision: 1,
        status: 'ACTIVE',
        cron_expression: '0 9 * * *',
        scheduled_time: '09:00',
        timezone: body.timezone || 'UTC',
        next_run_at: new Date(Date.now() + 86400000).toISOString(),
        last_run_at: null,
        last_dispatched_at: null,
        last_run_id: null,
        request_snapshot: {
          query: body.query,
          taskType: 'SCHEDULED_MONITOR',
        },
      };

      currentSchedules.unshift(newSchedule);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          schedule: newSchedule,
          nextRun: {
            nextRunAt: newSchedule.next_run_at,
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  // POST /api/schedules/:id/pause
  await page.route(/\/api\/schedules\/[^/]+\/pause$/, async (route: Route) => {
    const url = route.request().url();
    const id = url.split('/schedules/')[1]?.split('/pause')[0];
    const sched = currentSchedules.find((s) => s.id === id);
    if (sched) {
      sched.status = 'PAUSED';
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, schedule: sched }),
    });
  });

  // POST /api/schedules/:id/resume
  await page.route(/\/api\/schedules\/[^/]+\/resume$/, async (route: Route) => {
    const url = route.request().url();
    const id = url.split('/schedules/')[1]?.split('/resume')[0];
    const sched = currentSchedules.find((s) => s.id === id);
    if (sched) {
      sched.status = 'ACTIVE';
      sched.next_run_at = new Date(Date.now() + 86400000).toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, schedule: sched }),
    });
  });

  // GET /api/schedules/:id/occurrences
  await page.route(/\/api\/schedules\/[^/]+\/occurrences(\?.*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ occurrences: MOCK_E2E_OCCURRENCES }),
    });
  });

  // GET /api/schedules/:id/changes
  await page.route(/\/api\/schedules\/[^/]+\/changes(\?.*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latestChanges: [
          {
            id: 'change-e2e-001',
            candidate_title: 'Lenovo ThinkPad T14 Gen 3 AMD Ryzen 7',
            field_name: 'price',
            change_type: 'PRICE_DROP',
            previous_value: '$699.99',
            new_value: '$649.99',
            explanation: 'eBay Refurbished price reduced from $699.99 to $649.99',
            detected_at: '2026-11-03T14:01:10Z',
          },
        ],
        latestComparison: {
          summary: {
            totalCompared: 2,
            changedCount: 1,
            newlyObservedCount: 0,
          },
        },
      }),
    });
  });
}

/**
 * Route interception helper for In-App Notifications APIs.
 */
export async function mockNotificationApis(
  page: Page,
  options?: {
    notifications?: E2ENotification[];
  }
): Promise<void> {
  const notifications: E2ENotification[] = options?.notifications
    ? [...options.notifications]
    : JSON.parse(JSON.stringify(MOCK_E2E_NOTIFICATIONS));

  // GET /api/notifications/unread-count
  await page.route(/\/api\/notifications\/unread-count$/, async (route: Route) => {
    const unread = notifications.filter((n) => !n.read_at && !n.dismissed_at).length;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { unreadCount: unread },
      }),
    });
  });

  // GET /api/notifications
  await page.route(/\/api\/notifications(?:\?.*)?$/, async (route: Route) => {
    const url = new URL(route.request().url());
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

    let activeList = notifications.filter((n) => !n.dismissed_at);
    if (unreadOnly) {
      activeList = activeList.filter((n) => !n.read_at);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          data: activeList,
          pagination: {
            page: 1,
            limit: 20,
            total: activeList.length,
            totalPages: 1,
          },
        },
      }),
    });
  });

  // PATCH /api/notifications/:id/read
  await page.route(/\/api\/notifications\/[^/]+\/read$/, async (route: Route) => {
    const parts = route.request().url().split('/notifications/')[1]?.split('/read')[0];
    const notif = notifications.find((n) => n.id === parts);
    if (notif) {
      notif.read_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, notification: notif }),
    });
  });

  // POST /api/notifications/read-all
  await page.route(/\/api\/notifications\/read-all$/, async (route: Route) => {
    const now = new Date().toISOString();
    for (const n of notifications) {
      if (!n.read_at) n.read_at = now;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // PATCH /api/notifications/:id/dismiss
  await page.route(/\/api\/notifications\/[^/]+\/dismiss$/, async (route: Route) => {
    const parts = route.request().url().split('/notifications/')[1]?.split('/dismiss')[0];
    const notif = notifications.find((n) => n.id === parts);
    if (notif) {
      notif.dismissed_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

/**
 * Route interception helper for AI Provider Settings APIs.
 */
export async function mockProviderSettingsApis(
  page: Page,
  options?: {
    providers?: E2EProviderSettings[];
  }
): Promise<void> {
  const providers: E2EProviderSettings[] = options?.providers
    ? [...options.providers]
    : JSON.parse(JSON.stringify(MOCK_E2E_PROVIDERS));

  // GET /api/settings/providers
  await page.route(/\/api\/settings\/providers$/, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers }),
      });
      return;
    }

    // POST /api/settings/providers (save API key)
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      const prov = providers.find((p) => p.id === body.providerId);
      if (prov) {
        prov.isConfigured = true;
        prov.credentialPreview = `${body.apiKey.slice(0, 7)}****${body.apiKey.slice(-4)}`;
        prov.updatedAt = new Date().toISOString();
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          provider: prov,
        }),
      });
      return;
    }

    await route.continue();
  });

  // PATCH /api/settings/providers/:id
  await page.route(/\/api\/settings\/providers\/[^/]+$/, async (route: Route) => {
    const id = route.request().url().split('/providers/')[1];
    const prov = providers.find((p) => p.id === id);
    if (route.request().method() === 'PATCH') {
      const body = JSON.parse(route.request().postData() || '{}');
      if (prov && typeof body.isEnabled === 'boolean') {
        prov.isEnabled = body.isEnabled;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, provider: prov }),
      });
      return;
    }

    // DELETE /api/settings/providers/:id
    if (route.request().method() === 'DELETE') {
      if (prov) {
        prov.isConfigured = false;
        prov.credentialPreview = null;
        prov.lastConnectionTestStatus = 'UNTESTED';
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.continue();
  });

  // POST /api/settings/providers/:id/test
  await page.route(/\/api\/settings\/providers\/[^/]+\/test$/, async (route: Route) => {
    const id = route.request().url().split('/providers/')[1]?.split('/test')[0];
    const prov = providers.find((p) => p.id === id);
    if (prov) {
      prov.lastConnectionTestStatus = 'TEST_SUCCESS';
      prov.lastConnectionTestAt = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        providerId: id,
        status: 'SUCCESS',
        durationMs: 142,
        latencyMs: 142,
        message: 'Connection verified successfully. Target model ready for inference.',
      }),
    });
  });
}
