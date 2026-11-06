import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResearchHistoryService } from '@/server/history/history.service';
import * as baseRepoModule from '@/server/persistence/repositories/base.repository';
import {
  ResearchRunRepository,
  ResearchTaskRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
  SourceDocumentRepository,
  ResearchComparisonRepository,
  ChangeEventRepository,
  ResearchScheduleRepository,
} from '@/server/persistence/repositories';
import { RunStatus, TaskType } from '@/server/persistence/types';

describe('ResearchHistoryService (Step 49)', () => {
  let service: ResearchHistoryService;
  let mockRunRepo: Partial<ResearchRunRepository>;
  let mockTaskRepo: Partial<ResearchTaskRepository>;
  let mockCandidateRepo: Partial<CandidateResultRepository>;
  let mockEvidenceRepo: Partial<EvidenceRecordRepository>;
  let mockSourceRepo: Partial<SourceDocumentRepository>;
  let mockCompRepo: Partial<ResearchComparisonRepository>;
  let mockChangeEventRepo: Partial<ChangeEventRepository>;
  let mockScheduleRepo: Partial<ResearchScheduleRepository>;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRunRepo = {
      findById: vi.fn(),
    };
    mockTaskRepo = {
      findById: vi.fn(),
    };
    mockCandidateRepo = {
      listByRunId: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
    };
    mockEvidenceRepo = {
      listByRunId: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
    };
    mockSourceRepo = {
      listByRunId: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
    };
    mockCompRepo = {
      findById: vi.fn(),
    };
    mockChangeEventRepo = {
      listByRunId: vi.fn().mockResolvedValue([]),
    };
    mockScheduleRepo = {
      findById: vi.fn(),
    };

    service = new ResearchHistoryService(
      mockRunRepo as ResearchRunRepository,
      mockTaskRepo as ResearchTaskRepository,
      mockCandidateRepo as CandidateResultRepository,
      mockEvidenceRepo as EvidenceRecordRepository,
      mockSourceRepo as SourceDocumentRepository,
      mockCompRepo as ResearchComparisonRepository,
      mockChangeEventRepo as ChangeEventRepository,
      mockScheduleRepo as ResearchScheduleRepository
    );
  });

  describe('listHistory', () => {
    it('queries database with user scoping and filters, returning enriched history rows', async () => {
      vi.spyOn(baseRepoModule, 'executeQuery').mockImplementation(async (_executor, sql) => {
        if (sql.trim().startsWith('SELECT COUNT')) {
          return { rows: [{ total: 1 }], rowCount: 1 } as any;
        }
        return {
          rows: [
            {
              run_id: 'run-1',
              task_id: 'task-1',
              task_title: 'MacBook Pro Search',
              original_query: 'macbook pro 14',
              task_type: TaskType.PRODUCT_RESEARCH,
              status: RunStatus.COMPLETED,
              schedule_id: null,
              schedule_name: null,
              stage_counters: { queriesExecuted: 1, sourcesDiscovered: 4, sourcesExtracted: 4, claimsVerified: 8 },
              usage: { estimatedCostUsd: '0.0050' },
              selected_model: 'gpt-4o',
              selected_provider: 'openai',
              execution_duration_ms: 2200,
              started_at: '2026-11-06T08:00:00.000Z',
              completed_at: '2026-11-06T08:00:02.200Z',
              created_at: '2026-11-06T08:00:00.000Z',
              candidate_count: 2,
            },
          ],
          rowCount: 1,
        } as any;
      });

      const result = await service.listHistory('user-1', {
        query: 'macbook',
        status: RunStatus.COMPLETED,
        page: 1,
        limit: 10,
      });

      expect(result.pagination.total).toBe(1);
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0]?.runId).toBe('run-1');
      expect(result.runs[0]?.candidateCount).toBe(2);
      expect(result.runs[0]?.query).toBe('macbook pro 14');
    });
  });

  describe('getRunExportSnapshot', () => {
    it('throws 404 if run not found or unauthorized', async () => {
      vi.mocked(mockRunRepo.findById!).mockResolvedValue(null);

      await expect(
        service.getRunExportSnapshot('non-existent-run', 'user-1')
      ).rejects.toThrow(/Research run not found/i);
    });

    it('retrieves complete snapshot when run and task exist', async () => {
      vi.mocked(mockRunRepo.findById!).mockResolvedValue({
        id: 'run-1',
        task_id: 'task-1',
        user_id: 'user-1',
        status: RunStatus.COMPLETED,
      } as any);

      vi.mocked(mockTaskRepo.findById!).mockResolvedValue({
        id: 'task-1',
        user_id: 'user-1',
        title: 'Task 1',
        original_query: 'Query 1',
      } as any);

      const snapshot = await service.getRunExportSnapshot('run-1', 'user-1');
      expect(snapshot.run.id).toBe('run-1');
      expect(snapshot.task.title).toBe('Task 1');
    });
  });
});
