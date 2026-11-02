import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResearchTaskRepository,
  ResearchRunRepository,
  SourceDocumentRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
  ProviderConfigRepository,
  ResearchScheduleRepository,
  ChangeEventRepository,
  UsageLedgerRepository,
} from '@/server/persistence/repositories';
import {
  RunStatus,
  ScheduleStatus,
  MatchClassification,
} from '@/server/persistence/types';
import { PoolClient } from 'pg';

describe('Cross-User Resource Ownership & Tenant Isolation (Step 24 / AC-04, AC-05, AC-12)', () => {
  const userA = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const userB = 'b1ffcd88-8d1c-3fe7-aa5c-5aa8ac270b22';

  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
  });

  describe('1. Research Tasks Ownership Scoping', () => {
    const taskRepo = new ResearchTaskRepository();

    it('OWN-TASK-001: Denies User B reading User A task by enforcing owner parameter in SQL', async () => {
      // Mock DB: row exists for User A, but query for User B returns 0 rows
      mockClient.query = vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        if (params?.[0] === 'task-owned-by-A' && params?.[1] === userB) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [{ id: 'task-owned-by-A', user_id: userA }] });
      });

      const result = await taskRepo.findById('task-owned-by-A', userB, mockClient as unknown as PoolClient);

      expect(result).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM research_tasks WHERE id = $1 AND user_id = $2',
        ['task-owned-by-A', userB]
      );
    });

    it('OWN-TASK-002: Prevents User B from updating User A task', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const updated = await taskRepo.update(
        'task-owned-by-A',
        { title: 'Hijacked Title' },
        userB,
        mockClient as unknown as PoolClient
      );

      expect(updated).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE research_tasks SET title = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3'),
        ['task-owned-by-A', 'Hijacked Title', userB]
      );
    });

    it('OWN-TASK-003: Prevents User B from deleting User A task', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rowCount: 0 });

      const deleted = await taskRepo.delete('task-owned-by-A', userB, mockClient as unknown as PoolClient);

      expect(deleted).toBe(false);
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM research_tasks WHERE id = $1 AND user_id = $2',
        ['task-owned-by-A', userB]
      );
    });
  });

  describe('2. Research Runs Ownership Scoping', () => {
    const runRepo = new ResearchRunRepository();

    it('OWN-RUN-001: Scopes run detail lookups to owner ID', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const run = await runRepo.findById('run-A', userB, mockClient as unknown as PoolClient);

      expect(run).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM research_runs WHERE id = $1 AND user_id = $2',
        ['run-A', userB]
      );
    });

    it('OWN-RUN-002: Scopes listByTaskId to owner ID preventing run enumeration across tasks', async () => {
      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ total: 0 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const runs = await runRepo.listByTaskId('task-A', userB, undefined, mockClient as unknown as PoolClient);

      expect(runs.data).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*)::int AS total FROM research_runs WHERE task_id = $1 AND user_id = $2',
        ['task-A', userB]
      );
    });

    it('OWN-RUN-003: Prevents User B from cancelling User A active run', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const cancelled = await runRepo.cancel('run-A', 'Unauthorized cancel attempt', userB, mockClient as unknown as PoolClient);

      expect(cancelled).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE research_runs SET status = $2, error_message = $3, updated_at = NOW() WHERE id = $1 AND user_id = $4'),
        ['run-A', RunStatus.CANCELLED, 'Unauthorized cancel attempt', userB]
      );
    });
  });

  describe('3. Source Documents Ownership Scoping', () => {
    const srcRepo = new SourceDocumentRepository();

    it('OWN-SRC-001: Scopes source document lookups to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const src = await srcRepo.findById('src-A', userB, mockClient as unknown as PoolClient);

      expect(src).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM source_documents WHERE id = $1 AND user_id = $2',
        ['src-A', userB]
      );
    });

    it('OWN-SRC-002: Scopes listByRunId to owner', async () => {
      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ total: 0 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const list = await srcRepo.listByRunId('run-A', userB, undefined, mockClient as unknown as PoolClient);

      expect(list.data).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*)::int AS total FROM source_documents WHERE run_id = $1 AND user_id = $2',
        ['run-A', userB]
      );
    });
  });

  describe('4. Candidate Results & Anti-ID Substitution', () => {
    const candRepo = new CandidateResultRepository();

    it('OWN-CAND-001: Scopes candidate lookups to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const cand = await candRepo.findById('cand-A', userB, mockClient as unknown as PoolClient);

      expect(cand).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM candidate_results WHERE id = $1 AND user_id = $2',
        ['cand-A', userB]
      );
    });

    it('OWN-CAND-002: Rejects ID substitution attack linking User A evidence to User B candidate', async () => {
      // Mock transaction queries:
      // 1. Candidate insert succeeds
      // 2. Evidence record ownership check detects evidence belongs to userA, not userB!
      mockClient.query = vi.fn().mockImplementation((sql: string, _params: unknown[]) => {
        if (sql.includes('INSERT INTO candidate_results')) {
          return Promise.resolve({ rows: [{ id: 'cand-B-1', user_id: userB }] });
        }
        if (sql.includes('SELECT user_id FROM evidence_records WHERE id = $1')) {
          // Evidence record belongs to userA!
          return Promise.resolve({ rows: [{ user_id: userA }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        candRepo.createWithEvidence(
          {
            run_id: 'run-B',
            user_id: userB,
            name: 'Malicious Candidate',
            match_classification: MatchClassification.EXACT_MATCH,
            evidence_links: [
              { evidence_record_id: 'evidence-stolen-from-A' },
            ],
          },
          mockClient as unknown as PoolClient
        )
      ).rejects.toThrow(/ID substitution violation/i);
    });
  });

  describe('5. Evidence Records Ownership Scoping', () => {
    const evidRepo = new EvidenceRecordRepository();

    it('OWN-EVID-001: Scopes evidence findById to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const ev = await evidRepo.findById('evid-A', userB, mockClient as unknown as PoolClient);

      expect(ev).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM evidence_records WHERE id = $1 AND user_id = $2',
        ['evid-A', userB]
      );
    });

    it('OWN-EVID-002: Scopes evidence listBySourceId to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const list = await evidRepo.listBySourceId('src-A', userB, mockClient as unknown as PoolClient);

      expect(list).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE source_document_id = $1 AND user_id = $2'),
        ['src-A', userB]
      );
    });
  });

  describe('6. Provider Configurations Ownership Scoping', () => {
    const providerRepo = new ProviderConfigRepository();

    it('OWN-PROV-001: Scopes provider config lookups to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const cfg = await providerRepo.findById('cfg-A', userB, mockClient as unknown as PoolClient);

      expect(cfg).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM provider_configurations WHERE id = $1 AND user_id = $2',
        ['cfg-A', userB]
      );
    });

    it('OWN-PROV-002: Prevents updating provider configuration of another user', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const updated = await providerRepo.updateStatus('cfg-A', true, true, userB, mockClient as unknown as PoolClient);

      expect(updated).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/WHERE id = \$1\s+AND user_id = \$4/),
        ['cfg-A', true, true, userB]
      );
    });
  });

  describe('7. Research Schedules Ownership Scoping', () => {
    const schedRepo = new ResearchScheduleRepository();

    it('OWN-SCHED-001: Scopes schedule lookups to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const sched = await schedRepo.findById('sched-A', userB, mockClient as unknown as PoolClient);

      expect(sched).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM research_schedules WHERE id = $1 AND user_id = $2',
        ['sched-A', userB]
      );
    });

    it('OWN-SCHED-002: Prevents altering schedule status of another user', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const updated = await schedRepo.updateStatus('sched-A', ScheduleStatus.PAUSED, userB, mockClient as unknown as PoolClient);

      expect(updated).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/WHERE id = \$1\s+AND user_id = \$3/),
        ['sched-A', ScheduleStatus.PAUSED, userB]
      );
    });
  });

  describe('8. Change Events Ownership Scoping', () => {
    const eventRepo = new ChangeEventRepository();

    it('OWN-EVENT-001: Scopes change event findById to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const ev = await eventRepo.findById('event-A', userB, mockClient as unknown as PoolClient);

      expect(ev).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM change_events WHERE id = $1 AND user_id = $2',
        ['event-A', userB]
      );
    });

    it('OWN-EVENT-002: Scopes change event listByTaskId to owner', async () => {
      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ total: 0 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const list = await eventRepo.listByTaskId('task-A', userB, undefined, mockClient as unknown as PoolClient);

      expect(list.data).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*)::int AS total FROM change_events WHERE task_id = $1 AND user_id = $2',
        ['task-A', userB]
      );
    });
  });

  describe('9. Usage Ledger Ownership Scoping', () => {
    const ledgerRepo = new UsageLedgerRepository();

    it('OWN-USAGE-001: Scopes usage ledger run lookups to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [] });

      const entries = await ledgerRepo.listByRunId('run-A', userB, mockClient as unknown as PoolClient);

      expect(entries).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE run_id = $1 AND user_id = $2'),
        ['run-A', userB]
      );
    });

    it('OWN-USAGE-002: Scopes cost aggregation by task to owner', async () => {
      mockClient.query = vi.fn().mockResolvedValue({ rows: [{ total_cost_usd: '0.000000', total_tokens: 0 }] });

      const result = await ledgerRepo.getAggregatedCostByTask('task-A', userB, mockClient as unknown as PoolClient);

      expect(result.totalCostUsd).toBe('0.000000');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE task_id = $1 AND user_id = $2'),
        ['task-A', userB]
      );
    });
  });
});
