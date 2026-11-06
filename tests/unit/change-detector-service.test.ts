import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorService } from '@/server/changes/change-detector.service';
import {
  ResearchRunRow,
  CandidateResultRow,
  RunStatus,
  RunStage,
  MatchClassification,
  ComparisonStatus,
  ResearchComparisonRow,
} from '@/server/persistence/types';
import {
  ResearchComparisonRepository,
  ChangeEventRepository,
  ResearchRunRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
} from '@/server/persistence/repositories';

describe('ChangeDetectorService', () => {
  let mockCompRepo: Partial<ResearchComparisonRepository>;
  let mockChangeEventRepo: Partial<ChangeEventRepository>;
  let mockRunRepo: Partial<ResearchRunRepository>;
  let mockCandidateRepo: Partial<CandidateResultRepository>;
  let mockEvidenceRepo: Partial<EvidenceRecordRepository>;
  let service: ChangeDetectorService;

  const mockRun = (overrides: Partial<ResearchRunRow>): ResearchRunRow => ({
    id: 'run-1',
    task_id: 'task-1',
    user_id: 'user-1',
    schedule_id: 'sched-1',
    idempotency_key: 'idem-1',
    status: RunStatus.COMPLETED,
    current_stage: RunStage.FINALIZING,
    stage_counters: { queriesExecuted: 1, sourcesDiscovered: 5, sourcesExtracted: 5, claimsVerified: 5 },
    usage: { promptTokens: 10, completionTokens: 20, searchCredits: 1, estimatedCostUsd: '0.01' },
    selected_provider: 'openai',
    selected_model: 'gpt-4o',
    error_message: null,
    cancellation_reason: null,
    started_at: '2026-11-06T08:00:00.000Z',
    completed_at: '2026-11-06T08:05:00.000Z',
    ...overrides,
  });

  const mockCandidate = (overrides: Partial<CandidateResultRow>): CandidateResultRow => ({
    id: 'cand-1',
    run_id: 'run-1',
    user_id: 'user-1',
    title: 'MacBook Pro 14 M3',
    product_identifier: 'MBP14-M3',
    seller_or_domain: 'apple.com',
    canonical_url: 'https://apple.com/macbook-pro',
    price_usd: '1599.00',
    currency: 'USD',
    availability: 'IN_STOCK',
    condition: 'NEW',
    specifications: { memory: '16 GB', storage: '512 GB' },
    classification: MatchClassification.EXACT_MATCH,
    constraint_evaluation: { passedConstraints: [], failedConstraints: [] },
    created_at: '2026-11-06T08:00:00.000Z',
    ...overrides,
  });

  beforeEach(() => {
    mockCompRepo = {
      create: vi.fn().mockImplementation(async (input) => ({
        id: 'comp-1',
        task_id: input.task_id,
        schedule_id: input.schedule_id ?? null,
        user_id: input.user_id,
        baseline_run_id: input.baseline_run_id,
        current_run_id: input.current_run_id,
        status: input.status ?? ComparisonStatus.COMPLETED,
        comparison_policy_version: input.comparison_policy_version ?? 'v1.0',
        reason_code: input.reason_code ?? null,
        summary: input.summary ?? {},
        detected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as ResearchComparisonRow)),
    };

    mockChangeEventRepo = {
      createBatch: vi.fn().mockResolvedValue([]),
    };

    mockRunRepo = {
      findById: vi.fn(),
      listByTaskId: vi.fn(),
      listByScheduleId: vi.fn(),
    };

    mockCandidateRepo = {
      listByRunId: vi.fn(),
    };

    mockEvidenceRepo = {
      listByRunId: vi.fn(),
    };

    service = new ChangeDetectorService(
      mockCompRepo as ResearchComparisonRepository,
      mockChangeEventRepo as ChangeEventRepository,
      mockRunRepo as ResearchRunRepository,
      mockCandidateRepo as CandidateResultRepository,
      mockEvidenceRepo as EvidenceRecordRepository
    );
  });

  it('establishes baseline without creating false change events on first run', async () => {
    const currentRun = mockRun({ id: 'run-first', schedule_id: 'sched-1' });

    vi.mocked(mockRunRepo.findById!).mockResolvedValue(currentRun);
    vi.mocked(mockRunRepo.listByScheduleId!).mockResolvedValue({
      data: [currentRun], // only current run in history
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const result = await service.compareRuns({
      taskId: 'task-1',
      currentRunId: 'run-first',
      userId: 'user-1',
      scheduleId: 'sched-1',
    });

    expect(result.status).toBe(ComparisonStatus.FIRST_RUN_BASELINE);
    expect(result.reasonCode).toBe('FIRST_RUN_BASELINE_ESTABLISHED');
    expect(result.changes).toHaveLength(0);
    expect(result.summary.totalCompared).toBe(0);
    expect(result.summary.changedCount).toBe(0);
    expect(mockChangeEventRepo.createBatch).not.toHaveBeenCalled();
    expect(mockCompRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ComparisonStatus.FIRST_RUN_BASELINE,
        reason_code: 'FIRST_RUN_BASELINE_ESTABLISHED',
      })
    );
  });

  it('detects changes and persists them atomically between baseline and current run', async () => {
    const baselineRun = mockRun({
      id: 'run-base',
      completed_at: '2026-11-05T08:00:00.000Z',
    });
    const currentRun = mockRun({
      id: 'run-curr',
      completed_at: '2026-11-06T08:00:00.000Z',
    });

    vi.mocked(mockRunRepo.findById!).mockResolvedValue(currentRun);
    vi.mocked(mockRunRepo.listByScheduleId!).mockResolvedValue({
      data: [currentRun, baselineRun],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    // Baseline candidate: $1599.00
    const baseCandidate = mockCandidate({
      id: 'cand-base',
      run_id: 'run-base',
      price_usd: '1599.00',
    });
    // Current candidate: $1399.00 (Price Drop!)
    const currCandidate = mockCandidate({
      id: 'cand-curr',
      run_id: 'run-curr',
      price_usd: '1399.00',
    });

    vi.mocked(mockCandidateRepo.listByRunId!).mockImplementation(async (runId) => {
      if (runId === 'run-base') {
        return { data: [baseCandidate], pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 } };
      }
      return { data: [currCandidate], pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 } };
    });

    vi.mocked(mockEvidenceRepo.listByRunId!).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 1000, total: 0, totalPages: 0 },
    });

    const result = await service.compareRuns({
      taskId: 'task-1',
      currentRunId: 'run-curr',
      userId: 'user-1',
      scheduleId: 'sched-1',
    });

    expect(result.status).toBe(ComparisonStatus.CHANGES_DETECTED);
    expect(result.summary.totalCompared).toBe(1);
    expect(result.summary.changedCount).toBe(1);

    const priceDrop = result.changes.find((c) => c.fieldName === 'price');
    expect(priceDrop).toBeDefined();
    expect(priceDrop?.changeType).toBe('PRICE_DROP');
    expect(priceDrop?.percentageDelta).toBe(-12.51);

    expect(mockChangeEventRepo.createBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          field_name: 'price',
          change_type: 'PRICE_DROP',
        }),
      ])
    );
  });

  it('rejects execution if current run is not yet completed', async () => {
    const runningRun = mockRun({ id: 'run-running', status: RunStatus.RUNNING });
    vi.mocked(mockRunRepo.findById!).mockResolvedValue(runningRun);

    await expect(
      service.compareRuns({
        taskId: 'task-1',
        currentRunId: 'run-running',
        userId: 'user-1',
      })
    ).rejects.toThrow(/only COMPLETED or PARTIALLY_COMPLETED runs are eligible/);
  });
});

