import { describe, it, expect } from 'vitest';
import { BaselineSelector } from '@/server/changes/baseline-selector';
import { ResearchRunRow, RunStatus, RunStage } from '@/server/persistence/types';

describe('BaselineSelector', () => {
  const selector = new BaselineSelector();

  const mockRun = (overrides: Partial<ResearchRunRow>): ResearchRunRow => ({
    id: 'run-current',
    task_id: 'task-1',
    user_id: 'user-1',
    schedule_id: 'sched-1',
    idempotency_key: 'idem-1',
    status: RunStatus.COMPLETED,
    current_stage: RunStage.FINALIZING,
    stage_counters: {
      queriesExecuted: 1,
      sourcesDiscovered: 5,
      sourcesExtracted: 5,
      claimsVerified: 10,
    },
    usage: {
      promptTokens: 100,
      completionTokens: 200,
      searchCredits: 1,
      estimatedCostUsd: '0.05',
    },
    selected_provider: 'openai',
    selected_model: 'gpt-4o',
    error_message: null,
    cancellation_reason: null,
    started_at: '2026-11-06T08:00:00.000Z',
    completed_at: '2026-11-06T08:05:00.000Z',
    ...overrides,
  });

  describe('selectBaseline', () => {
    it('returns null when there are no candidate prior runs (first run establishes baseline)', async () => {
      const currentRun = mockRun({ id: 'run-first' });
      const baseline = await selector.selectBaseline({
        currentRun,
        candidateRuns: [],
        scheduleId: 'sched-1',
        userId: 'user-1',
      });

      expect(baseline).toBeNull();
    });

    it('selects the most recently completed eligible prior run', async () => {
      const currentRun = mockRun({
        id: 'run-current',
        started_at: '2026-11-06T10:00:00.000Z',
      });

      const olderRun = mockRun({
        id: 'run-older',
        completed_at: '2026-11-05T08:00:00.000Z',
        started_at: '2026-11-05T07:55:00.000Z',
      });

      const recentRun = mockRun({
        id: 'run-recent',
        completed_at: '2026-11-06T08:00:00.000Z',
        started_at: '2026-11-06T07:55:00.000Z',
      });

      const baseline = await selector.selectBaseline({
        currentRun,
        candidateRuns: [olderRun, recentRun],
        scheduleId: 'sched-1',
        userId: 'user-1',
      });

      expect(baseline).not.toBeNull();
      expect(baseline?.id).toBe('run-recent');
    });

    it('excludes FAILED, CANCELLED, and active runs from baseline eligibility', async () => {
      const currentRun = mockRun({ id: 'run-current' });

      const failedRun = mockRun({
        id: 'run-failed',
        status: RunStatus.FAILED,
        completed_at: '2026-11-06T09:00:00.000Z',
      });

      const cancelledRun = mockRun({
        id: 'run-cancelled',
        status: RunStatus.CANCELLED,
        completed_at: '2026-11-06T09:05:00.000Z',
      });

      const runningRun = mockRun({
        id: 'run-running',
        status: RunStatus.RUNNING,
        completed_at: null,
      });

      const validOlderRun = mockRun({
        id: 'run-valid',
        status: RunStatus.COMPLETED,
        completed_at: '2026-11-06T07:00:00.000Z',
      });

      const baseline = await selector.selectBaseline({
        currentRun,
        candidateRuns: [failedRun, cancelledRun, runningRun, validOlderRun],
        scheduleId: 'sched-1',
        userId: 'user-1',
      });

      expect(baseline).not.toBeNull();
      expect(baseline?.id).toBe('run-valid');
    });

    it('excludes runs that belong to a different user', async () => {
      const currentRun = mockRun({ id: 'run-current', user_id: 'user-1' });
      const otherUserRun = mockRun({
        id: 'run-other-user',
        user_id: 'user-2',
        completed_at: '2026-11-06T09:00:00.000Z',
      });

      const baseline = await selector.selectBaseline({
        currentRun,
        candidateRuns: [otherUserRun],
        scheduleId: 'sched-1',
        userId: 'user-1',
      });

      expect(baseline).toBeNull();
    });
  });

  describe('checkScopeCompatibility', () => {
    it('declares compatible when runs share task and identical scope', async () => {
      const baseline = mockRun({ id: 'run-base', task_id: 'task-1' });
      const current = mockRun({ id: 'run-curr', task_id: 'task-1' });

      const result = await selector.checkScopeCompatibility(baseline, current);
      expect(result.compatible).toBe(true);
      expect(result.reasonCode).toBeUndefined();
    });

    it('flags incompatibility when synthesis queries materially differ', async () => {
      const baseline = mockRun({
        id: 'run-base',
        synthesis: { query: 'macbook pro 14 inch m3 16gb' },
      });
      const current = mockRun({
        id: 'run-curr',
        synthesis: { query: 'thinkpad x1 carbon gen 12' },
      });

      const result = await selector.checkScopeCompatibility(baseline, current);
      expect(result.compatible).toBe(false);
      expect(result.reasonCode).toBe('QUERY_SCOPE_CHANGED');
    });
  });
});
