import type { SampleHistoryRecord } from './types';

export const HISTORY_RECORDS_FIXTURE: readonly SampleHistoryRecord[] = [
  {
    id: 'demo-history-001',
    query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
    timestamp: '2026-10-30T14:22:00Z',
    candidatesFound: 3,
    matchRate: '100% Verified',
    durationSeconds: 78,
    runId: 'demo-run-001',
  },
  {
    id: 'demo-history-002',
    query: 'LG C3 65" OLED TV under $1,400 with Authorized Warranty',
    timestamp: '2026-10-29T18:10:00Z',
    candidatesFound: 2,
    matchRate: '100% Verified',
    durationSeconds: 64,
    runId: 'demo-run-002',
  },
  {
    id: 'demo-history-003',
    query: 'Sony WH-1000XM5 Noise Cancelling Headphones below $280',
    timestamp: '2026-10-28T09:45:00Z',
    candidatesFound: 5,
    matchRate: '80% Strong Matches',
    durationSeconds: 82,
    runId: 'demo-run-003',
  },
] as const;
