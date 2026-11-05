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

describe('Persistent Server-Side Scheduler & Safe Dispatch', () => {
  let mockScheduleRepo: ResearchScheduleRepository;
  let mockRunRepo: ResearchRunRepository;
  let mockOccurrenceRepo: ScheduleOccurrenceRepository;
  let mockQueue: IResearchJobQueue;
  let scheduler: ResearchSchedulerService;

  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockScheduleId = '22222222-2222-4222-a222-222222222222';
  const mockTaskId = '33333333-3333-4333-a333-333333333333';
  const mockRunId = '44444444-4444-4444-a444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(txModule, 'withTransaction').mockImplementation(async (cb: any) => cb({}));

    mockScheduleRepo = {
      listActiveDue: vi.fn(),
      claimAndAdvance: vi.fn(),
      updateExecution: vi.fn(),
    } as unknown as ResearchScheduleRepository;

    mockOccurrenceRepo = {
      createOrGet: vi.fn().mockImplementation(async (input: any) => ({
        id: 'occ-123',
        schedule_id: input.schedule_id,
        user_id: input.user_id,
        schedule_revision: input.schedule_revision ?? 1,
        idempotency_key: input.idempotency_key ?? 'occ_key',
        scheduled_at: input.scheduled_at,
        status: OccurrenceStatus.PLANNED,
        queue_job_id: null,
        research_run_id: null,
        dispatched_at: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        recovery_metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      updateStatus: vi.fn().mockResolvedValue({ id: 'occ-123' }),
    } as unknown as ScheduleOccurrenceRepository;

    mockRunRepo = {
      create: vi.fn().mockResolvedValue({
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        status: RunStatus.QUEUED,
      }),
    } as unknown as ResearchRunRepository;

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

  it('SCHED-001: Returns 0 dispatched when no schedules are due', async () => {
    (mockScheduleRepo.listActiveDue as any).mockResolvedValueOnce([]);

    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T12:00:00Z'));
    expect(summary.evaluatedCount).toBe(0);
    expect(summary.dispatchedCount).toBe(0);
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  it('SCHED-002: Dispatches due schedule to persistent queue and advances next_run_at', async () => {
    const dueSchedule = {
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
        query: 'NVIDIA RTX 5090 Price Trends',
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

    (mockScheduleRepo.listActiveDue as any).mockResolvedValueOnce([dueSchedule]);
    (mockScheduleRepo.claimAndAdvance as any).mockResolvedValueOnce({
      ...dueSchedule,
      next_run_at: '2026-06-16T09:00:00.000Z',
      last_run_id: mockRunId,
    });

    // Reference time is 2026-06-15 09:30:00Z (schedule was due at 09:00)
    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T09:30:00.000Z'));

    expect(summary.evaluatedCount).toBe(1);
    expect(summary.dispatchedCount).toBe(1);

    // Verify child research run was created with schedule_id
    expect(mockRunRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: mockTaskId,
        user_id: mockUserId,
        status: RunStatus.QUEUED,
        current_stage: RunStage.INITIATED,
        schedule_id: mockScheduleId,
      }),
      expect.anything()
    );

    // Verify persistent queue enqueue
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: mockRunId,
        taskId: mockTaskId,
        userId: mockUserId,
        query: 'NVIDIA RTX 5090 Price Trends',
        metadata: expect.objectContaining({ scheduleId: mockScheduleId }),
      }),
      expect.anything()
    );

    // Verify schedule next_run_at was advanced to June 16
    expect(mockScheduleRepo.claimAndAdvance).toHaveBeenCalledWith(
      mockScheduleId,
      new Date('2026-06-16T09:00:00.000Z'),
      mockRunId,
      expect.anything()
    );
  });

  it('SCHED-003: Safely handles missed executions by dispatching 1 run and advancing into the future', async () => {
    // Schedule was due 3 days ago (e.g. server was offline)
    const overdueSchedule = {
      id: mockScheduleId,
      task_id: mockTaskId,
      user_id: mockUserId,
      name: 'Overdue Task',
      status: ScheduleStatus.ACTIVE,
      cron_expression: '0 9 * * *',
      recurrence_rule: {
        frequency: 'DAILY',
        time: '09:00',
        interval: 1,
      },
      scheduled_time: '09:00',
      request_snapshot: {
        query: 'AMD Ryzen 9 9950X',
        taskType: 'PRODUCT_RESEARCH',
      },
      timezone: 'UTC',
      next_run_at: '2026-06-10T09:00:00.000Z', // 5 days late
      consecutive_failures: 0,
      change_notification_threshold_pct: 2,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      last_run_at: null,
      last_dispatched_at: null,
      last_run_id: null,
    };

    (mockScheduleRepo.listActiveDue as any).mockResolvedValueOnce([overdueSchedule]);

    // Current evaluation time: 2026-06-15 14:00:00Z
    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T14:00:00.000Z'));

    expect(summary.dispatchedCount).toBe(1);

    // Advanced next run should be tomorrow June 16 at 09:00 UTC (not piling up 5 runs)
    expect(mockScheduleRepo.claimAndAdvance).toHaveBeenCalledWith(
      mockScheduleId,
      new Date('2026-06-16T09:00:00.000Z'),
      mockRunId,
      expect.anything()
    );
  });

  it('SCHED-004: Gracefully handles queue enqueue failures without crashing loop', async () => {
    const dueSchedule = {
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
      },
      request_snapshot: {
        query: 'Test Query',
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

    (mockScheduleRepo.listActiveDue as any).mockResolvedValueOnce([dueSchedule]);
    (mockQueue.enqueue as any).mockRejectedValueOnce(new Error('PostgreSQL connection dropped'));

    const summary = await scheduler.evaluateAndDispatchDueSchedules(new Date('2026-06-15T09:30:00.000Z'));

    expect(summary.failedCount).toBe(1);
    expect(summary.dispatchedCount).toBe(0);
    expect(mockScheduleRepo.updateExecution).toHaveBeenCalledWith(
      mockScheduleId,
      expect.any(Date),
      null,
      true
    );
  });
});
