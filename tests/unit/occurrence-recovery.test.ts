import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResearchRecoveryService } from '@/server/worker/research-recovery.service';
import { ResearchWorker } from '@/server/worker/research-worker';
import {
  ResearchRunRepository,
  ProgressEventRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { IResearchJobQueue } from '@/server/queue/queue.types';
import { OccurrenceStatus, RunStatus } from '@/server/persistence/types';
import { ResearchPipelineOrchestrator } from '@/server/research/orchestration/research-pipeline-orchestrator';

describe('Occurrence Recovery & Worker Lifecycle Synchronization (Step 47)', () => {
  let mockQueue: IResearchJobQueue;
  let mockRunRepo: ResearchRunRepository;
  let mockProgressRepo: ProgressEventRepository;
  let mockOccurrenceRepo: ScheduleOccurrenceRepository;
  let recoveryService: ResearchRecoveryService;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockQueue = {
      enqueue: vi.fn(),
      claimNextJob: vi.fn(),
      ackJob: vi.fn(),
      failJob: vi.fn(),
      cancelJob: vi.fn(),
      renewLease: vi.fn(),
      getMetrics: vi.fn(),
      scheduleRetry: vi.fn(),
      getExpiredProcessingJobs: vi.fn().mockResolvedValue([]),
      getJobByRunId: vi.fn(),
    };

    mockRunRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as ResearchRunRepository;

    mockProgressRepo = {
      create: vi.fn(),
    } as unknown as ProgressEventRepository;

    mockOccurrenceRepo = {
      findStuckDispatching: vi.fn().mockResolvedValue([]),
      findUnsynchronizedTerminalRuns: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue({ id: 'occ-123' }),
      findById: vi.fn(),
    } as unknown as ScheduleOccurrenceRepository;

    recoveryService = new ResearchRecoveryService({
      queue: mockQueue,
      runRepo: mockRunRepo,
      progressRepo: mockProgressRepo,
      occurrenceRepo: mockOccurrenceRepo,
    });
  });

  describe('1. Reconciling Stuck DISPATCHING Occurrences', () => {
    it('REC-001: Advances occurrence to DISPATCHED if queue_job_id was recorded', async () => {
      const stuckWithJob = {
        id: 'occ-stuck-job',
        schedule_id: 'sched-1',
        user_id: 'user-1',
        status: OccurrenceStatus.DISPATCHING,
        queue_job_id: 'job-123',
        research_run_id: 'run-123',
        scheduled_at: new Date().toISOString(),
        updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      };

      (mockOccurrenceRepo.findStuckDispatching as any).mockResolvedValueOnce([stuckWithJob]);

      const summary = await recoveryService.reconcileOccurrences();

      expect(summary.stuckChecked).toBe(1);
      expect(summary.stuckReconciled).toBe(1);
      expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
        'occ-stuck-job',
        OccurrenceStatus.DISPATCHED
      );
    });

    it('REC-002: Marks occurrence RECONCILIATION_REQUIRED if no queue_job_id recorded', async () => {
      const stuckWithoutJob = {
        id: 'occ-stuck-no-job',
        schedule_id: 'sched-1',
        user_id: 'user-1',
        status: OccurrenceStatus.DISPATCHING,
        queue_job_id: null,
        research_run_id: null,
        scheduled_at: new Date().toISOString(),
        updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      };

      (mockOccurrenceRepo.findStuckDispatching as any).mockResolvedValueOnce([stuckWithoutJob]);

      const summary = await recoveryService.reconcileOccurrences();

      expect(summary.stuckChecked).toBe(1);
      expect(summary.stuckReconciled).toBe(1);
      expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
        'occ-stuck-no-job',
        OccurrenceStatus.RECONCILIATION_REQUIRED,
        expect.objectContaining({
          error_message: expect.stringMatching(/timed out or was interrupted/),
        })
      );
    });
  });

  describe('2. Reconciling Out-of-Sync Terminal Research Runs', () => {
    it('REC-003: Updates occurrence to COMPLETED when linked research run completed', async () => {
      const terminalCompleted = {
        id: 'occ-completed',
        research_run_id: 'run-completed',
        status: OccurrenceStatus.RUNNING,
        run_status: RunStatus.COMPLETED,
        run_error: null,
      };

      (mockOccurrenceRepo.findUnsynchronizedTerminalRuns as any).mockResolvedValueOnce([
        terminalCompleted,
      ]);

      const summary = await recoveryService.reconcileOccurrences();

      expect(summary.terminalChecked).toBe(1);
      expect(summary.terminalReconciled).toBe(1);
      expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
        'occ-completed',
        OccurrenceStatus.COMPLETED,
        expect.objectContaining({ completed_at: expect.any(Date) })
      );
    });

    it('REC-004: Updates occurrence to CANCELLED when linked research run cancelled', async () => {
      const terminalCancelled = {
        id: 'occ-cancelled',
        research_run_id: 'run-cancelled',
        status: OccurrenceStatus.RUNNING,
        run_status: RunStatus.CANCELLED,
        run_error: 'User cancelled run',
      };

      (mockOccurrenceRepo.findUnsynchronizedTerminalRuns as any).mockResolvedValueOnce([
        terminalCancelled,
      ]);

      const summary = await recoveryService.reconcileOccurrences();

      expect(summary.terminalChecked).toBe(1);
      expect(summary.terminalReconciled).toBe(1);
      expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
        'occ-cancelled',
        OccurrenceStatus.CANCELLED,
        expect.objectContaining({
          error_message: 'User cancelled run',
        })
      );
    });
  });

  describe('3. Worker Execution Safeguards', () => {
    it('REC-005: Worker aborts execution if occurrence was cancelled before processing', async () => {
      const claimedJob = {
        id: 'job-123',
        runId: 'run-123',
        taskId: 'task-123',
        userId: 'user-123',
        priority: 0,
        attempts: 1,
        payload: {
          runId: 'run-123',
          taskId: 'task-123',
          userId: 'user-123',
          query: 'test query',
          metadata: { occurrenceId: 'occ-cancelled-id' },
        },
      };

      (mockQueue.claimNextJob as any).mockResolvedValueOnce(claimedJob);
      (mockOccurrenceRepo.findById as any).mockResolvedValueOnce({
        id: 'occ-cancelled-id',
        status: OccurrenceStatus.CANCELLED,
      });

      const mockOrchestrator = {
        execute: vi.fn(),
      } as unknown as ResearchPipelineOrchestrator;

      const worker = new ResearchWorker({
        queue: mockQueue,
        orchestrator: mockOrchestrator,
        occurrenceRepo: mockOccurrenceRepo,
      });

      const processed = await worker.runOnce();

      expect(processed).toBe(true);
      expect(mockOrchestrator.execute).not.toHaveBeenCalled();
      expect(mockQueue.cancelJob).toHaveBeenCalledWith(
        'job-123',
        'run-123',
        'Occurrence was CANCELLED'
      );
    });

    it('REC-006: Worker marks occurrence RUNNING on start and COMPLETED on orchestrator success', async () => {
      const claimedJob = {
        id: 'job-valid',
        runId: 'run-valid',
        taskId: 'task-valid',
        userId: 'user-valid',
        priority: 0,
        attempts: 1,
        payload: {
          runId: 'run-valid',
          taskId: 'task-valid',
          userId: 'user-valid',
          query: 'test valid',
          metadata: { occurrenceId: 'occ-valid-id' },
        },
      };

      (mockQueue.claimNextJob as any).mockResolvedValueOnce(claimedJob);
      (mockOccurrenceRepo.findById as any).mockResolvedValueOnce({
        id: 'occ-valid-id',
        status: OccurrenceStatus.DISPATCHED,
      });

      const mockOrchestrator = {
        execute: vi.fn().mockResolvedValueOnce({ success: true, durationMs: 1500 }),
      } as unknown as ResearchPipelineOrchestrator;

      const worker = new ResearchWorker({
        queue: mockQueue,
        orchestrator: mockOrchestrator,
        occurrenceRepo: mockOccurrenceRepo,
      });

      const processed = await worker.runOnce();

      expect(processed).toBe(true);
      expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
        'occ-valid-id',
        OccurrenceStatus.RUNNING,
        expect.objectContaining({ started_at: expect.any(Date) })
      );
      expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
        'occ-valid-id',
        OccurrenceStatus.COMPLETED,
        expect.objectContaining({ completed_at: expect.any(Date) })
      );
      expect(mockQueue.ackJob).toHaveBeenCalledWith('job-valid', 'run-valid');
    });
  });
});

