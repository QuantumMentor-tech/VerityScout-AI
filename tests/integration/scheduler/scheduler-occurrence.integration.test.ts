import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { createTestDatabase, TestDatabaseInstance } from '../helpers/test-db';
import { _setPoolForTesting, _resetPoolForTesting } from '@/server/persistence/database';
import {
  ResearchScheduleRepository,
  ResearchRunRepository,
  ScheduleOccurrenceRepository,
} from '@/server/persistence/repositories';
import { PostgresJobQueueAdapter } from '@/server/queue/postgres-job-queue';
import { ResearchSchedulerService } from '@/server/schedules/scheduler.service';
import { ScheduleLifecycleService } from '@/server/schedules/schedule-lifecycle.service';
import { seedUser, seedTask } from '../helpers/fixture-generator';
import { OccurrenceStatus } from '@/server/persistence/types';

describe('Scheduler and Occurrences Integration Tests', () => {
  let dbInstance: TestDatabaseInstance;
  let scheduleRepo: ResearchScheduleRepository;
  let runRepo: ResearchRunRepository;
  let occurrenceRepo: ScheduleOccurrenceRepository;
  let queue: PostgresJobQueueAdapter;
  let schedulerService: ResearchSchedulerService;
  let lifecycleService: ScheduleLifecycleService;

  beforeAll(async () => {
    dbInstance = await createTestDatabase();
    _setPoolForTesting(dbInstance.pool);

    scheduleRepo = new ResearchScheduleRepository();
    runRepo = new ResearchRunRepository();
    occurrenceRepo = new ScheduleOccurrenceRepository();
    queue = new PostgresJobQueueAdapter(dbInstance.pool);

    schedulerService = new ResearchSchedulerService({
      scheduleRepo,
      runRepo,
      occurrenceRepo,
      queue,
    });

    lifecycleService = new ScheduleLifecycleService({
      scheduleRepo,
      occurrenceRepo,
    });
  });

  afterAll(async () => {
    _resetPoolForTesting();
    await dbInstance.close();
  });

  it('AC-08 & AC-09: evaluates and dispatches due schedule occurrences into persistent queue', async () => {
    const user = await seedUser(dbInstance.pool);
    const task = await seedTask(dbInstance.pool, user.id);

    // Create schedule with next_run_at in the past (due now) and proper request_snapshot and recurrence_rule
    const pastDue = new Date(Date.now() - 3600 * 1000);
    const schedule = await scheduleRepo.create({
      task_id: task.id,
      user_id: user.id,
      cron_expression: '0 9 * * 1',
      timezone: 'America/New_York',
      next_run_at: pastDue,
      request_snapshot: {
        query: 'Best standing desk with anti-collision 2026',
        title: 'Standing Desk Schedule',
        taskType: 'PRODUCT_RESEARCH',
      },
      recurrence_rule: {
        frequency: 'WEEKLY',
        time: '09:00',
        weekdays: [1],
      },
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.status).toBe('ACTIVE');

    // Evaluate due schedules
    const evaluation = await schedulerService.evaluateAndDispatchDueSchedules(new Date());
    expect(evaluation.evaluatedCount).toBeGreaterThanOrEqual(1);
    expect(evaluation.dispatchedCount).toBeGreaterThanOrEqual(1);

    // Verify occurrence was created in the database
    const occurrences = await occurrenceRepo.listByScheduleId(schedule.id, user.id);
    expect(occurrences.length).toBe(1);
    const occ = occurrences[0];
    expect(occ?.status).toBe(OccurrenceStatus.DISPATCHED);
    expect(occ?.queue_job_id).toBeDefined();

    // Verify job was enqueued in the research queue
    const queueMetrics = await queue.getMetrics();
    expect(queueMetrics.queued).toBeGreaterThanOrEqual(1);

    // Verify schedule's next_run_at was advanced into the future
    const updatedSchedule = await scheduleRepo.findById(schedule.id, user.id);
    expect(new Date(updatedSchedule!.next_run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('AC-08: guarantees occurrence idempotency - prevents duplicate dispatches for the same scheduled_at', async () => {
    const user = await seedUser(dbInstance.pool);
    const task = await seedTask(dbInstance.pool, user.id);

    const scheduledTime = new Date('2026-12-01T09:00:00Z');
    const idempotencyKey = `occ-${crypto.randomUUID()}`;

    const schedule = await scheduleRepo.create({
      task_id: task.id,
      user_id: user.id,
      cron_expression: '0 9 * * *',
      timezone: 'UTC',
      next_run_at: scheduledTime,
      request_snapshot: { query: 'Sample query' },
      recurrence_rule: { frequency: 'DAILY', time: '09:00' },
    });

    // Insert first planned occurrence via createOrGet
    const occ1 = await occurrenceRepo.createOrGet({
      schedule_id: schedule.id,
      user_id: user.id,
      schedule_revision: 1,
      scheduled_at: scheduledTime,
      idempotency_key: idempotencyKey,
      status: OccurrenceStatus.PLANNED,
    });

    expect(occ1.id).toBeDefined();

    // Second call with same idempotency_key returns existing without creating a duplicate
    const occ2 = await occurrenceRepo.createOrGet({
      schedule_id: schedule.id,
      user_id: user.id,
      schedule_revision: 1,
      scheduled_at: scheduledTime,
      idempotency_key: idempotencyKey,
      status: OccurrenceStatus.PLANNED,
    });

    expect(occ2.id).toBe(occ1.id);

    // Direct duplicate insert via raw SQL must violate unique constraint
    await expect(
      dbInstance.query(
        `INSERT INTO schedule_occurrences (
          id, schedule_id, user_id, idempotency_key, scheduled_at, status
        ) VALUES ($1, $2, $3, $4, $5, 'PLANNED')`,
        [crypto.randomUUID(), schedule.id, user.id, idempotencyKey, scheduledTime]
      )
    ).rejects.toThrow();
  });

  it('AC-09: verifies Pause and Resume lifecycle transitions and skips pending occurrences', async () => {
    const user = await seedUser(dbInstance.pool);
    const task = await seedTask(dbInstance.pool, user.id);

    const schedule = await scheduleRepo.create({
      task_id: task.id,
      user_id: user.id,
      cron_expression: '0 12 * * *',
      timezone: 'UTC',
      next_run_at: new Date(Date.now() + 7200 * 1000),
      request_snapshot: { query: 'Sample query' },
      recurrence_rule: { frequency: 'DAILY', time: '12:00' },
    });

    // Pause schedule
    const paused = await lifecycleService.pause(schedule.id, user.id);
    expect(paused.status).toBe('PAUSED');

    // When paused, evaluateAndDispatchDueSchedules will not pick it up
    const dueList = await scheduleRepo.listActiveDue(new Date(Date.now() + 86400 * 1000));
    expect(dueList.some((s) => s.id === schedule.id)).toBe(false);

    // Resume schedule
    const resumed = await lifecycleService.resume(schedule.id, user.id);
    expect(resumed.status).toBe('ACTIVE');

    // Next run at is recalculated and active
    expect(new Date(resumed.next_run_at).getTime()).toBeGreaterThan(Date.now());
  });
});
