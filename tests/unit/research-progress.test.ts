import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRunProgressRoute } from '@/app/api/research/runs/[runId]/progress/route';
import { ProgressEventRepository } from '@/server/persistence/repositories/progress-event.repository';
import { ResearchPipelineOrchestrator } from '@/server/research/orchestration/research-pipeline-orchestrator';
import { RunStatus, RunStage } from '@/server/persistence/types';
import * as authModule from '@/server/auth/authorization';
import * as baseRepoModule from '@/server/persistence/repositories/base.repository';
import type { ClaimedResearchJob, ResearchJobPayload } from '@/server/queue/queue.types';

describe('Durable Progress Tracking & Event Audit Trail', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockRunId = '22222222-2222-4222-a222-222222222222';
  const mockTaskId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authModule, 'requireAuthenticatedCaller').mockResolvedValue({
      user: {
        id: mockUserId,
        email: 'researcher@verityscout.com',
        displayName: 'Researcher',
        createdAt: '2026-11-01T00:00:00Z',
      },
      userId: mockUserId,
    });
  });

  describe('ProgressEventRepository', () => {
    it('PROGRESS-001: Appends progress events with automatic incremental sequence numbers', async () => {
      const mockQuery = vi.spyOn(baseRepoModule, 'executeQuery').mockImplementation(async (_client, sql, params) => {
        expect(sql).toContain('INSERT INTO research_progress_events');
        return {
          rows: [
            {
              id: 'event-uuid-1',
              run_id: params?.[0],
              user_id: params?.[1],
              stage: params?.[2],
              event_type: params?.[3],
              sequence_number: 1,
              message: params?.[4],
              metadata: {},
              created_at: '2026-11-05T10:00:00Z',
            },
          ],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        };
      });

      const repo = new ProgressEventRepository();
      const event = await repo.create({
        run_id: mockRunId,
        user_id: mockUserId,
        stage: RunStage.PLANNING,
        event_type: 'STAGE_STARTED',
        message: 'Formulating search query plan',
      });

      expect(mockQuery).toHaveBeenCalled();
      expect(event.id).toBe('event-uuid-1');
      expect(event.sequence_number).toBe(1);
      expect(event.stage).toBe(RunStage.PLANNING);
      expect(event.event_type).toBe('STAGE_STARTED');
    });

    it('PROGRESS-002: Lists progress events strictly ordered by sequence_number ascending', async () => {
      const mockEvents = [
        {
          id: 'ev-1',
          run_id: mockRunId,
          user_id: mockUserId,
          stage: RunStage.PLANNING,
          event_type: 'STAGE_STARTED',
          sequence_number: 1,
          message: 'Planning started',
          metadata: {},
          created_at: '2026-11-05T10:00:01Z',
        },
        {
          id: 'ev-2',
          run_id: mockRunId,
          user_id: mockUserId,
          stage: RunStage.SEARCHING,
          event_type: 'STAGE_STARTED',
          sequence_number: 2,
          message: 'Searching started',
          metadata: {},
          created_at: '2026-11-05T10:00:05Z',
        },
      ];

      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: mockEvents,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const repo = new ProgressEventRepository();
      const events = await repo.listByRunId(mockRunId, mockUserId);

      expect(events).toHaveLength(2);
      expect(events[0]?.sequence_number).toBe(1);
      expect(events[1]?.sequence_number).toBe(2);
    });

    it('PROGRESS-003: Retrieves latest progress event for a run', async () => {
      const latestEvent = {
        id: 'ev-latest',
        run_id: mockRunId,
        user_id: mockUserId,
        stage: RunStage.FINALIZING,
        event_type: 'STAGE_COMPLETED',
        sequence_number: 6,
        message: 'Finalized run',
        metadata: {},
        created_at: '2026-11-05T10:01:00Z',
      };

      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: [latestEvent],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const repo = new ProgressEventRepository();
      const event = await repo.getLatestEvent(mockRunId);

      expect(event).not.toBeNull();
      expect(event?.sequence_number).toBe(6);
      expect(event?.stage).toBe(RunStage.FINALIZING);
    });
  });

  describe('Pipeline Orchestrator Progress Integration', () => {
    it('PROGRESS-004: Emits granular progress events and updates percentage across all pipeline stages', async () => {
      const recordedEvents: any[] = [];
      const updatedStatuses: any[] = [];

      const mockRunRepo = {
        findById: vi.fn().mockResolvedValue({ id: mockRunId, status: RunStatus.RUNNING }),
        updateStatus: vi.fn().mockImplementation(async (id, status, stage, updates) => {
          updatedStatuses.push({ id, status, stage, updates });
          return { id, status, current_stage: stage };
        }),
        updateCounters: vi.fn().mockResolvedValue({ id: mockRunId }),
      };

      const mockProgressRepo = {
        create: vi.fn().mockImplementation(async (input) => {
          recordedEvents.push(input);
          return { id: `event-${recordedEvents.length}`, ...input, sequence_number: recordedEvents.length };
        }),
      };

      const mockCandidateRepo = {
        createWithEvidence: vi.fn().mockResolvedValue({ id: 'cand-1' }),
      };
      const mockSourceDocRepo = {
        upsertOrResolve: vi.fn().mockResolvedValue({ document: { id: 'src-1' }, isNew: true }),
      };

      const orchestrator = new ResearchPipelineOrchestrator({
        runRepo: mockRunRepo as any,
        progressRepo: mockProgressRepo as any,
        candidateRepo: mockCandidateRepo as any,
        sourceDocRepo: mockSourceDocRepo as any,
        searchProviderId: 'mock_search',
      });

      const payload: ResearchJobPayload = {
        runId: mockRunId,
        taskId: mockTaskId,
        userId: mockUserId,
        query: 'Find refurbished ThinkPad T14 AMD',
      };

      const claimedJob: ClaimedResearchJob = {
        id: 'job-1',
        runId: mockRunId,
        taskId: mockTaskId,
        userId: mockUserId,
        priority: 0,
        attempts: 1,
        payload,
      };

      const result = await orchestrator.execute(claimedJob);

      expect(result.success).toBe(true);
      expect(recordedEvents.length).toBeGreaterThanOrEqual(6);

      // Verify progress percent progression
      const planningUpdate = updatedStatuses.find(
        (u) => u.stage === RunStage.PLANNING && u.updates?.progress_percent === 10
      );
      expect(planningUpdate).toBeDefined();

      const searchUpdate = updatedStatuses.find(
        (u) => u.stage === RunStage.SEARCHING && u.updates?.progress_percent === 30
      );
      expect(searchUpdate).toBeDefined();

      const completionUpdate = updatedStatuses.find(
        (u) => u.status === RunStatus.COMPLETED && u.updates?.progress_percent === 100
      );
      expect(completionUpdate).toBeDefined();
    });
  });

  describe('GET /api/research/runs/[runId]/progress', () => {
    it('PROGRESS-005: Returns 401 when unauthenticated caller requests progress', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/progress`);
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await getRunProgressRoute(req, context);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });

    it('PROGRESS-006: Returns 404 when research run is not found', async () => {
      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/progress`);
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await getRunProgressRoute(req, context);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Research run not found');
    });

    it('PROGRESS-007: Returns 200 with durable progress snapshot and audit events', async () => {
      const mockRunRow = {
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        status: RunStatus.RUNNING,
        current_stage: RunStage.EXTRACTING,
        progress_percent: 50,
        stage_counters: { queriesExecuted: 2, sourcesDiscovered: 4, sourcesExtracted: 2, claimsVerified: 0 },
        execution_duration_ms: 1200,
        error_message: null,
        cancellation_reason: null,
        started_at: '2026-11-05T10:00:00Z',
        completed_at: null,
      };

      const mockEvents = [
        {
          id: 'ev-1',
          run_id: mockRunId,
          user_id: mockUserId,
          stage: RunStage.PLANNING,
          event_type: 'STAGE_STARTED',
          sequence_number: 1,
          message: 'Planning started',
          metadata: {},
          created_at: '2026-11-05T10:00:01Z',
        },
        {
          id: 'ev-2',
          run_id: mockRunId,
          user_id: mockUserId,
          stage: RunStage.EXTRACTING,
          event_type: 'STAGE_STARTED',
          sequence_number: 2,
          message: 'Extracting started',
          metadata: {},
          created_at: '2026-11-05T10:00:05Z',
        },
      ];

      vi.spyOn(baseRepoModule, 'executeQuery')
        .mockResolvedValueOnce({
          rows: [mockRunRow],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockEvents,
          rowCount: 2,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/progress`);
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await getRunProgressRoute(req, context);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.runId).toBe(mockRunId);
      expect(data.status).toBe(RunStatus.RUNNING);
      expect(data.currentStage).toBe(RunStage.EXTRACTING);
      expect(data.progressPercent).toBe(50);
      expect(data.events).toHaveLength(2);
      expect(data.events[0].sequenceNumber).toBe(1);
      expect(data.events[1].stage).toBe(RunStage.EXTRACTING);
    });
  });
});

