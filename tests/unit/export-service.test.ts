import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportService, sanitizeFilename } from '@/server/export/export.service';
import { ResearchHistoryService } from '@/server/history/history.service';
import { ResearchRunExportSnapshot, HistoryExportSnapshot } from '@/server/export/export.types';
import {
  RunStatus,
  RunStage,
  TaskType,
  MatchClassification,
} from '@/server/persistence/types';

describe('ExportService (Step 49)', () => {
  let mockHistoryService: Partial<ResearchHistoryService>;
  let exportService: ExportService;

  const mockSnapshot: ResearchRunExportSnapshot = {
    run: {
      id: '11111111-1111-4111-a111-111111111111',
      task_id: 'task-1',
      user_id: 'user-1',
      schedule_id: null,
      idempotency_key: 'idem-1',
      status: RunStatus.COMPLETED,
      current_stage: RunStage.FINALIZING,
      stage_counters: { queriesExecuted: 1, sourcesDiscovered: 2, sourcesExtracted: 2, claimsVerified: 4 },
      usage: { promptTokens: 50, completionTokens: 50, searchCredits: 1, estimatedCostUsd: '0.0020' },
      selected_provider: 'openai',
      selected_model: 'gpt-4o',
      error_message: null,
      cancellation_reason: null,
      started_at: '2026-11-06T08:00:00.000Z',
      completed_at: '2026-11-06T08:00:02.000Z',
    },
    task: {
      id: 'task-1',
      user_id: 'user-1',
      title: 'LG C3 OLED Review',
      original_query: 'lg c3 65 inch oled tv',
      task_type: TaskType.PRODUCT_RESEARCH,
      constraints: {} as any,
      limits: {} as any,
      model_policy: {} as any,
      is_archived: false,
      created_at: '2026-11-06T07:59:00.000Z',
      updated_at: '2026-11-06T07:59:00.000Z',
    },
    candidates: [
      {
        id: 'cand-1',
        run_id: '11111111-1111-4111-a111-111111111111',
        user_id: 'user-1',
        title: 'LG C3 65" OLED 4K TV',
        product_identifier: 'OLED65C3PUA',
        seller_or_domain: 'bestbuy.com',
        canonical_url: 'https://bestbuy.com/p/12345',
        price_usd: '1499.99',
        currency: 'USD',
        availability: 'IN_STOCK',
        condition: 'NEW',
        specifications: { displaySize: '65 inch' },
        classification: MatchClassification.EXACT_MATCH,
        constraint_evaluation: { passedConstraints: [], failedConstraints: [] },
        created_at: '2026-11-06T08:00:01.000Z',
      },
    ],
    evidence: [],
    sources: [],
    comparison: null,
    changes: [],
  };

  const mockHistorySnapshot: HistoryExportSnapshot = {
    runs: [
      {
        runId: '11111111-1111-4111-a111-111111111111',
        taskId: 'task-1',
        taskTitle: 'LG C3 OLED Review',
        query: 'lg c3 65 inch oled tv',
        taskType: 'PRODUCT_RESEARCH',
        status: 'COMPLETED',
        candidateCount: 1,
        queriesExecuted: 1,
        sourcesDiscovered: 2,
        sourcesExtracted: 2,
        claimsVerified: 4,
        startedAt: '2026-11-06T08:00:00.000Z',
        createdAt: '2026-11-06T08:00:00.000Z',
      },
    ],
    totalCount: 1,
  };

  beforeEach(() => {
    mockHistoryService = {
      getRunExportSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
      getHistoryExportSnapshot: vi.fn().mockResolvedValue(mockHistorySnapshot),
    };

    exportService = new ExportService(mockHistoryService as ResearchHistoryService);
  });

  describe('sanitizeFilename', () => {
    it('strips directory traversal characters, non-alphanumeric symbols, and caps length', () => {
      expect(sanitizeFilename('../../../etc/passwd.json')).toBe('passwd.json');
      expect(sanitizeFilename('my cool research??!!*.csv')).toBe('my_cool_research.csv');
      expect(sanitizeFilename('normal_report-123.md')).toBe('normal_report-123.md');
    });
  });

  describe('exportRun', () => {
    it('generates JSON export with valid content-type and filename', async () => {
      const result = await exportService.exportRun(mockSnapshot.run.id, 'user-1', {
        format: 'json',
      });

      expect(result.contentType).toBe('application/json; charset=utf-8');
      expect(result.filename).toBe('verityscout-run-11111111.json');
      const parsed = JSON.parse(result.data);
      expect(parsed.data.run.id).toBe(mockSnapshot.run.id);
    });

    it('generates CSV export for candidates dataset', async () => {
      const result = await exportService.exportRun(mockSnapshot.run.id, 'user-1', {
        format: 'csv',
        dataset: 'candidates',
      });

      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toBe('verityscout-run-11111111-candidates.csv');
      expect(result.data).toContain('OLED65C3PUA');
    });

    it('generates Markdown report export', async () => {
      const result = await exportService.exportRun(mockSnapshot.run.id, 'user-1', {
        format: 'markdown',
      });

      expect(result.contentType).toBe('text/markdown; charset=utf-8');
      expect(result.filename).toBe('verityscout-run-11111111.md');
      expect(result.data).toContain('# Research Verification Report');
    });
  });

  describe('exportHistory', () => {
    it('generates history JSON export', async () => {
      const result = await exportService.exportHistory('user-1', undefined, 'json');
      expect(result.contentType).toBe('application/json; charset=utf-8');
      expect(result.filename).toMatch(/^verityscout-history-\d{4}-\d{2}-\d{2}\.json$/);
      const parsed = JSON.parse(result.data);
      expect(parsed.data.runs[0].query).toBe('lg c3 65 inch oled tv');
    });

    it('generates history CSV export', async () => {
      const result = await exportService.exportHistory('user-1', undefined, 'csv');
      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toMatch(/^verityscout-history-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.data).toContain('lg c3 65 inch oled tv');
    });
  });
});
