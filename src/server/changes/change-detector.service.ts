import 'server-only';
import {
  ChangeType,
  ComparisonStatus,
  RunStatus,
  CandidateResultRow,
  EvidenceRecordRow,
} from '@/server/persistence/types';
import {
  ResearchComparisonRepository,
  ChangeEventRepository,
  ResearchRunRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
} from '@/server/persistence/repositories';
import {
  ComparisonScope,
  ComparisonResult,
  ComparisonSummary,
  CandidateWithEvidence,
  COMPARISON_POLICY_VERSION,
} from './change-detection.types';
import { BaselineSelector } from './baseline-selector';
import { IdentityMatcher } from './identity-matcher';
import { AttributeComparator } from './attribute-comparator';

export interface CompareRunsInput {
  readonly taskId: string;
  readonly currentRunId: string;
  readonly userId: string;
  readonly scheduleId?: string | null | undefined;
  readonly forcedBaselineRunId?: string | undefined;
  readonly includeUnchanged?: boolean | undefined;
}

export class ChangeDetectorService {
  private readonly comparisonRepo: ResearchComparisonRepository;
  private readonly changeEventRepo: ChangeEventRepository;
  private readonly runRepo: ResearchRunRepository;
  private readonly candidateRepo: CandidateResultRepository;
  private readonly evidenceRepo: EvidenceRecordRepository;
  private readonly baselineSelector: BaselineSelector;
  private readonly identityMatcher: IdentityMatcher;
  private readonly attributeComparator: AttributeComparator;

  constructor(
    comparisonRepo?: ResearchComparisonRepository,
    changeEventRepo?: ChangeEventRepository,
    runRepo?: ResearchRunRepository,
    candidateRepo?: CandidateResultRepository,
    evidenceRepo?: EvidenceRecordRepository,
    baselineSelector?: BaselineSelector,
    identityMatcher?: IdentityMatcher,
    attributeComparator?: AttributeComparator
  ) {
    this.comparisonRepo = comparisonRepo ?? new ResearchComparisonRepository();
    this.changeEventRepo = changeEventRepo ?? new ChangeEventRepository();
    this.runRepo = runRepo ?? new ResearchRunRepository();
    this.candidateRepo = candidateRepo ?? new CandidateResultRepository();
    this.evidenceRepo = evidenceRepo ?? new EvidenceRecordRepository();
    this.baselineSelector =
      baselineSelector ??
      new BaselineSelector({
        runRepo: this.runRepo,
      });
    this.identityMatcher = identityMatcher ?? new IdentityMatcher();
    this.attributeComparator = attributeComparator ?? new AttributeComparator();
  }

  /**
   * Executes deterministic change detection between an eligible baseline run and a current completed run.
   */
  public async compareRuns(input: CompareRunsInput): Promise<ComparisonResult> {
    const { taskId, currentRunId, userId, scheduleId, forcedBaselineRunId, includeUnchanged } = input;

    // 1. Fetch current run and verify status and ownership
    const currentRun = await this.runRepo.findById(currentRunId, userId);
    if (!currentRun) {
      throw new Error(`Current research run ${currentRunId} not found or access denied.`);
    }

    if (
      currentRun.status !== RunStatus.COMPLETED &&
      currentRun.status !== RunStatus.PARTIALLY_COMPLETED
    ) {
      throw new Error(
        `Current research run ${currentRunId} has status ${currentRun.status}; only COMPLETED or PARTIALLY_COMPLETED runs are eligible for change detection.`
      );
    }

    // 2. Select eligible baseline run
    let baselineRun = null;

    if (forcedBaselineRunId) {
      baselineRun = await this.runRepo.findById(forcedBaselineRunId, userId);
      if (!baselineRun) {
        throw new Error(`Forced baseline run ${forcedBaselineRunId} not found or access denied.`);
      }
      if (
        baselineRun.status !== RunStatus.COMPLETED &&
        baselineRun.status !== RunStatus.PARTIALLY_COMPLETED
      ) {
        throw new Error(
          `Forced baseline run ${forcedBaselineRunId} has ineligible status ${baselineRun.status}.`
        );
      }
    } else {
      // List prior completed runs
      const runsResult = scheduleId
        ? await this.runRepo.listByScheduleId(scheduleId, userId, { limit: 50 })
        : await this.runRepo.listByTaskId(taskId, userId, { limit: 50 });

      const candidateRuns = runsResult.data.filter(
        (r) =>
          r.id !== currentRunId &&
          (r.status === RunStatus.COMPLETED || r.status === RunStatus.PARTIALLY_COMPLETED)
      );

      baselineRun = await this.baselineSelector.selectBaseline({
        currentRun,
        candidateRuns,
        scheduleId: scheduleId ?? undefined,
        userId,
      });
    }

    // 3. Handle First-Run Baseline Establishment
    if (!baselineRun) {
      const emptySummary: ComparisonSummary = {
        totalCompared: 0,
        changedCount: 0,
        unchangedCount: 0,
        newlyObservedCount: 0,
        noLongerObservedCount: 0,
        conflictingCount: 0,
        notComparableCount: 0,
      };

      const baselineRecord = await this.comparisonRepo.create({
        task_id: taskId,
        schedule_id: scheduleId ?? null,
        user_id: userId,
        baseline_run_id: currentRun.id,
        current_run_id: currentRun.id,
        status: ComparisonStatus.FIRST_RUN_BASELINE,
        comparison_policy_version: COMPARISON_POLICY_VERSION,
        reason_code: 'FIRST_RUN_BASELINE_ESTABLISHED',
        summary: emptySummary as unknown as Record<string, unknown>,
      });

      return {
        id: baselineRecord.id,
        taskId,
        scheduleId: scheduleId ?? null,
        userId,
        baselineRunId: currentRun.id,
        currentRunId: currentRun.id,
        status: ComparisonStatus.FIRST_RUN_BASELINE,
        comparisonPolicyVersion: COMPARISON_POLICY_VERSION,
        reasonCode: 'FIRST_RUN_BASELINE_ESTABLISHED',
        changes: [],
        summary: emptySummary,
        detectedAt: baselineRecord.detected_at,
      };
    }

    // 4. Verify Scope Compatibility
    const scopeCompatibility = await this.baselineSelector.checkScopeCompatibility(
      baselineRun,
      currentRun
    );

    if (!scopeCompatibility.compatible) {
      const scopeSummary: ComparisonSummary = {
        totalCompared: 0,
        changedCount: 0,
        unchangedCount: 0,
        newlyObservedCount: 0,
        noLongerObservedCount: 0,
        conflictingCount: 0,
        notComparableCount: 0,
      };

      const ineligibleComp = await this.comparisonRepo.create({
        task_id: taskId,
        schedule_id: scheduleId ?? null,
        user_id: userId,
        baseline_run_id: baselineRun.id,
        current_run_id: currentRun.id,
        status: ComparisonStatus.INELIGIBLE_SCOPE,
        comparison_policy_version: COMPARISON_POLICY_VERSION,
        reason_code: scopeCompatibility.reasonCode,
        summary: scopeSummary as unknown as Record<string, unknown>,
      });

      return {
        id: ineligibleComp.id,
        taskId,
        scheduleId: scheduleId ?? null,
        userId,
        baselineRunId: baselineRun.id,
        currentRunId: currentRun.id,
        status: ComparisonStatus.INELIGIBLE_SCOPE,
        comparisonPolicyVersion: COMPARISON_POLICY_VERSION,
        reasonCode: scopeCompatibility.reasonCode,
        changes: [],
        summary: scopeSummary,
        detectedAt: ineligibleComp.detected_at,
      };
    }

    // 5. Fetch Candidates and Evidence for both runs
    const [bCandidatesRes, bEvidenceRes, cCandidatesRes, cEvidenceRes] = await Promise.all([
      this.candidateRepo.listByRunId(baselineRun.id, userId, { limit: 1000 }),
      this.evidenceRepo.listByRunId(baselineRun.id, userId, { limit: 1000 }),
      this.candidateRepo.listByRunId(currentRun.id, userId, { limit: 1000 }),
      this.evidenceRepo.listByRunId(currentRun.id, userId, { limit: 1000 }),
    ]);

    const baselineWithEvidence = this.assembleCandidateEvidence(
      bCandidatesRes.data,
      bEvidenceRes.data
    );
    const currentWithEvidence = this.assembleCandidateEvidence(
      cCandidatesRes.data,
      cEvidenceRes.data
    );

    // 6. Match Candidates across runs
    const matchPairs = this.identityMatcher.matchCandidates(
      baselineWithEvidence,
      currentWithEvidence
    );

    // 7. Deterministically Compare Attributes
    const scope: ComparisonScope = {
      taskId,
      scheduleId: scheduleId ?? null,
      userId,
      baselineRunId: baselineRun.id,
      currentRunId: currentRun.id,
      comparisonPolicyVersion: COMPARISON_POLICY_VERSION,
    };

    const detectedChanges = this.attributeComparator.compareAll(
      matchPairs,
      scope,
      { includeUnchanged: includeUnchanged ?? false }
    );

    // 8. Calculate Summary
    let changedCount = 0;
    let unchangedCount = 0;
    let newlyObservedCount = 0;
    let noLongerObservedCount = 0;
    let conflictingCount = 0;
    let notComparableCount = 0;

    for (const change of detectedChanges) {
      switch (change.changeType) {
        case ChangeType.NEW_OFFER_DISCOVERED:
        case ChangeType.NEWLY_OBSERVED:
          newlyObservedCount++;
          break;
        case ChangeType.NO_LONGER_OBSERVED:
          noLongerObservedCount++;
          break;
        case ChangeType.NOT_COMPARABLE:
          notComparableCount++;
          break;
        case ChangeType.CONFLICTING:
          conflictingCount++;
          break;
        case ChangeType.UNCHANGED:
          unchangedCount++;
          break;
        default:
          changedCount++;
          break;
      }
    }

    const summary: ComparisonSummary = {
      totalCompared: matchPairs.length,
      changedCount,
      unchangedCount,
      newlyObservedCount,
      noLongerObservedCount,
      conflictingCount,
      notComparableCount,
    };

    const overallStatus =
      changedCount > 0 || newlyObservedCount > 0 || noLongerObservedCount > 0
        ? ComparisonStatus.CHANGES_DETECTED
        : ComparisonStatus.NO_CHANGES_DETECTED;

    // 9. Persist Parent Comparison Record
    const compRecord = await this.comparisonRepo.create({
      task_id: taskId,
      schedule_id: scheduleId ?? null,
      user_id: userId,
      baseline_run_id: baselineRun.id,
      current_run_id: currentRun.id,
      status: overallStatus,
      comparison_policy_version: COMPARISON_POLICY_VERSION,
      summary: summary as unknown as Record<string, unknown>,
    });

    // 10. Persist Child Change Events (filter out UNCHANGED to save storage unless requested)
    const eventsToPersist = detectedChanges
      .filter((c) => c.changeType !== ChangeType.UNCHANGED)
      .map((c) => ({
        task_id: c.taskId,
        schedule_id: c.scheduleId ?? null,
        user_id: c.userId,
        previous_run_id: c.previousRunId,
        current_run_id: c.currentRunId,
        comparison_id: compRecord.id,
        candidate_id: c.candidateId ?? null,
        candidate_title: c.candidateTitle,
        canonical_url: c.canonicalUrl,
        field_name: c.fieldName,
        change_type: c.changeType,
        change_status: c.changeStatus,
        reason_code: c.reasonCode,
        previous_value: c.previousValue,
        new_value: c.newValue,
        percentage_delta: c.percentageDelta ?? null,
        evidence_id: c.evidenceId ?? null,
        baseline_evidence_id: c.baselineEvidenceId ?? null,
        is_supported: c.isSupported,
        explanation: c.explanation,
        idempotency_key: c.idempotencyKey,
      }));

    if (eventsToPersist.length > 0) {
      await this.changeEventRepo.createBatch(eventsToPersist);
    }

    return {
      id: compRecord.id,
      taskId,
      scheduleId: scheduleId ?? null,
      userId,
      baselineRunId: baselineRun.id,
      currentRunId: currentRun.id,
      status: overallStatus,
      comparisonPolicyVersion: COMPARISON_POLICY_VERSION,
      changes: detectedChanges.map((c) => ({ ...c, comparisonId: compRecord.id })),
      summary,
      detectedAt: compRecord.detected_at,
    };
  }

  private assembleCandidateEvidence(
    candidates: readonly CandidateResultRow[],
    evidence: readonly EvidenceRecordRow[]
  ): CandidateWithEvidence[] {
    const evidenceByCandidateId = new Map<string, EvidenceRecordRow[]>();

    for (const ev of evidence) {
      if (ev.candidate_id) {
        const list = evidenceByCandidateId.get(ev.candidate_id) ?? [];
        list.push(ev);
        evidenceByCandidateId.set(ev.candidate_id, list);
      }
    }

    return candidates.map((candidate) => ({
      candidate,
      evidence: evidenceByCandidateId.get(candidate.id) ?? [],
    }));
  }
}