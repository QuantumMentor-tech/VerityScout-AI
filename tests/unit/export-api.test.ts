import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as historyRoute } from '@/app/api/research/history/route';
import { GET as runExportRoute } from '@/app/api/research/runs/[runId]/export/route';
import { GET as historyExportRoute } from '@/app/api/research/history/export/route';
import * as authModule from '@/server/auth/authorization';
import { ExportService } from '@/server/export/export.service';
import { ResearchHistoryService } from '@/server/history/history.service';

describe('Research History & Export API Endpoints (Step 49)', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockRunId = '22222222-2222-4222-a222-222222222222';

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

  describe('GET /api/research/history', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest('http://localhost:3000/api/research/history');
      const res = await historyRoute(req);
      expect(res.status).toBe(401);
    });

    it('returns 200 with paginated history runs', async () => {
      vi.spyOn(ResearchHistoryService.prototype, 'listHistory').mockResolvedValueOnce({
        runs: [
          {
            runId: mockRunId,
            taskId: 'task-1',
            taskTitle: 'Monitor GPU',
            query: 'rtx 4090',
            taskType: 'PRICE_MONITOR',
            status: 'COMPLETED',
            candidateCount: 2,
            queriesExecuted: 1,
            sourcesDiscovered: 4,
            sourcesExtracted: 4,
            claimsVerified: 8,
            startedAt: '2026-11-06T08:00:00.000Z',
            createdAt: '2026-11-06T08:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        filtersApplied: {},
      });

      const req = new NextRequest('http://localhost:3000/api/research/history?page=1&limit=20');
      const res = await historyRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.runs).toHaveLength(1);
      expect(data.pagination.total).toBe(1);
    });
  });

  describe('GET /api/research/runs/[runId]/export', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/export?format=json`);
      const res = await runExportRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 for unsupported format', async () => {
      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/export?format=unsupported`);
      const res = await runExportRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 200 with attachment headers for valid export', async () => {
      vi.spyOn(ExportService.prototype, 'exportRun').mockResolvedValueOnce({
        data: '{"schema_version":"1.0.0"}',
        contentType: 'application/json; charset=utf-8',
        filename: 'verityscout-run-22222222.json',
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/export?format=json`);
      const res = await runExportRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="verityscout-run-22222222.json"');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      const body = await res.text();
      expect(body).toBe('{"schema_version":"1.0.0"}');
    });
  });

  describe('GET /api/research/history/export', () => {
    it('returns 200 with attachment headers for history export', async () => {
      vi.spyOn(ExportService.prototype, 'exportHistory').mockResolvedValueOnce({
        data: '# Research History Audit Export\n',
        contentType: 'text/markdown; charset=utf-8',
        filename: 'verityscout-history-2026-11-06.md',
      });

      const req = new NextRequest('http://localhost:3000/api/research/history/export?format=markdown');
      const res = await historyExportRoute(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="verityscout-history-2026-11-06.md"');
    });
  });
});

