import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { createTestDatabase, TestDatabaseInstance } from '../helpers/test-db';
import { _setPoolForTesting, _resetPoolForTesting } from '@/server/persistence/database';
import {
  ResearchTaskRepository,
  ResearchRunRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
  NotificationRepository,
} from '@/server/persistence/repositories';
import { TaskType, RunStatus, RunStage } from '@/server/persistence/types';
import { seedUser, seedTask, seedRun } from '../helpers/fixture-generator';
import { withTransaction } from '@/server/persistence/transaction';

describe('Repositories, Transactions, and Multi-Tenant Isolation Integration Tests', () => {
  let dbInstance: TestDatabaseInstance;
  let taskRepo: ResearchTaskRepository;
  let runRepo: ResearchRunRepository;
  let candidateRepo: CandidateResultRepository;
  let evidenceRepo: EvidenceRecordRepository;
  let notifRepo: NotificationRepository;

  beforeAll(async () => {
    dbInstance = await createTestDatabase();
    _setPoolForTesting(dbInstance.pool);
    taskRepo = new ResearchTaskRepository();
    runRepo = new ResearchRunRepository();
    candidateRepo = new CandidateResultRepository();
    evidenceRepo = new EvidenceRecordRepository();
    notifRepo = new NotificationRepository();
  });

  afterAll(async () => {
    _resetPoolForTesting();
    await dbInstance.close();
  });

  it('AC-03: verifies ResearchTaskRepository CRUD lifecycle', async () => {
    const user = await seedUser(dbInstance.pool);

    // Create
    const created = await taskRepo.create({
      user_id: user.id,
      title: 'Ergonomic Chair Review',
      original_query: 'Best ergonomic mesh chair with adjustable lumbar support',
      task_type: TaskType.PRODUCT_RESEARCH,
      constraints: { budget: 500 },
      limits: { maxSources: 8 },
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe('Ergonomic Chair Review');
    expect(created.user_id).toBe(user.id);

    // Read by ID
    const fetched = await taskRepo.findById(created.id, user.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Ergonomic Chair Review');

    // Update
    const updated = await taskRepo.update(
      created.id,
      { title: 'Updated Chair Review 2026' },
      user.id
    );
    expect(updated?.title).toBe('Updated Chair Review 2026');

    // Soft delete / Archive
    const archived = await taskRepo.archive(created.id, user.id);
    expect(archived).toBe(true);

    const recheck = await taskRepo.findById(created.id, user.id);
    expect(recheck?.is_archived).toBe(true);
  });

  it('AC-03: verifies ResearchRunRepository and CandidateResultRepository CRUD', async () => {
    const user = await seedUser(dbInstance.pool);
    const task = await seedTask(dbInstance.pool, user.id);

    // Create Run
    const run = await runRepo.create({
      task_id: task.id,
      user_id: user.id,
      status: RunStatus.QUEUED,
      current_stage: RunStage.INITIATED,
    });

    expect(run.id).toBeDefined();
    expect(run.task_id).toBe(task.id);
    expect(run.status).toBe('QUEUED');

    // Update status to RUNNING
    const updated = await runRepo.updateStatus(run.id, 'RUNNING' as any, 'PLANNING' as any, undefined, user.id);
    expect(updated?.status).toBe('RUNNING');

    // Insert a parent source document first
    const sourceDocRes = await dbInstance.query(
      `INSERT INTO source_documents (
        id, run_id, user_id, original_url, canonical_url, domain, title,
        discovery_provider, access_state, extraction_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        crypto.randomUUID(),
        run.id,
        user.id,
        'https://steelcase.com/gesture',
        'https://steelcase.com/gesture',
        'steelcase.com',
        'Steelcase Official',
        'TAVILY',
        'ACCESSIBLE',
        'SUCCESS',
      ]
    );
    const sourceDocId = sourceDocRes.rows[0].id;

    // Insert Evidence Record linked to source
    const evidence = await evidenceRepo.create({
      source_id: sourceDocId,
      run_id: run.id,
      user_id: user.id,
      claim_text: 'The Steelcase Gesture supports up to 400 lbs and includes a 12-year warranty.',
      claim_key: 'weight-warranty',
      verification_state: 'SUPPORTED' as any,
      confidence_score: 0.98,
    });

    expect(evidence.id).toBeDefined();
    expect(evidence.claim_key).toBe('weight-warranty');

    // Insert Candidate Result with linked evidence atomically
    const candidate = await candidateRepo.createWithEvidence({
      run_id: run.id,
      user_id: user.id,
      name: 'Steelcase Gesture Chair',
      match_classification: 'EXACT_MATCH' as any,
      brand: 'Steelcase',
      price_numeric: '1200.00',
      evidence_links: [
        { evidence_record_id: evidence.id, claim_type: 'WARRANTY' },
      ],
    });

    expect(candidate.id).toBeDefined();
    expect(candidate.title).toBe('Steelcase Gesture Chair');

    // Read Candidate
    const fetchedCandidate = await candidateRepo.findById(candidate.id, user.id);
    expect(fetchedCandidate).not.toBeNull();
    expect(fetchedCandidate?.title).toBe('Steelcase Gesture Chair');

    // Verify linked evidence
    const linked = await candidateRepo.listLinkedEvidence(candidate.id);
    expect(linked.length).toBe(1);
    expect(linked[0]?.evidence_id).toBe(evidence.id);
  });

  it('AC-03: verifies NotificationRepository persistence and query lifecycle', async () => {
    const user = await seedUser(dbInstance.pool);
    const task = await seedTask(dbInstance.pool, user.id);
    const run1 = await seedRun(dbInstance.pool, task.id, user.id);
    const run2 = await seedRun(dbInstance.pool, task.id, user.id);

    // Create research_comparison
    const compId = crypto.randomUUID();
    await dbInstance.query(
      `INSERT INTO research_comparisons (id, task_id, user_id, baseline_run_id, current_run_id, status)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETED')`,
      [compId, task.id, user.id, run1.id, run2.id]
    );

    // Create Notification
    const notif = await notifRepo.create({
      user_id: user.id,
      notification_type: 'PRICE_DROP',
      source_event_type: 'PRICE_CHANGE',
      task_id: task.id,
      research_run_id: run2.id,
      comparison_id: compId,
      title: 'Price Drop Alert',
      summary: 'Steelcase Gesture decreased by 15% on official store.',
      idempotency_key: `notif-${crypto.randomUUID()}`,
    });

    expect(notif).not.toBeNull();
    expect(notif?.id).toBeDefined();
    expect(notif?.read_at).toBeNull();

    // Check unread count
    const unreadCount = await notifRepo.getUnreadCount(user.id);
    expect(unreadCount).toBeGreaterThanOrEqual(1);

    // Mark as read
    const marked = await notifRepo.markAsRead(notif!.id, user.id);
    expect(marked).not.toBeNull();
    expect(marked?.read_at).not.toBeNull();
  });

  it('AC-04: verifies multi-tenant isolation prevents cross-tenant data access', async () => {
    const tenantAlice = await seedUser(dbInstance.pool);
    const tenantBob = await seedUser(dbInstance.pool);

    // Alice creates a private task
    const aliceTask = await taskRepo.create({
      user_id: tenantAlice.id,
      title: "Alice's Secret Patent Analysis",
      original_query: 'Quantum annealing battery patents',
      task_type: TaskType.SPEC_VERIFICATION,
    });

    // Bob attempts to find Alice's task by providing his own user_id
    const bobsViewOfAliceTask = await taskRepo.findById(aliceTask.id, tenantBob.id);
    expect(bobsViewOfAliceTask).toBeNull();

    // Bob lists his tasks; Alice's task must not appear
    const bobsTasks = await taskRepo.listByOwner(tenantBob.id);
    expect(bobsTasks.data.some((t) => t.id === aliceTask.id)).toBe(false);

    // Bob attempts to update Alice's task; operation must return null
    const unauthorizedUpdate = await taskRepo.update(
      aliceTask.id,
      { title: 'Hacked Title by Bob' },
      tenantBob.id
    );
    expect(unauthorizedUpdate).toBeNull();

    // Alice's task remains pristine
    const pristineTask = await taskRepo.findById(aliceTask.id, tenantAlice.id);
    expect(pristineTask?.title).toBe("Alice's Secret Patent Analysis");
  });

  it('AC-04: verifies ACID rollback behavior on error inside withTransaction', async () => {
    const user = await seedUser(dbInstance.pool);
    const orphanTaskId = crypto.randomUUID();

    let txErrorCaught = false;
    try {
      await withTransaction(async (tx) => {
        // Step 1: Insert task within transaction
        await tx.query(
          `INSERT INTO research_tasks (id, user_id, title, original_query, task_type)
           VALUES ($1, $2, 'Atomic Rollback Task', 'Atomic query', 'PRODUCT_RESEARCH')`,
          [orphanTaskId, user.id]
        );

        // Step 2: Deliberately throw an operational error to trigger rollback
        throw new Error('Simulated mid-transaction failure');
      });
    } catch (err) {
      txErrorCaught = true;
      expect((err as Error).message).toContain('Simulated mid-transaction failure');
    }

    expect(txErrorCaught).toBe(true);

    // Verify database state: the task must NOT have been persisted
    const checkRes = await dbInstance.query(
      `SELECT COUNT(*) as c FROM research_tasks WHERE id = $1`,
      [orphanTaskId]
    );
    expect(Number(checkRes.rows[0].c)).toBe(0);
  });
});
