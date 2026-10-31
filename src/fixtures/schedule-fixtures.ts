import type { SampleScheduleRecord } from './types';

export const SCHEDULES_FIXTURE: readonly SampleScheduleRecord[] = [
  {
    id: 'demo-schedule-001',
    taskName: 'ThinkPad T14 Price & Stock Watch',
    cadence: 'Every 6 hours (0 */6 * * *)',
    targetDomain: 'lenovo.com / ebay.com',
    lastRunTimestamp: '2026-10-31T06:00:00Z',
    nextRunTimestamp: '2026-10-31T12:00:00Z',
    priceDropAlert: true,
  },
  {
    id: 'demo-schedule-002',
    taskName: 'LG OLED TV Clearance Verification',
    cadence: 'Daily at 08:00 UTC (0 8 * * *)',
    targetDomain: 'bestbuy.com / bhphotovideo.com',
    lastRunTimestamp: '2026-10-31T08:00:00Z',
    nextRunTimestamp: '2026-11-01T08:00:00Z',
    priceDropAlert: false,
  },
] as const;
