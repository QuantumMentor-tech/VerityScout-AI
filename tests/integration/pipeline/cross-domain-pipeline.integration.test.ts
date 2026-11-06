import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { createTestDatabase, TestDatabaseInstance } from '../helpers/test-db';
import { _setPoolForTesting, _resetPoolForTesting } from '@/server/persistence/database';
import {
  ResearchRunRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
  ResearchComparisonRepository,
  ChangeEventRepository,
  NotificationRepository,
} from '@/server/persistence/repositories';
import { ChangeDetectorService } from '@/server/changes/change-detector.service';
import { NotificationService } from '@/server/notifications/notification.service';
import { seedUser, seedTask } from '../helpers/fixture-generator';
import { MatchClassification, VerificationState, ChangeType } from '@/server/persistence/types';

describe('Cross-Domain Research Pipeline Integration Tests', () => {
  let dbInstance: TestDatabaseInstance;
  let runRepo: ResearchRunRepository;
  let candidateRepo: CandidateResultRepository;
  let evidenceRepo: EvidenceRecordRepository;
  let comparisonRepo: ResearchComparisonRepository;
  let changeEventRepo: ChangeEventRepository;
  let notifRepo: NotificationRepository;
  let changeDetector: ChangeDetectorService;
  let notificationService: NotificationService;

  beforeAll(async () => {
    dbInstance = await createTestDatabase();
    _setPoolForTesting(dbInstance.pool);

    runRepo = new ResearchRunRepository();
    candidateRepo = new CandidateResultRepository();
    evidenceRepo = new EvidenceRecordRepository();
    comparisonRepo = new ResearchComparisonRepository();
    changeEventRepo = new ChangeEventRepository();
    notifRepo = new NotificationRepository();

    changeDetector = new ChangeDetectorService(
      comparisonRepo,
      changeEventRepo,
      runRepo,
      candidateRepo,
      evidenceRepo
    );

    notificationService = new NotificationService(notifRepo);
  });

  afterAll(async () => {
    _resetPoolForTesting();
    await dbInstance.close();
  });

  it('AC-10 & AC-11: executes end-to-end flow: Baseline Run -> Subsequent Run -> Change Detection -> In-App Notification', async () => {
    const user = await seedUser(dbInstance.pool);
    const task = await seedTask(dbInstance.pool, user.id);

    // ==========================================
    // 1. BASELINE RUN: Initial Price at $1,000
    // ==========================================
    const baselineRun = await runRepo.create({
      task_id: task.id,
      user_id: user.id,
      status: 'COMPLETED' as any,
      current_stage: 'FINALIZING' as any,
    });

    // Create source document for baseline
    const baselineSourceRes = await dbInstance.query(
      `INSERT INTO source_documents (
        id, run_id, user_id, original_url, canonical_url, domain, title,
        discovery_provider, access_state, extraction_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        crypto.randomUUID(),
        baselineRun.id,
        user.id,
        'https://store.example.com/standing-desk',
        'https://store.example.com/standing-desk',
        'store.example.com',
        'Standing Desk Pro Baseline',
        'TAVILY',
        'ACCESSIBLE',
        'SUCCESS',
      ]
    );
    const baselineSourceId = baselineSourceRes.rows[0].id;

    // Create baseline evidence
    const baselineEvidence = await evidenceRepo.create({
      source_id: baselineSourceId,
      run_id: baselineRun.id,
      user_id: user.id,
      claim_text: 'Price is $1000.00',
      claim_key: 'price',
      extracted_raw_value: '$1,000.00',
      normalized_value: '1000.0000',
      unit_or_currency: 'USD',
      verbatim_quote: 'Sale Price: $1,000.00 (In Stock)',
      verification_state: VerificationState.SUPPORTED,
      confidence_score: 1.0,
    });

    // Create baseline candidate
    const baselineCandidate = await candidateRepo.createWithEvidence({
      run_id: baselineRun.id,
      user_id: user.id,
      name: 'Standing Desk Pro Dual Motor',
      match_classification: MatchClassification.EXACT_MATCH,
      brand: 'FlexiDesk',
      model_number: 'FDP-2026',
      price_numeric: '1000.0000',
      currency_code: 'USD',
      availability_status: 'IN_STOCK',
      primary_source_url: 'https://store.example.com/standing-desk',
      evidence_links: [
        { evidence_record_id: baselineEvidence.id, claim_type: 'price' },
      ],
    });

    expect(baselineCandidate.id).toBeDefined();

    // ==========================================
    // 2. SUBSEQUENT RUN: Price dropped to $850 (15% drop)
    // ==========================================
    const currentRun = await runRepo.create({
      task_id: task.id,
      user_id: user.id,
      status: 'COMPLETED' as any,
      current_stage: 'FINALIZING' as any,
    });

    const currentSourceRes = await dbInstance.query(
      `INSERT INTO source_documents (
        id, run_id, user_id, original_url, canonical_url, domain, title,
        discovery_provider, access_state, extraction_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        crypto.randomUUID(),
        currentRun.id,
        user.id,
        'https://store.example.com/standing-desk',
        'https://store.example.com/standing-desk',
        'store.example.com',
        'Standing Desk Pro Current',
        'TAVILY',
        'ACCESSIBLE',
        'SUCCESS',
      ]
    );
    const currentSourceId = currentSourceRes.rows[0].id;

    const currentEvidence = await evidenceRepo.create({
      source_id: currentSourceId,
      run_id: currentRun.id,
      user_id: user.id,
      claim_text: 'Price dropped to $850.00',
      claim_key: 'price',
      extracted_raw_value: '$850.00',
      normalized_value: '850.0000',
      unit_or_currency: 'USD',
      verbatim_quote: 'Flash Deal Price: $850.00 (In Stock)',
      verification_state: VerificationState.SUPPORTED,
      confidence_score: 1.0,
    });

    const currentCandidate = await candidateRepo.createWithEvidence({
      run_id: currentRun.id,
      user_id: user.id,
      name: 'Standing Desk Pro Dual Motor',
      match_classification: MatchClassification.EXACT_MATCH,
      brand: 'FlexiDesk',
      model_number: 'FDP-2026',
      price_numeric: '850.0000',
      currency_code: 'USD',
      availability_status: 'IN_STOCK',
      primary_source_url: 'https://store.example.com/standing-desk',
      evidence_links: [
        { evidence_record_id: currentEvidence.id, claim_type: 'price' },
      ],
    });

    expect(currentCandidate.id).toBeDefined();

    // ==========================================
    // 3. STEP 48 CHANGE DETECTION: Compare Runs
    // ==========================================
    const comparisonResult = await changeDetector.compareRuns({
      taskId: task.id,
      currentRunId: currentRun.id,
      userId: user.id,
      forcedBaselineRunId: baselineRun.id,
    });

    expect(comparisonResult).toBeDefined();
    expect(comparisonResult.status).toBe('CHANGES_DETECTED');
    expect(comparisonResult.changes.length).toBeGreaterThanOrEqual(1);

    const priceChange = comparisonResult.changes.find(
      (c) => c.changeType === ChangeType.PRICE_DROP
    );
    expect(priceChange).toBeDefined();
    expect(priceChange?.changeType).toBe(ChangeType.PRICE_DROP);

    // ==========================================
    // 4. STEP 50 NOTIFICATION PROCESSING: Generate Alerts
    // ==========================================
    const notifResult = await notificationService.processComparisonChanges(comparisonResult);
    expect(notifResult.createdCount).toBeGreaterThanOrEqual(1);

    // Verify notification persisted in database
    const userNotifs = await notifRepo.listByUser(user.id);
    expect(userNotifs.data.length).toBeGreaterThanOrEqual(1);

    const alert = userNotifs.data[0];
    expect(alert).toBeDefined();
    expect(alert?.user_id).toBe(user.id);
    expect(alert?.task_id).toBe(task.id);
    expect(alert?.research_run_id).toBe(currentRun.id);
    expect(alert?.comparison_id).toBe(comparisonResult.id);

    // Idempotency: re-running notification processing with same comparison does not create extra database rows
    const countBefore = (await notifRepo.listByUser(user.id)).pagination.total;
    await notificationService.processComparisonChanges(comparisonResult);
    const countAfter = (await notifRepo.listByUser(user.id)).pagination.total;

    // The total persisted notifications in the database must remain unchanged (idempotent ON CONFLICT)
    expect(countAfter).toBe(countBefore);
  });
});
