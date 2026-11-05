import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScheduleLifecycleService } from '@/server/schedules/schedule-lifecycle.service';
import {
  ResearchScheduleRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import * as txModule from '@/server/persistence/transaction';
import { ScheduleStatus, TaskType } from '@/server/persistence/types';
import { AppError } from '@/lib/errors/app-error';

describe('Schedule Lifecycle Controls: Pause, Resume, Edit, Retire (Step 47)', () => {
  let mockScheduleRepo: ResearchScheduleRepository;
  let mockOccurrenceRepo: ScheduleOccurrenceRepository;
  let service: ScheduleLifecycleService;

  const mockScheduleId = '11111111-1111-4111-a111-111111111111';
  const mockUserId = '22222222-2222-4222-a222-222222222222';

  const baseActiveSchedule = {
    id: mockScheduleId,
    task_id: 'task-123',
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
      query: 'MacBook Pro M4 deals',
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
      findById: vi.fn(),
      updateStatus: vi.fn(),
      updateDefinition: vi.fn(),
      retire: vi.fn(),
    } as unknown as ResearchScheduleRepository;

    mockOccurrenceRepo = {
      markPendingAsSkippedForSchedule: vi.fn().mockResolvedValue(1),
      listByScheduleId: vi.fn().mockResolvedValue([]),
      countByScheduleId: vi.fn().mockResolvedValue(0),
    } as unknown as ScheduleOccurrenceRepository;

    service = new ScheduleLifecycleService({
      scheduleRepo: mockScheduleRepo,
      occurrenceRepo: mockOccurrenceRepo,
    });
  });

  describe('1. Pause Operations', () => {
    it('LIFE-001: Successfully pauses an active schedule and skips pending occurrences', async () => {
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(baseActiveSchedule);
      (mockScheduleRepo.updateStatus as any).mockResolvedValueOnce({
        ...baseActiveSchedule,
        status: ScheduleStatus.PAUSED,
      });

      const result = await service.pause(mockScheduleId, mockUserId);

      expect(result.status).toBe(ScheduleStatus.PAUSED);
      expect(mockOccurrenceRepo.markPendingAsSkippedForSchedule).toHaveBeenCalledWith(
        mockScheduleId,
        'Schedule paused by user',
        expect.anything()
      );
      expect(mockScheduleRepo.updateStatus).toHaveBeenCalledWith(
        mockScheduleId,
        ScheduleStatus.PAUSED,
        mockUserId,
        undefined,
        expect.anything()
      );
    });

    it('LIFE-002: Pause is idempotent if schedule is already paused', async () => {
      const pausedSchedule = { ...baseActiveSchedule, status: ScheduleStatus.PAUSED };
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(pausedSchedule);

      const result = await service.pause(mockScheduleId, mockUserId);

      expect(result.status).toBe(ScheduleStatus.PAUSED);
      expect(mockScheduleRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockOccurrenceRepo.markPendingAsSkippedForSchedule).not.toHaveBeenCalled();
    });

    it('LIFE-003: Rejects pausing an archived/retired schedule', async () => {
      const archivedSchedule = { ...baseActiveSchedule, status: ScheduleStatus.ARCHIVED };
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(archivedSchedule);

      await expect(service.pause(mockScheduleId, mockUserId)).rejects.toThrow(
        /Cannot pause an archived or retired schedule/
      );
    });
  });

  describe('2. Resume Operations', () => {
    it('LIFE-004: Resumes paused schedule, recalculates next_run_at, and resets failures', async () => {
      const pausedSchedule = { ...baseActiveSchedule, status: ScheduleStatus.PAUSED };
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(pausedSchedule);
      (mockScheduleRepo.updateStatus as any).mockImplementationOnce(
        async (_id: string, status: any, _userId: any, nextRunAt: any) => ({
          ...pausedSchedule,
          status,
          next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
          consecutive_failures: 0,
        })
      );

      const result = await service.resume(mockScheduleId, mockUserId);

      expect(result.status).toBe(ScheduleStatus.ACTIVE);
      expect(result.next_run_at).toBeDefined();
      expect(mockScheduleRepo.updateStatus).toHaveBeenCalledWith(
        mockScheduleId,
        ScheduleStatus.ACTIVE,
        mockUserId,
        expect.any(Date),
        expect.anything()
      );
    });

    it('LIFE-005: Resume is idempotent if schedule is already active', async () => {
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(baseActiveSchedule);

      const result = await service.resume(mockScheduleId, mockUserId);

      expect(result.status).toBe(ScheduleStatus.ACTIVE);
      expect(mockScheduleRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('LIFE-006: Rejects resuming an archived/retired schedule', async () => {
      const archivedSchedule = { ...baseActiveSchedule, status: ScheduleStatus.ARCHIVED };
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(archivedSchedule);

      await expect(service.resume(mockScheduleId, mockUserId)).rejects.toThrow(
        /Cannot resume an archived or retired schedule/
      );
    });
  });

  describe('3. Edit Operations & Optimistic Concurrency', () => {
    it('LIFE-007: Edits schedule definition, bumps revision, supersedes old planned occurrences, and recomputes next_run_at', async () => {
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(baseActiveSchedule);
      (mockScheduleRepo.updateDefinition as any).mockResolvedValueOnce({
        ...baseActiveSchedule,
        name: 'Updated Mac Monitor',
        revision: 2,
        request_snapshot: {
          query: 'MacBook Pro M4 Max deals',
          taskType: 'PRODUCT_RESEARCH',
        },
      });

      const updated = await service.edit(mockScheduleId, mockUserId, {
        name: 'Updated Mac Monitor',
        query: 'MacBook Pro M4 Max deals',
        expectedRevision: 1,
      });

      expect(updated.revision).toBe(2);
      expect(mockOccurrenceRepo.markPendingAsSkippedForSchedule).toHaveBeenCalledWith(
        mockScheduleId,
        'Superseded by schedule revision 2',
        expect.anything()
      );
      expect(mockScheduleRepo.updateDefinition).toHaveBeenCalledWith(
        mockScheduleId,
        expect.objectContaining({
          name: 'Updated Mac Monitor',
          expectedRevision: 1,
        }),
        expect.anything()
      );
    });

    it('LIFE-008: Throws 409 Conflict when expectedRevision does not match current schedule revision', async () => {
      (mockScheduleRepo.findById as any).mockResolvedValueOnce({
        ...baseActiveSchedule,
        revision: 3,
      });

      await expect(
        service.edit(mockScheduleId, mockUserId, {
          name: 'Conflict Attempt',
          expectedRevision: 2,
        })
      ).rejects.toThrow(/Conflict: Schedule revision mismatch/);

      expect(mockScheduleRepo.updateDefinition).not.toHaveBeenCalled();
    });

    it('LIFE-009: Rejects editing an archived schedule', async () => {
      (mockScheduleRepo.findById as any).mockResolvedValueOnce({
        ...baseActiveSchedule,
        status: ScheduleStatus.ARCHIVED,
      });

      await expect(
        service.edit(mockScheduleId, mockUserId, { name: 'Cannot edit' })
      ).rejects.toThrow(/Cannot edit an archived or retired schedule/);
    });
  });

  describe('4. Retire / Delete Operations', () => {
    it('LIFE-010: Retires schedule, marks planned occurrences SKIPPED, clears next_run_at, preserving history', async () => {
      (mockScheduleRepo.findById as any).mockResolvedValueOnce(baseActiveSchedule);
      (mockScheduleRepo.retire as any).mockResolvedValueOnce({
        ...baseActiveSchedule,
        status: ScheduleStatus.ARCHIVED,
        next_run_at: null,
      });

      const result = await service.retire(mockScheduleId, mockUserId);

      expect(result.status).toBe(ScheduleStatus.ARCHIVED);
      expect(mockOccurrenceRepo.markPendingAsSkippedForSchedule).toHaveBeenCalledWith(
        mockScheduleId,
        'Schedule retired/archived by user',
        expect.anything()
      );
      expect(mockScheduleRepo.retire).toHaveBeenCalledWith(
        mockScheduleId,
        mockUserId,
        expect.anything()
      );
    });

    it('LIFE-011: Retire is idempotent when already retired', async () => {
      (mockScheduleRepo.findById as any).mockResolvedValueOnce({
        ...baseActiveSchedule,
        status: ScheduleStatus.ARCHIVED,
        next_run_at: null,
      });

      const result = await service.retire(mockScheduleId, mockUserId);

      expect(result.status).toBe(ScheduleStatus.ARCHIVED);
      expect(mockScheduleRepo.retire).not.toHaveBeenCalled();
      expect(mockOccurrenceRepo.markPendingAsSkippedForSchedule).not.toHaveBeenCalled();
    });
  });
});

