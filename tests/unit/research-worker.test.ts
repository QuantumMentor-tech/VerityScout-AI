import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResearchWorker } from '@/server/worker/research-worker';
import { InMemoryJobQueueAdapter } from '@/server/queue/in-memory-job-queue';
import { ResearchPipelineOrchestrator } from '@/server/research/orchestration/research-pipeline-orchestrator';
import type { ClaimedResearchJob, ResearchJobPayload } from '@/server/queue/queue.types';
import { RunStatus, RunStage } from '@/server/persistence/types';

describe('Research Worker Daemon & Orchestration', () => {
  let queue: InMemoryJobQueueAdapter;
  let mockOrchestrator: Partial<ResearchPipelineOrchestrator>;

  const samplePayload: ResearchJobPayload = {
    runId: '11111111-1111-4111-a111-111111111111',
    taskId: '22222222-2222-4222-a222-222222222222',
    userId: '33333333-3333-4333-a333-333333333333',
    query: 'Find refurbished ThinkPad T14 AMD with 32GB RAM under $700',
    taskType: 'PRODUCT_DISCOVERY',
  };

  beforeEach(() => {
    queue = new InMemoryJobQueueAdapter();
    mockOrchestrator = {
      execute: vi.fn().mockResolvedValue({
        runId: samplePayload.runId,
        success: true,
        durationMs: 1500,
        totalSourcesScanned: 3,
        totalCandidatesFound: 2,
        totalClaimsExtracted: 5,
      }),
    };
  });

  it('WORKER-001: Initializes with generated or supplied worker ID', () => {
    const worker = new ResearchWorker({
      workerId: 'custom-worker-42',
      queue,
      orchestrator: mockOrchestrator as ResearchPipelineOrchestrator,
    });

    expect(worker.workerId).toBe('custom-worker-42');
    expect(worker.active).toBe(false);
  });

  it('WORKER-002: Returns false on runOnce when queue is empty', async () => {
    const worker = new ResearchWorker({
      queue,
      orchestrator: mockOrchestrator as ResearchPipelineOrchestrator,
    });

    const didWork = await worker.runOnce();
    expect(didWork).toBe(false);
    expect(mockOrchestrator.execute).not.toHaveBeenCalled();
  });

  it('WORKER-003: Claims queued job, executes orchestrator, and acknowledges completion', async () => {
    await queue.enqueue(samplePayload);

    const worker = new ResearchWorker({
      queue,
      orchestrator: mockOrchestrator as ResearchPipelineOrchestrator,
    });

    const didWork = await worker.runOnce();
    expect(didWork).toBe(true);
    expect(mockOrchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: samplePayload.runId,
        taskId: samplePayload.taskId,
        userId: samplePayload.userId,
      })
    );

    const metrics = await queue.getMetrics();
    expect(metrics.completed).toBe(1);
    expect(metrics.processing).toBe(0);
    expect(metrics.queued).toBe(0);
  });

  it('WORKER-004: Fails job when orchestrator returns unsuccessful result', async () => {
    (mockOrchestrator.execute as any).mockResolvedValueOnce({
      runId: samplePayload.runId,
      success: false,
      durationMs: 400,
      totalSourcesScanned: 0,
      totalCandidatesFound: 0,
      totalClaimsExtracted: 0,
      error: 'Upstream provider connection timeout',
    });

    await queue.enqueue(samplePayload);

    const worker = new ResearchWorker({
      queue,
      orchestrator: mockOrchestrator as ResearchPipelineOrchestrator,
    });

    const didWork = await worker.runOnce();
    expect(didWork).toBe(true);

    const metrics = await queue.getMetrics();
    expect(metrics.failed).toBe(1);
    expect(metrics.processing).toBe(0);
  });

  it('WORKER-005: Recovers safely without crashing when orchestrator throws unhandled exception', async () => {
    (mockOrchestrator.execute as any).mockRejectedValueOnce(
      new Error('Catastrophic memory limit exceeded')
    );

    await queue.enqueue(samplePayload);

    const worker = new ResearchWorker({
      queue,
      orchestrator: mockOrchestrator as ResearchPipelineOrchestrator,
    });

    const didWork = await worker.runOnce();
    expect(didWork).toBe(false);
  });

  it('WORKER-006: Starts polling and stops cleanly on stop()', async () => {
    const worker = new ResearchWorker({
      pollIntervalMs: 50,
      queue,
      orchestrator: mockOrchestrator as ResearchPipelineOrchestrator,
    });

    worker.start();
    expect(worker.active).toBe(true);

    await worker.stop();
    expect(worker.active).toBe(false);
  });

  it('ORCH-001: ResearchPipelineOrchestrator end-to-end execution updates run stages and persists candidates', async () => {
    const mockRunRepo = {
      updateStatus: vi.fn().mockResolvedValue({ id: samplePayload.runId }),
      updateCounters: vi.fn().mockResolvedValue({ id: samplePayload.runId }),
    };
    const mockCandidateRepo = {
      createWithEvidence: vi.fn().mockResolvedValue({ id: 'cand-1' }),
    };
    const mockSourceDocRepo = {
      upsertOrResolve: vi.fn().mockResolvedValue({ document: { id: 'src-1' }, isNew: true }),
    };
    const mockEvidenceRepo = {
      create: vi.fn().mockResolvedValue({ id: 'ev-1' }),
    };

    const orchestrator = new ResearchPipelineOrchestrator({
      runRepo: mockRunRepo as any,
      candidateRepo: mockCandidateRepo as any,
      sourceDocRepo: mockSourceDocRepo as any,
      evidenceRepo: mockEvidenceRepo as any,
      searchProviderId: 'mock_search',
    });

    const claimedJob: ClaimedResearchJob = {
      id: 'job-1',
      runId: samplePayload.runId,
      taskId: samplePayload.taskId,
      userId: samplePayload.userId,
      priority: 0,
      attempts: 1,
      payload: samplePayload,
    };

    const result = await orchestrator.execute(claimedJob);

    expect(result.success).toBe(true);
    expect(result.runId).toBe(samplePayload.runId);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify stage transitions took place
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      samplePayload.runId,
      RunStatus.RUNNING,
      RunStage.PLANNING,
      undefined,
      samplePayload.userId
    );
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      samplePayload.runId,
      RunStatus.RUNNING,
      RunStage.SEARCHING,
      undefined,
      samplePayload.userId
    );
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      samplePayload.runId,
      RunStatus.RUNNING,
      RunStage.EXTRACTING,
      undefined,
      samplePayload.userId
    );
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      samplePayload.runId,
      RunStatus.RUNNING,
      RunStage.SYNTHESIZING,
      undefined,
      samplePayload.userId
    );
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      samplePayload.runId,
      RunStatus.COMPLETED,
      RunStage.FINALIZING,
      expect.objectContaining({
        progress_percent: 100,
        synthesis: expect.anything(),
      }),
      samplePayload.userId
    );
  });
});

