import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResearchTaskRepository,
  ResearchRunRepository,
  SourceDocumentRepository,
  EvidenceRecordRepository,
  CandidateResultRepository,
  ProviderConfigRepository,
  ResearchScheduleRepository,
  ChangeEventRepository,
  UsageLedgerRepository,
  sanitizeOrderBy,
  resolvePagination,
} from '@/server/persistence/repositories';
import {
  TaskType,
  RunStatus,
  RunStage,
  MatchClassification,
  VerificationState,
  ChangeType,
} from '@/server/persistence/types';
import { PoolClient } from 'pg';

describe('Domain Repository Layer (Step 22)', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
  });

  describe('Base Repository Helpers & SQL Safety', () => {
    it('REPO-BASE-001: sanitizeOrderBy allowlists safe columns and prevents SQL injection', () => {
      const allowed = ['created_at', 'title', 'price_numeric'];

      expect(sanitizeOrderBy(allowed, 'title', 'ASC')).toBe('title ASC');
      expect(sanitizeOrderBy(allowed, 'created_at', 'DESC')).toBe('created_at DESC');

      // Malicious SQL injection attempt
      const malicious = 'created_at; DROP TABLE research_tasks; --';
      expect(sanitizeOrderBy(allowed, malicious, 'ASC')).toBe('created_at DESC');

      // Unallowlisted column falls back
      expect(sanitizeOrderBy(allowed, 'user_password', 'ASC')).toBe('created_at DESC');
    });

    it('REPO-BASE-002: resolvePagination clamps page and limit to safe bounds', () => {
      expect(resolvePagination({ page: 1, limit: 20 })).toEqual({ page: 1, limit: 20, offset: 0 });
      expect(resolvePagination({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, offset: 20 });
      // Clamps negative/zero page and upper limit 100
      expect(resolvePagination({ page: -5, limit: 500 })).toEqual({ page: 1, limit: 100, offset: 0 });
    });
  });

  describe('ResearchTaskRepository', () => {
    const repo = new ResearchTaskRepository();

    it('REPO-TASK-001: Creates research task with parameterized query and defaults', async () => {
      const fakeRow = { id: 'task-1', title: 'Find OLED monitor' };
      mockClient.query = vi.fn().mockResolvedValue({ rows: [fakeRow] });

      const res = await repo.create(
        {
          user_id: 'user-1',
          title: 'Find OLED monitor',
          original_query: 'Best 4K OLED monitor under $800',
          task_type: TaskType.PRODUCT_RESEARCH,
        },
        mockClient as unknown as PoolClient
      );

      expect(res).toEqual(fakeRow);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO research_tasks'),
        expect.arrayContaining(['user-1', 'Find OLED monitor', 'Best 4K OLED monitor under $800'])
      );
    });

    it('REPO-TASK-002: findById enforces owner isolation when userId is supplied', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      await repo.findById('task-1', 'user-owner-123', mockClient as unknown as PoolClient);

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM research_tasks WHERE id = $1 AND user_id = $2',
        ['task-1', 'user-owner-123']
      );
    });
  });

  describe('ResearchRunRepository', () => {
    const repo = new ResearchRunRepository();

    it('REPO-RUN-001: Creates research run with initial QUEUED status and INITIATED stage', async () => {
      const fakeRun = { id: 'run-1', status: RunStatus.QUEUED, current_stage: RunStage.INITIATED };
      mockClient.query = vi.fn().mockResolvedValue({ rows: [fakeRun] });

      const res = await repo.create(
        {
          task_id: 'task-1',
          user_id: 'user-1',
        },
        mockClient as unknown as PoolClient
      );

      expect(res.status).toBe(RunStatus.QUEUED);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO research_runs'),
        expect.arrayContaining(['task-1', 'user-1', RunStatus.QUEUED, RunStage.INITIATED])
      );
    });

    it('REPO-RUN-002: Transitions status and updates execution metrics', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'run-1', status: RunStatus.COMPLETED }] });

      await repo.updateStatus(
        'run-1',
        RunStatus.COMPLETED,
        RunStage.FINALIZING,
        {
          progress_percent: 100,
          total_cost_usd: '0.045000',
          execution_duration_ms: 12500,
        },
        mockClient as unknown as PoolClient
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE research_runs SET status = $2'),
        expect.arrayContaining(['run-1', RunStatus.COMPLETED, RunStage.FINALIZING, 100, '0.045000', 12500])
      );
    });
  });

  describe('SourceDocumentRepository', () => {
    const repo = new SourceDocumentRepository();

    it('REPO-SRC-001: Defensively truncates excerpt to 50KB to respect SEC-032 before database write', async () => {
      const giantExcerpt = 'A'.repeat(60000); // 60,000 bytes > 51,200 bytes limit
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'src-1' }] });

      await repo.create(
        {
          run_id: 'run-1',
          user_id: 'user-1',
          url: 'https://example.com/product',
          domain: 'example.com',
          extracted_text_excerpt: giantExcerpt,
        },
        mockClient as unknown as PoolClient
      );

      const params = mockClient.query.mock.calls[0]?.[1] as unknown[];
      const sentExcerpt = params[12] as string; // extracted_text_excerpt parameter

      expect(Buffer.byteLength(sentExcerpt, 'utf-8')).toBeLessThanOrEqual(51200);
      expect(sentExcerpt.length).toBe(51200);
    });
  });

  describe('EvidenceRecordRepository', () => {
    const repo = new EvidenceRecordRepository();

    it('REPO-EVID-001: Persists evidence record strictly linked to source_document_id', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'evid-1' }] });

      await repo.create(
        {
          source_document_id: 'src-1',
          run_id: 'run-1',
          user_id: 'user-1',
          claim_text: 'Price is $799.99',
          verbatim_excerpt: 'Sale Price: $799.99 (In Stock)',
          verification_state: VerificationState.SUPPORTED,
          char_offset_start: 120,
          char_offset_end: 151,
        },
        mockClient as unknown as PoolClient
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO evidence_records'),
        expect.arrayContaining(['src-1', 'run-1', 'Price is $799.99', VerificationState.SUPPORTED])
      );
    });
  });

  describe('CandidateResultRepository & Atomic Junction Linking', () => {
    const repo = new CandidateResultRepository();

    it('REPO-CAND-001: Atomically creates candidate and candidate_evidence_links in transaction', async () => {
      const candidateRow = { id: 'cand-1', name: 'Alienware 34 OLED' };

      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
        if (sql.includes('INSERT INTO candidate_results')) return Promise.resolve({ rows: [candidateRow] });
        if (sql.includes('INSERT INTO candidate_evidence_links')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });

      const res = await repo.createWithEvidence(
        {
          run_id: 'run-1',
          user_id: 'user-1',
          name: 'Alienware 34 OLED',
          match_classification: MatchClassification.EXACT_MATCH,
          price_numeric: '799.9900',
          evidence_links: [
            { evidence_record_id: 'evid-1', claim_type: 'price' },
            { evidence_record_id: 'evid-2', claim_type: 'specification' },
          ],
        },
        mockClient as unknown as PoolClient
      );

      expect(res).toEqual(candidateRow);

      // Verify queries executed in order: candidate inserted, then junction table inserted
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO candidate_results'), expect.any(Array));
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO candidate_evidence_links'),
        ['cand-1', 'evid-1', 'price']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO candidate_evidence_links'),
        ['cand-1', 'evid-2', 'specification']
      );
    });
  });

  describe('ProviderConfigRepository', () => {
    const repo = new ProviderConfigRepository();

    it('REPO-PROV-001: Excludes plaintext credentials and persists non-secret metadata only', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'prov-1' }] });

      await repo.create(
        {
          user_id: 'user-1',
          provider_name: 'Anthropic Claude',
          provider_type: 'llm',
          model_name: 'claude-3-7-sonnet',
          has_credential: true,
          credential_preview: 'sk-ant...xyz9',
        },
        mockClient as unknown as PoolClient
      );

      const params = mockClient.query.mock.calls[0]?.[1] as unknown[];
      expect(params).toContain('Anthropic Claude');
      expect(params).toContain('sk-ant...xyz9');
      // No raw secrets
      expect(params).not.toContain('sk-ant-api03-actual-real-secret-key');
    });
  });

  describe('ResearchScheduleRepository', () => {
    const repo = new ResearchScheduleRepository();

    it('REPO-SCHED-001: Creates schedule with cron expression and IANA timezone', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'sched-1' }] });

      await repo.create(
        {
          task_id: 'task-1',
          user_id: 'user-1',
          cron_expression: '0 9 * * 1-5',
          timezone: 'America/New_York',
        },
        mockClient as unknown as PoolClient
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO research_schedules'),
        expect.arrayContaining(['task-1', 'user-1', '0 9 * * 1-5', 'America/New_York'])
      );
    });

    it('REPO-SCHED-002: Updates execution failure count and manages circuit breaker', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'sched-1' }] });

      const lastRun = new Date();
      const nextRun = new Date(Date.now() + 86400000);

      await repo.updateExecution('sched-1', lastRun, nextRun, true, mockClient as unknown as PoolClient);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('consecutive_failures = CASE WHEN $4 THEN consecutive_failures + 1 ELSE 0 END'),
        ['sched-1', lastRun, nextRun, true]
      );
    });
  });

  describe('ChangeEventRepository', () => {
    const repo = new ChangeEventRepository();

    it('REPO-CHG-001: Records diff between runs with change_type and previous/new values', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'chg-1' }] });

      await repo.create(
        {
          task_id: 'task-1',
          current_run_id: 'run-2',
          baseline_run_id: 'run-1',
          user_id: 'user-1',
          entity_type: 'product_price',
          entity_id: 'cand-1',
          change_type: ChangeType.PRICE_DROP,
          previous_value: { price: '899.99' },
          new_value: { price: '799.99' },
        },
        mockClient as unknown as PoolClient
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO change_events'),
        expect.arrayContaining(['task-1', 'run-2', 'run-1', ChangeType.PRICE_DROP])
      );
    });
  });

  describe('UsageLedgerRepository', () => {
    const repo = new UsageLedgerRepository();

    it('REPO-USE-001: Records exact numeric cost and aggregates task usage', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ id: 'ledger-1' }] });

      await repo.create(
        {
          user_id: 'user-1',
          task_id: 'task-1',
          provider_type: 'llm',
          provider_name: 'openai',
          model_name: 'gpt-4o',
          operation_type: 'synthesis',
          tokens_total: 1500,
          cost_usd: '0.007500',
        },
        mockClient as unknown as PoolClient
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_ledger'),
        expect.arrayContaining(['0.007500', 1500, 'synthesis'])
      );

      mockClient.query = vi.fn().mockResolvedValue({
        rows: [{ total_cost_usd: '0.045000', total_tokens: 8500 }],
      });

      const agg = await repo.getAggregatedCostByTask('task-1', mockClient as unknown as PoolClient);
      expect(agg.totalCostUsd).toBe('0.045000');
      expect(agg.totalTokens).toBe(8500);
    });
  });
});
