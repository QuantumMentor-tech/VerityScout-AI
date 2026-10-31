import type { OverviewMetric, SampleActivityItem } from './types';

export const OVERVIEW_METRICS_FIXTURE: readonly OverviewMetric[] = [
  {
    id: 'runs-scanned',
    label: 'Synthetic Research Sessions',
    value: '42',
    change: 'Deterministic test runs',
    badge: 'Sample',
  },
  {
    id: 'evidence-sources',
    label: 'Indexed Source Documents',
    value: '184',
    change: 'Cached benchmark pages',
    badge: 'Sample',
  },
  {
    id: 'verified-rate',
    label: 'Verification Precision (Bench)',
    value: '94.2%',
    change: 'Step 2 rubric baseline',
    badge: 'Ground-Truth',
  },
  {
    id: 'active-monitors',
    label: 'Simulated Change Monitors',
    value: '3',
    change: 'Scheduled preview jobs',
    badge: 'Preview',
  },
] as const;

export const OVERVIEW_ACTIVITIES_FIXTURE: readonly SampleActivityItem[] = [
  {
    id: 'act-001',
    title: 'ThinkPad T14 AMD Gen 3 (32GB RAM under $700)',
    timestamp: '2026-10-30T14:22:00Z',
    status: 'completed',
    target: 'lenovo.com / ebay.com / amazon.com',
    runId: 'demo-run-001',
  },
  {
    id: 'act-002',
    title: 'LG C3 65" OLED TV under $1,400',
    timestamp: '2026-10-29T18:10:00Z',
    status: 'verified',
    target: 'bestbuy.com / bhphotovideo.com',
    runId: 'demo-run-002',
  },
  {
    id: 'act-003',
    title: 'Sony WH-1000XM5 Noise Cancelling Headphones',
    timestamp: '2026-10-28T09:45:00Z',
    status: 'monitoring',
    target: 'target.com / walmart.com',
    runId: 'demo-run-003',
  },
] as const;
