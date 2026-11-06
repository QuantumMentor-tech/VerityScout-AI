import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '@/app/api/schedules/[id]/route';
import { POST as pauseRoute } from '@/app/api/schedules/[id]/pause/route';
import { POST as resumeRoute } from '@/app/api/schedules/[id]/resume/route';
import { GET as listOccurrencesRoute } from '@/app/api/schedules/[id]/occurrences/route';
import { ScheduleLifecycleService } from '@/server/schedules';
import * as authModule from '@/server/auth/authorization';
import { ScheduleStatus, OccurrenceStatus } from '@/server/persistence/types';
import { AppError } from '@/lib/errors/app-error';

describe('Schedule Lifecycle and Occurrence API Endpoints (Step 47)', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockScheduleId = '22222222-2222-4222-a222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authModule, 'requireAuthenticatedCaller').mockResolvedValue({
      userId: mockUserId,
      user: {
        id: mockUserId,
        email: 'tester@verityscout.local',
        displayName: 'Tester',
        createdAt: new Date().toISOString(),
      },
    });
  });

  describe('PATCH /api/schedules/[id]', () => {
    it('API-LIFE-001: Returns 401 when unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name' }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: mockScheduleId }) });
      expect(res.status).toBe(401);
    });

    it('API-LIFE-002: Updates schedule definition and returns 200', async () => {
      vi.spyOn(ScheduleLifecycleService.prototype, 'edit').mockResolvedValueOnce({
        id: mockScheduleId,
        task_id: 'task-1',
        user_id: mockUserId,
        name: 'New Schedule Name',
        revision: 2,
        status: ScheduleStatus.ACTIVE,
      } as any);

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Schedule Name',
          query: 'RTX 5090 restock alert',
          expectedRevision: 1,
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: mockScheduleId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schedule.revision).toBe(2);
      expect(data.schedule.name).toBe('New Schedule Name');
    });

    it('API-LIFE-003: Returns 409 Conflict when expectedRevision does not match', async () => {
      vi.spyOn(ScheduleLifecycleService.prototype, 'edit').mockRejectedValueOnce(
        new AppError({
          code: 'BAD_REQUEST',
          message: 'Conflict: Schedule revision mismatch.',
          statusCode: 409,
        })
      );

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Conflict Name',
          expectedRevision: 1,
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: mockScheduleId }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('Conflict');
    });
  });

  describe('DELETE /api/schedules/[id]', () => {
    it('API-LIFE-004: Retires schedule and preserves history returning 200', async () => {
      vi.spyOn(ScheduleLifecycleService.prototype, 'retire').mockResolvedValueOnce({
        id: mockScheduleId,
        task_id: 'task-1',
        user_id: mockUserId,
        name: 'Retired Schedule',
        revision: 1,
        status: ScheduleStatus.ARCHIVED,
        next_run_at: null,
      } as any);

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}`, {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: mockScheduleId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schedule.status).toBe('ARCHIVED');
      expect(data.message).toContain('historical executions preserved');
    });
  });

  describe('POST /api/schedules/[id]/pause', () => {
    it('API-LIFE-005: Pauses schedule and returns 200', async () => {
      vi.spyOn(ScheduleLifecycleService.prototype, 'pause').mockResolvedValueOnce({
        id: mockScheduleId,
        task_id: 'task-1',
        user_id: mockUserId,
        name: 'Paused Schedule',
        revision: 1,
        status: ScheduleStatus.PAUSED,
      } as any);

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}/pause`, {
        method: 'POST',
      });

      const res = await pauseRoute(req, { params: Promise.resolve({ id: mockScheduleId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schedule.status).toBe('PAUSED');
      expect(data.message).toBe('Schedule paused successfully');
    });
  });

  describe('POST /api/schedules/[id]/resume', () => {
    it('API-LIFE-006: Resumes schedule and returns 200', async () => {
      vi.spyOn(ScheduleLifecycleService.prototype, 'resume').mockResolvedValueOnce({
        id: mockScheduleId,
        task_id: 'task-1',
        user_id: mockUserId,
        name: 'Resumed Schedule',
        revision: 1,
        status: ScheduleStatus.ACTIVE,
        next_run_at: '2026-06-16T09:00:00.000Z',
      } as any);

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}/resume`, {
        method: 'POST',
      });

      const res = await resumeRoute(req, { params: Promise.resolve({ id: mockScheduleId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schedule.status).toBe('ACTIVE');
      expect(data.message).toBe('Schedule resumed successfully');
    });
  });

  describe('GET /api/schedules/[id]/occurrences', () => {
    it('API-LIFE-007: Lists occurrences for a schedule with pagination', async () => {
      vi.spyOn(ScheduleLifecycleService.prototype, 'listOccurrences').mockResolvedValueOnce({
        occurrences: [
          {
            id: 'occ-1',
            schedule_id: mockScheduleId,
            user_id: mockUserId,
            schedule_revision: 1,
            idempotency_key: `occ_${mockScheduleId}_1`,
            scheduled_at: '2026-06-15T09:00:00.000Z',
            status: OccurrenceStatus.COMPLETED,
            queue_job_id: 'job-1',
            research_run_id: 'run-1',
            dispatched_at: '2026-06-15T09:00:01.000Z',
            started_at: '2026-06-15T09:00:02.000Z',
            completed_at: '2026-06-15T09:02:00.000Z',
            error_message: null,
            recovery_metadata: null,
            created_at: '2026-06-15T09:00:00.000Z',
            updated_at: '2026-06-15T09:02:00.000Z',
          },
        ],
        total: 1,
      });

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}/occurrences?limit=10&offset=0`);
      const res = await listOccurrencesRoute(req, { params: Promise.resolve({ id: mockScheduleId }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.occurrences).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.occurrences[0].status).toBe('COMPLETED');
    });
  });
});

