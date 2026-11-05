import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResearchSchedulerService } from '@/server/schedules/scheduler.service';
import {
  ResearchScheduleRepository,
  ResearchRunRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { IResearchJobQueue } from '@/server/queue/queue.types';
import * as txModule from '@/server/persistence/transaction';
import { ScheduleStatus, RunStatus, RunStage, OccurrenceStatus } from '@/server/persistence/types';

describe('Scheduler Idempotent Occurrence Dispatch (Step 47)', () => {
  let mockScheduleRepo: ResearchScheduleRepository;
  let mockRunRepo: ResearchRunRepository;
  let mockOccurrenceRepo: ScheduleOccurrenceRepository;
  let mockQueue: IResearchJobQueue;
  let scheduler: ResearchSchedulerService;

  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockScheduleId = '22222222-2222-4222-a222-222222222222';
  const mockTaskId = '33333333-3333-4333-a333-333333333333';
  const mockRunId = '44444444-4444-4444-a444-444444444444';

  const baseDueSchedule = {
    id: mockScheduleId,
    task_id: mockTaskId,
    user_id: mockUserId,
    name: 'Daily Research',
    revision: 1,
    status: ScheduleStatus.ACTIVE,
    cron_expression: '0 9 * * *',
    recurrence_rule: {
      frequency: 'DAILY',
      time: '09:00',
      interval: 1,
    },
    scheduled_time: '09:00',
    request_snapshot: {
      query: 'RTX 5090 pricing',
      taskType: 'PRODUCT_RESEARCH',
    },
    timezone: 'UTC',
    next_run_at: '2026-06-15T09:00:00.000Z',
    consecutive_failures: 0,
    change_notification_threshold_pct: 2,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    last_run_at: null,
    last_dispatched_at: null,
    last_run_id: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(txModule, 'withTransaction').mockImplementation(async (cb: any) => cb({}));

    mockScheduleRepo = {
      listActiveDue: vi.fn().mockResolvedValue([baseDueSchedule]),
      claimAndAdvance: vi.fn().mockResolvedValue({ ...baseDueSchedule, next_run_at: '2026-06-16T09:00:00.000Z' }),
      updateExecution: vi.fn(),
    } as unknown as ResearchScheduleRepository;

    mockRunRepo = {
      create: vi.fn().mockResolvedValue({
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        status: RunStatus.QUEUED,
        current_stage: RunStage.INITIATED,
      }),
    } as unknown as ResearchRunRepository;

    mockOccurrenceRepo = {
      createOrGet: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue({ id: 'occ-123' }),
    } as unknown as ScheduleOccurrenceRepository;

    mockQueue = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      claimNextJob: vi.fn(),
      ackJob: vi.fn(),
      failJob: vi.fn(),
      cancelJob: vi.fn(),
      renewLease: vi.fn(),
      getMetrics: vi.fn(),
      scheduleRetry: vi.fn(),
      getExpiredProcessingJobs: vi.fn(),
      getJobByRunId: vi.fn(),
    };

    scheduler = new ResearchSchedulerService({
      scheduleRepo: mockScheduleRepo,
      runRepo: mockRunRepo,
      occurrenceRepo: mockOccurrenceRepo,
      queue: mockQueue,
    });
  });

  it('IDEM-001: Dispatches new PLANNED occurrence, links run and job, and advances schedule', async () => {
    (mockOccurrenceRepo.createOrGet as any).mockResolvedValueOnce({
      id: 'occ-fresh',
      schedule_id: mockScheduleId,
      status: OccurrenceStatus.PLANNED,
    });

    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T09:00:00.000Z'));

    expect(summary.evaluatedCount).toBe(1);
    expect(summary.dispatchedCount).toBe(1);
    expect(mockOccurrenceRepo.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({
        schedule_id: mockScheduleId,
        status: OccurrenceStatus.PLANNED,
      })
    );
    expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith('occ-fresh', OccurrenceStatus.DISPATCHING);
    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
      'occ-fresh',
      OccurrenceStatus.DISPATCHED,
      expect.objectContaining({
        research_run_id: mockRunId,
        queue_job_id: 'job-123',
      }),
      expect.anything()
    );
    expect(mockScheduleRepo.claimAndAdvance).toHaveBeenCalledWith(
      mockScheduleId,
      expect.any(Date),
      mockRunId,
      expect.anything()
    );
  });

  it('IDEM-002: Does not create duplicate run if occurrence was already DISPATCHED', async () => {
    (mockOccurrenceRepo.createOrGet as any).mockResolvedValueOnce({
      id: 'occ-already-dispatched',
      schedule_id: mockScheduleId,
      status: OccurrenceStatus.DISPATCHED,
      research_run_id: 'prior-run-id',
    });

    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T09:00:00.000Z'));

    expect(summary.evaluatedCount).toBe(1);
    expect(summary.dispatchedCount).toBe(0);
    expect(summary.skippedCount).toBe(1);
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
    expect(mockRunRepo.create).not.toHaveBeenCalled();
    expect(mockScheduleRepo.claimAndAdvance).toHaveBeenCalledWith(
      mockScheduleId,
      expect.any(Date),
      'prior-run-id'
    );
  });

  it('IDEM-003: Advances schedule without queue dispatch if occurrence was SKIPPED', async () => {
    (mockOccurrenceRepo.createOrGet as any).mockResolvedValueOnce({
      id: 'occ-skipped',
      schedule_id: mockScheduleId,
      status: OccurrenceStatus.SKIPPED,
    });

    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T09:00:00.000Z'));

    expect(summary.evaluatedCount).toBe(1);
    expect(summary.dispatchedCount).toBe(0);
    expect(summary.skippedCount).toBe(1);
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
    expect(mockScheduleRepo.claimAndAdvance).toHaveBeenCalled();
  });

  it('IDEM-004: Marks occurrence RECONCILIATION_REQUIRED when persistent enqueue fails', async () => {
    (mockOccurrenceRepo.createOrGet as any).mockResolvedValueOnce({
      id: 'occ-fail',
      schedule_id: mockScheduleId,
      status: OccurrenceStatus.PLANNED,
    });

    (mockQueue.enqueue as any).mockRejectedValueOnce(new Error('Persistent queue unavailable'));

    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T09:00:00.000Z'));

    expect(summary.evaluatedCount).toBe(1);
    expect(summary.dispatchedCount).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(mockOccurrenceRepo.updateStatus).toHaveBeenCalledWith(
      'occ-fail',
      OccurrenceStatus.RECONCILIATION_REQUIRED,
      expect.objectContaining({
        error_message: expect.stringMatching(/Persistent queue unavailable/),
      })
    );
  });
});

