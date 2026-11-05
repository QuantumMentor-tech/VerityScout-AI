import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createScheduleRoute, GET as listSchedulesRoute } from '@/app/api/schedules/route';
import { GET as getScheduleRoute } from '@/app/api/schedules/[id]/route';
import * as authModule from '@/server/auth/authorization';
import * as txModule from '@/server/persistence/transaction';
import {
  ResearchScheduleRepository,
  ResearchTaskRepository,
} from '@/server/persistence/repositories';
import { ScheduleStatus } from '@/server/persistence/types';

describe('Schedules API Endpoints', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockScheduleId = '22222222-2222-4222-a222-222222222222';
  const mockTaskId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authModule, 'requireAuthenticatedCaller').mockResolvedValue({
      user: {
        id: mockUserId,
        email: 'scheduler@verityscout.com',
        displayName: 'Scheduler User',
        createdAt: '2026-11-01T00:00:00Z',
      },
      userId: mockUserId,
    });

    vi.spyOn(txModule, 'withTransaction').mockImplementation(async (cb: any) => cb({}));
  });

  describe('POST /api/schedules', () => {
    it('API-SCHED-001: Returns 401 when caller is unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest('http://localhost:3000/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' }),
      });

      const res = await createScheduleRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });

    it('API-SCHED-002: Returns 400 when query is too short', async () => {
      const req = new NextRequest('http://localhost:3000/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'ab', // < 3 chars
          timezone: 'America/New_York',
          recurrence: {
            frequency: 'DAILY',
            time: '09:00',
          },
        }),
      });

      const res = await createScheduleRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('API-SCHED-003: Returns 400 when timezone is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Valid Research Query',
          timezone: 'Invalid/City_Name',
          recurrence: {
            frequency: 'DAILY',
            time: '09:00',
          },
        }),
      });

      const res = await createScheduleRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid IANA timezone identifier');
    });

    it('API-SCHED-004: Returns 400 when recurrence rule time is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Valid Research Query',
          timezone: 'America/New_York',
          recurrence: {
            frequency: 'DAILY',
            time: '25:99', // invalid time
          },
        }),
      });

      const res = await createScheduleRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('API-SCHED-005: Creates and persists schedule returning 201 Created', async () => {
      vi.spyOn(ResearchTaskRepository.prototype, 'create').mockResolvedValueOnce({
        id: mockTaskId,
        user_id: mockUserId,
        title: 'RTX 5090 Monitor',
        original_query: 'NVIDIA RTX 5090 Price Trends',
        task_type: 'PRODUCT_RESEARCH' as any,
        constraints: {},
        limits: {},
        model_policy: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      const mockSavedSchedule = {
        id: mockScheduleId,
        task_id: mockTaskId,
        user_id: mockUserId,
        name: 'RTX 5090 Monitor',
        revision: 1,
        status: ScheduleStatus.ACTIVE,
        cron_expression: '0 9 * * 1',
        recurrence_rule: {
          frequency: 'WEEKLY',
          time: '09:00',
          weekdays: [1],
        },
        scheduled_time: '09:00',
        request_snapshot: {
          query: 'NVIDIA RTX 5090 Price Trends',
        },
        timezone: 'America/New_York',
        next_run_at: new Date().toISOString(),
        consecutive_failures: 0,
        change_notification_threshold_pct: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_run_at: null,
        last_dispatched_at: null,
        last_run_id: null,
      };

      vi.spyOn(ResearchScheduleRepository.prototype, 'create').mockResolvedValueOnce(mockSavedSchedule);

      const req = new NextRequest('http://localhost:3000/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'NVIDIA RTX 5090 Price Trends',
          name: 'RTX 5090 Monitor',
          timezone: 'America/New_York',
          recurrence: {
            frequency: 'WEEKLY',
            time: '09:00',
            weekdays: [1],
          },
        }),
      });

      const res = await createScheduleRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.schedule.id).toBe(mockScheduleId);
      expect(data.description).toContain('America/New_York');
      expect(data.nextRun.nextRunAt).toBeDefined();
    });
  });

  describe('GET /api/schedules', () => {
    it('API-SCHED-006: Returns 401 when unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const res = await listSchedulesRoute();
      expect(res.status).toBe(401);
    });

    it('API-SCHED-007: Returns user schedules list', async () => {
      vi.spyOn(ResearchScheduleRepository.prototype, 'listByOwner').mockResolvedValueOnce([
        {
          id: mockScheduleId,
          task_id: mockTaskId,
          user_id: mockUserId,
          name: 'Daily Research',
          revision: 1,
          status: ScheduleStatus.ACTIVE,
          cron_expression: '0 9 * * *',
          recurrence_rule: {
            frequency: 'DAILY',
            time: '09:00',
          },
          scheduled_time: '09:00',
          request_snapshot: { query: 'Test' },
          timezone: 'UTC',
          next_run_at: '2026-06-16T09:00:00Z',
          consecutive_failures: 0,
          change_notification_threshold_pct: 2,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          last_run_at: null,
          last_dispatched_at: null,
          last_run_id: null,
        },
      ]);

      const res = await listSchedulesRoute();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schedules).toHaveLength(1);
      expect(data.schedules[0].description).toBe('Daily at 09:00 (UTC)');
    });
  });

  describe('GET /api/schedules/[id]', () => {
    it('API-SCHED-008: Returns 404 for unknown or cross-user schedule', async () => {
      vi.spyOn(ResearchScheduleRepository.prototype, 'findById').mockResolvedValueOnce(null);

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}`);
      const res = await getScheduleRoute(req, { params: Promise.resolve({ id: mockScheduleId }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Research schedule not found');
    });

    it('API-SCHED-009: Returns 200 with schedule details when owned by user', async () => {
      vi.spyOn(ResearchScheduleRepository.prototype, 'findById').mockResolvedValueOnce({
        id: mockScheduleId,
        task_id: mockTaskId,
        user_id: mockUserId,
        name: 'Weekly Monitor',
        revision: 1,
        status: ScheduleStatus.ACTIVE,
        cron_expression: '0 9 * * 1',
        recurrence_rule: {
          frequency: 'WEEKLY',
          time: '09:00',
          weekdays: [1],
        },
        scheduled_time: '09:00',
        request_snapshot: { query: 'AMD Ryzen 9' },
        timezone: 'Europe/London',
        next_run_at: '2026-06-15T08:00:00Z',
        consecutive_failures: 0,
        change_notification_threshold_pct: 2,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
        last_run_at: null,
        last_dispatched_at: null,
        last_run_id: null,
      });

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}`);
      const res = await getScheduleRoute(req, { params: Promise.resolve({ id: mockScheduleId }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schedule.id).toBe(mockScheduleId);
      expect(data.schedule.description).toBe('Weekly on Mon at 09:00 (Europe/London)');
    });
  });
});
