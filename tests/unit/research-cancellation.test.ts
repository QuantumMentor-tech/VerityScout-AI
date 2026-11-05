import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as cancelRunRoute } from '@/app/api/research/runs/[runId]/cancel/route';
import { CancellationToken } from '@/server/research/orchestration/cancellation-token';
import { CancellationRequestedError } from '@/server/research/retry/error-classifier';
import { ResearchPipelineOrchestrator } from '@/server/research/orchestration/research-pipeline-orchestrator';
import { RunStatus, RunStage } from '@/server/persistence/types';
import { setResearchJobQueue } from '@/server/queue';
import { InMemoryJobQueueAdapter } from '@/server/queue/in-memory-job-queue';
import * as authModule from '@/server/auth/authorization';
import * as baseRepoModule from '@/server/persistence/repositories/base.repository';
import type { ClaimedResearchJob } from '@/server/queue/queue.types';

describe('Cooperative Cancellation Subsystem', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockRunId = '22222222-2222-4222-a222-222222222222';
  const mockTaskId = '33333333-3333-4333-a333-333333333333';

  let queue: InMemoryJobQueueAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    queue = new InMemoryJobQueueAdapter();
    setResearchJobQueue(queue);

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

  describe('CancellationToken', () => {
    it('CANCEL-001: Correctly triggers via in-memory cancel signal', async () => {
      const token = new CancellationToken(mockRunId);
      expect(await token.isCancellationRequested()).toBe(false);

      token.cancel();
      expect(await token.isCancellationRequested()).toBe(true);

      await expect(token.throwIfCancellationRequested()).rejects.toThrow(
        CancellationRequestedError
      );
    });

    it('CANCEL-002: Detects persistent CANCELLATION_REQUESTED status from database', async () => {
      const mockRunRepo = {
        findById: vi.fn().mockResolvedValue({
          id: mockRunId,
          status: RunStatus.CANCELLATION_REQUESTED,
        }),
      };

      const token = new CancellationToken(mockRunId, mockRunRepo as any);
      expect(await token.isCancellationRequested()).toBe(true);
      await expect(token.throwIfCancellationRequested()).rejects.toThrow(
        CancellationRequestedError
      );
    });
  });

  describe('Pipeline Cooperative Cancellation', () => {
    it('CANCEL-003: Cleanly halts pipeline execution at checkpoint and marks run CANCELLED', async () => {
      let stageCount = 0;
      const mockRunRepo = {
        findById: vi.fn().mockResolvedValue({ id: mockRunId, status: RunStatus.RUNNING }),
        updateStatus: vi.fn().mockImplementation(async (id, status, stage) => {
          stageCount++;
          return { id, status, current_stage: stage };
        }),
        updateCounters: vi.fn().mockResolvedValue({ id: mockRunId }),
      };

      const mockProgressRepo = {
        create: vi.fn().mockResolvedValue({ id: 'ev-1' }),
      };

      const orchestrator = new ResearchPipelineOrchestrator({
        runRepo: mockRunRepo as any,
        progressRepo: mockProgressRepo as any,
        searchProviderId: 'mock_search',
      });

      const token = new CancellationToken(mockRunId, mockRunRepo as any);

      // Pre-cancel token so first checkpoint trips
      token.cancel();

      const claimedJob: ClaimedResearchJob = {
        id: 'job-1',
        runId: mockRunId,
        taskId: mockTaskId,
        userId: mockUserId,
        priority: 0,
        attempts: 1,
        payload: {
          runId: mockRunId,
          taskId: mockTaskId,
          userId: mockUserId,
          query: 'Test query for cancellation',
        },
      };

      const result = await orchestrator.execute(claimedJob, token);

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
        mockRunId,
        RunStatus.CANCELLED,
        expect.anything(),
        expect.objectContaining({ error_message: 'Execution was cancelled by user request' }),
        mockUserId
      );
      expect(mockProgressRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          run_id: mockRunId,
          event_type: 'CANCELLED',
        })
      );
    });

    it('CANCEL-004: Prevents race condition: does not overwrite COMPLETED run with CANCELLED', async () => {
      const mockRunRepo = {
        findById: vi.fn().mockResolvedValue({ id: mockRunId, status: RunStatus.COMPLETED }),
        updateStatus: vi.fn().mockResolvedValue({ id: mockRunId, status: RunStatus.COMPLETED }),
      };

      const mockProgressRepo = {
        create: vi.fn().mockResolvedValue({ id: 'ev-1' }),
      };

      const orchestrator = new ResearchPipelineOrchestrator({
        runRepo: mockRunRepo as any,
        progressRepo: mockProgressRepo as any,
      });

      const token = new CancellationToken(mockRunId, mockRunRepo as any);
      token.cancel();

      const claimedJob: ClaimedResearchJob = {
        id: 'job-1',
        runId: mockRunId,
        taskId: mockTaskId,
        userId: mockUserId,
        priority: 0,
        attempts: 1,
        payload: {
          runId: mockRunId,
          taskId: mockTaskId,
          userId: mockUserId,
          query: 'Test query',
        },
      };

      const result = await orchestrator.execute(claimedJob, token);

      // updateStatus to CANCELLED should NOT have been invoked because findById showed COMPLETED
      expect(mockRunRepo.updateStatus).not.toHaveBeenCalledWith(
        mockRunId,
        RunStatus.CANCELLED,
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
      expect(result.cancelled).toBe(true);
    });
  });

  describe('POST /api/research/runs/[runId]/cancel', () => {
    it('CANCEL-005: Returns 401 when caller is unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/cancel`, {
        method: 'POST',
      });
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await cancelRunRoute(req, context);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });

    it('CANCEL-006: Returns 404 when research run does not exist', async () => {
      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/cancel`, {
        method: 'POST',
      });
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await cancelRunRoute(req, context);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Research run not found');
    });

    it('CANCEL-007: Returns 409 Conflict when attempting to cancel COMPLETED run', async () => {
      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        rows: [
          {
            id: mockRunId,
            user_id: mockUserId,
            status: RunStatus.COMPLETED,
            current_stage: RunStage.FINALIZING,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/cancel`, {
        method: 'POST',
      });
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await cancelRunRoute(req, context);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('Cannot cancel a completed');
    });

    it('CANCEL-008: Cancels QUEUED run immediately in database and queue', async () => {
      await queue.enqueue({
        runId: mockRunId,
        taskId: mockTaskId,
        userId: mockUserId,
        query: 'Queued item to cancel',
      });

      vi.spyOn(baseRepoModule, 'executeQuery')
        // 1. findById
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockRunId,
              user_id: mockUserId,
              status: RunStatus.QUEUED,
              current_stage: RunStage.INITIATED,
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // 2. updateStatus (mark CANCELLED)
        .mockResolvedValueOnce({
          rows: [{ id: mockRunId, status: RunStatus.CANCELLED }],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        })
        // 3. progressRepo.create
        .mockResolvedValueOnce({
          rows: [{ id: 'ev-1', event_type: 'CANCELLED' }],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Accidentally submitted wrong query' }),
      });
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await cancelRunRoute(req, context);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe(RunStatus.CANCELLED);

      // Verify in-memory queue job status was updated
      const job = await queue.getJobByRunId(mockRunId);
      expect(job?.status).toBe('FAILED');
      expect(job?.failure_category).toBe('CANCELLED');
    });

    it('CANCEL-009: Transitions RUNNING run to CANCELLATION_REQUESTED', async () => {
      vi.spyOn(baseRepoModule, 'executeQuery')
        // 1. findById
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockRunId,
              user_id: mockUserId,
              status: RunStatus.RUNNING,
              current_stage: RunStage.SEARCHING,
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // 2. updateStatus (mark CANCELLATION_REQUESTED)
        .mockResolvedValueOnce({
          rows: [{ id: mockRunId, status: RunStatus.CANCELLATION_REQUESTED }],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        })
        // 3. progressRepo.create
        .mockResolvedValueOnce({
          rows: [{ id: 'ev-1', event_type: 'CANCELLATION_REQUESTED' }],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/cancel`, {
        method: 'POST',
      });
      const context = { params: Promise.resolve({ runId: mockRunId }) };

      const res = await cancelRunRoute(req, context);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe(RunStatus.CANCELLATION_REQUESTED);
    });
  });
});

