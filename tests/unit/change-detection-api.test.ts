import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as scheduleChangesRoute } from '@/app/api/schedules/[id]/changes/route';
import { GET as runChangesRoute } from '@/app/api/research/runs/[runId]/changes/route';
import { POST as triggerComparisonRoute } from '@/app/api/research/comparisons/route';
import * as authModule from '@/server/auth/authorization';
import {
  ResearchScheduleRepository,
  ResearchComparisonRepository,
  ChangeEventRepository,
  ResearchRunRepository,
} from '@/server/persistence/repositories';
import { ChangeDetectorService } from '@/server/changes';
import { ComparisonStatus } from '@/server/persistence/types';

describe('Change Detection API Endpoints (Step 48)', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockScheduleId = '22222222-2222-4222-a222-222222222222';
  const mockRunId = '33333333-3333-4333-a333-333333333333';
  const mockTaskId = '44444444-4444-4444-a444-444444444444';

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

  describe('GET /api/schedules/[id]/changes', () => {
    it('returns 401 when caller is unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}/changes`);
      const res = await scheduleChangesRoute(req, {
        params: Promise.resolve({ id: mockScheduleId }),
      });

      expect(res.status).toBe(401);
    });

    it('returns 404 if schedule does not exist or belongs to another user', async () => {
      vi.spyOn(ResearchScheduleRepository.prototype, 'findById').mockResolvedValueOnce(null);

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}/changes`);
      const res = await scheduleChangesRoute(req, {
        params: Promise.resolve({ id: mockScheduleId }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/Schedule not found/i);
    });

    it('returns 200 with comparisons and latest changes', async () => {
      vi.spyOn(ResearchScheduleRepository.prototype, 'findById').mockResolvedValueOnce({
        id: mockScheduleId,
        user_id: mockUserId,
      } as any);

      const mockComp = {
        id: 'comp-1',
        schedule_id: mockScheduleId,
        status: ComparisonStatus.CHANGES_DETECTED,
        summary: { totalCompared: 5, changedCount: 2 },
      };

      vi.spyOn(ResearchComparisonRepository.prototype, 'listByScheduleId').mockResolvedValueOnce({
        data: [mockComp as any],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      vi.spyOn(ChangeEventRepository.prototype, 'listByComparisonId').mockResolvedValueOnce([
        {
          id: 'change-1',
          comparison_id: 'comp-1',
          field_name: 'price',
          change_type: 'PRICE_DROP',
          percentage_delta: -10,
        } as any,
      ]);

      const req = new NextRequest(`http://localhost:3000/api/schedules/${mockScheduleId}/changes`);
      const res = await scheduleChangesRoute(req, {
        params: Promise.resolve({ id: mockScheduleId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scheduleId).toBe(mockScheduleId);
      expect(data.latestComparison.id).toBe('comp-1');
      expect(data.latestChanges).toHaveLength(1);
      expect(data.latestChanges[0].change_type).toBe('PRICE_DROP');
    });
  });

  describe('GET /api/research/runs/[runId]/changes', () => {
    it('returns 401 when caller is unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/changes`);
      const res = await runChangesRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(401);
    });

    it('returns 404 when research run does not exist or is unauthorized', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValueOnce(null);

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/changes`);
      const res = await runChangesRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 200 with change events and parent comparison', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValueOnce({
        id: mockRunId,
        user_id: mockUserId,
      } as any);

      vi.spyOn(ChangeEventRepository.prototype, 'listByRunId').mockResolvedValueOnce([
        {
          id: 'event-1',
          current_run_id: mockRunId,
          comparison_id: 'comp-1',
          field_name: 'availability',
          change_type: 'STOCK_STATUS_CHANGE',
        } as any,
      ]);

      vi.spyOn(ResearchComparisonRepository.prototype, 'findById').mockResolvedValueOnce({
        id: 'comp-1',
        status: ComparisonStatus.CHANGES_DETECTED,
      } as any);

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/changes`);
      const res = await runChangesRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.runId).toBe(mockRunId);
      expect(data.changes).toHaveLength(1);
      expect(data.comparison?.id).toBe('comp-1');
    });
  });

  describe('POST /api/research/comparisons', () => {
    it('returns 400 when body fails schema validation', async () => {
      const req = new NextRequest('http://localhost:3000/api/research/comparisons', {
        method: 'POST',
        body: JSON.stringify({ invalid: 'data' }),
      });

      const res = await triggerComparisonRoute(req);
      expect(res.status).toBe(400);
    });

    it('returns 200 with comparison result on successful evaluation', async () => {
      const mockResult = {
        id: 'comp-99',
        taskId: mockTaskId,
        userId: mockUserId,
        baselineRunId: 'base-run',
        currentRunId: mockRunId,
        status: ComparisonStatus.NO_CHANGES_DETECTED,
        comparisonPolicyVersion: 'v1.0',
        changes: [],
        summary: {
          totalCompared: 3,
          changedCount: 0,
          unchangedCount: 3,
          newlyObservedCount: 0,
          noLongerObservedCount: 0,
          conflictingCount: 0,
          notComparableCount: 0,
        },
        detectedAt: new Date().toISOString(),
      };

      vi.spyOn(ChangeDetectorService.prototype, 'compareRuns').mockResolvedValueOnce(mockResult);

      const req = new NextRequest('http://localhost:3000/api/research/comparisons', {
        method: 'POST',
        body: JSON.stringify({
          taskId: mockTaskId,
          currentRunId: mockRunId,
        }),
      });

      const res = await triggerComparisonRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('comp-99');
      expect(data.status).toBe(ComparisonStatus.NO_CHANGES_DETECTED);
      expect(data.summary.totalCompared).toBe(3);
    });
  });
});

