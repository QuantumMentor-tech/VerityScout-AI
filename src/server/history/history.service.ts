import 'server-only';
import { PoolClient } from 'pg';
import { TransactionContext } from '@/server/persistence/transaction';
import {
  getExecutor,
  executeQuery,
  resolvePagination,
} from '@/server/persistence/repositories/base.repository';
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
import {
  ResearchRunExportSnapshot,
  HistoryExportSnapshot,
  EnrichedHistoryItem,
} from '@/server/export/export.types';
import { HistoryFilterOptions, HistoryQueryResult } from './history.types';
import { AppError } from '@/lib/errors/app-error';

export class ResearchHistoryService {
  constructor(
    private readonly runRepo: ResearchRunRepository = new ResearchRunRepository(),
    private readonly taskRepo: ResearchTaskRepository = new ResearchTaskRepository(),
    private readonly candidateRepo: CandidateResultRepository = new CandidateResultRepository(),
    private readonly evidenceRepo: EvidenceRecordRepository = new EvidenceRecordRepository(),
    private readonly sourceRepo: SourceDocumentRepository = new SourceDocumentRepository(),
    private readonly comparisonRepo: ResearchComparisonRepository = new ResearchComparisonRepository(),
    private readonly changeEventRepo: ChangeEventRepository = new ChangeEventRepository(),
    private readonly scheduleRepo: ResearchScheduleRepository = new ResearchScheduleRepository()
  ) {}

  /**
   * Retrieves paginated, filtered research runs joined with task and schedule metadata.
   */
  async listHistory(
    userId: string,
    filters?: HistoryFilterOptions,
    tx?: TransactionContext | PoolClient
  ): Promise<HistoryQueryResult> {
    const executor = getExecutor(tx);
    const { page, limit, offset } = resolvePagination({
      page: filters?.page ?? 1,
      limit: Math.min(Math.max(filters?.limit ?? 20, 1), 100),
    });

    const conditions: string[] = ['r.user_id = $1'];
    const params: unknown[] = [userId];
    let paramIdx = 2;

    if (filters?.query && filters.query.trim().length > 0) {
      conditions.push(`(t.original_query ILIKE $${paramIdx} OR t.title ILIKE $${paramIdx})`);
      params.push(`%${filters.query.trim()}%`);
      paramIdx++;
    }

    if (filters?.status && filters.status !== 'ALL') {
      conditions.push(`r.status = $${paramIdx}`);
      params.push(filters.status);
      paramIdx++;
    }

    if (filters?.scheduleId) {
      conditions.push(`r.schedule_id = $${paramIdx}`);
      params.push(filters.scheduleId);
      paramIdx++;
    }

    if (filters?.taskType && filters.taskType !== 'ALL') {
      conditions.push(`t.task_type = $${paramIdx}`);
      params.push(filters.taskType);
      paramIdx++;
    }

    if (filters?.fromDate) {
      conditions.push(`r.created_at >= $${paramIdx}`);
      params.push(filters.fromDate);
      paramIdx++;
    }

    if (filters?.toDate) {
      conditions.push(`r.created_at <= $${paramIdx}`);
      params.push(filters.toDate);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count query
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM research_runs r
      JOIN research_tasks t ON r.task_id = t.id
      LEFT JOIN research_schedules s ON r.schedule_id = s.id
      WHERE ${whereClause}
    `;
    const countRes = await executeQuery<{ total: number }>(executor, countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    // 2. Data rows query with stable deterministic sort
    const dataSql = `
      SELECT
        r.id AS run_id,
        r.task_id,
        t.title AS task_title,
        t.original_query,
        t.task_type,
        r.status,
        r.schedule_id,
        s.name AS schedule_name,
        r.stage_counters,
        r.usage,
        r.selected_model,
        r.selected_provider,
        r.execution_duration_ms,
        r.started_at,
        r.completed_at,
        r.created_at,
        (SELECT COUNT(*)::int FROM candidate_results c WHERE c.run_id = r.id) AS candidate_count
      FROM research_runs r
      JOIN research_tasks t ON r.task_id = t.id
      LEFT JOIN research_schedules s ON r.schedule_id = s.id
      WHERE ${whereClause}
      ORDER BY r.created_at DESC, r.id ASC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const dataParams = [...params, limit, offset];
    const dataRes = await executeQuery<{
      run_id: string;
      task_id: string;
      task_title: string;
      original_query: string;
      task_type: string;
      status: string;
      schedule_id: string | null;
      schedule_name: string | null;
      stage_counters: {
        queriesExecuted?: number;
        sourcesDiscovered?: number;
        sourcesExtracted?: number;
        claimsVerified?: number;
      } | null;
      usage: {
        estimatedCostUsd?: string;
      } | null;
      selected_model: string | null;
      selected_provider: string | null;
      execution_duration_ms: number | null;
      started_at: string;
      completed_at: string | null;
      created_at: string;
      candidate_count: number;
    }>(executor, dataSql, dataParams);

    const runs: EnrichedHistoryItem[] = dataRes.rows.map((row) => ({
      runId: row.run_id,
      taskId: row.task_id,
      taskTitle: row.task_title,
      query: row.original_query,
      taskType: row.task_type,
      status: row.status,
      scheduleId: row.schedule_id,
      scheduleName: row.schedule_name,
      queriesExecuted: row.stage_counters?.queriesExecuted ?? 0,
      sourcesDiscovered: row.stage_counters?.sourcesDiscovered ?? 0,
      sourcesExtracted: row.stage_counters?.sourcesExtracted ?? 0,
      claimsVerified: row.stage_counters?.claimsVerified ?? 0,
      candidateCount: Number(row.candidate_count ?? 0),
      selectedModel: row.selected_model,
      selectedProvider: row.selected_provider,
      totalCostUsd: row.usage?.estimatedCostUsd ?? '0.0000',
      durationMs: row.execution_duration_ms,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    }));

    return {
      runs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filtersApplied: filters ?? {},
    };
  }

  /**
   * Resolves a complete, authorized snapshot of a research run for export generation.
   */
  async getRunExportSnapshot(
    runId: string,
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ResearchRunExportSnapshot> {
    const run = await this.runRepo.findById(runId, userId, tx);
    if (!run) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Research run not found or access denied',
        statusCode: 404,
      });
    }

    const task = await this.taskRepo.findById(run.task_id, userId, tx);
    if (!task) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Underlying research task not found or access denied',
        statusCode: 404,
      });
    }

    const [schedule, candidatesRes, evidenceRes, sourcesRes, changes] = await Promise.all([
      run.schedule_id ? this.scheduleRepo.findById(run.schedule_id, userId, tx) : Promise.resolve(null),
      this.candidateRepo.listByRunId(runId, userId, { limit: 1000 }, tx),
      this.evidenceRepo.listByRunId(runId, userId, { limit: 1000 }, tx),
      this.sourceRepo.listByRunId(runId, userId, { limit: 1000 }, tx),
      this.changeEventRepo.listByRunId(runId, userId, tx),
    ]);

    let comparison = null;
    if (changes.length > 0 && changes[0]?.comparison_id) {
      comparison = await this.comparisonRepo.findById(changes[0].comparison_id, userId, tx);
    }

    return {
      run,
      task,
      schedule,
      candidates: candidatesRes.data,
      evidence: evidenceRes.data,
      sources: sourcesRes.data,
      comparison,
      changes,
    };
  }

  /**
   * Resolves an authorized history export snapshot matching the provided filters.
   */
  async getHistoryExportSnapshot(
    userId: string,
    filters?: HistoryFilterOptions,
    maxLimit: number = 500,
    tx?: TransactionContext | PoolClient
  ): Promise<HistoryExportSnapshot> {
    const boundedFilters: HistoryFilterOptions = {
      ...filters,
      page: 1,
      limit: Math.min(maxLimit, 500),
    };

    const result = await this.listHistory(userId, boundedFilters, tx);

    return {
      runs: result.runs,
      totalCount: result.pagination.total,
      filtersApplied: filters ? (filters as unknown as Record<string, unknown>) : undefined,
    };
  }
}
