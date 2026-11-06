import 'server-only';
import { ResearchRunRepository, ResearchScheduleRepository } from '@/server/persistence/repositories';
import { ResearchRunRow, RunStatus } from '@/server/persistence/types';
import { ChangeReasonCode } from './change-detection.types';
import { logger } from '@/lib/logging/logger';

export interface ScopeCompatibilityCheck {
  readonly isCompatible: boolean;
  readonly compatible: boolean;
  readonly reasonCode?: ChangeReasonCode | undefined;
  readonly explanation?: string | undefined;
}

export interface SelectBaselineOptions {
  readonly currentRunId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly userId?: string | undefined;
  readonly scheduleId?: string | null | undefined;
  readonly explicitBaselineRunId?: string | null | undefined;
  readonly currentRun?: ResearchRunRow | undefined;
  readonly candidateRuns?: readonly ResearchRunRow[] | undefined;
}

export class BaselineSelector {
  private readonly runRepo: ResearchRunRepository;
  private readonly scheduleRepo: ResearchScheduleRepository;

  constructor(options?: {
    runRepo?: ResearchRunRepository | undefined;
    scheduleRepo?: ResearchScheduleRepository | undefined;
  }) {
    this.runRepo = options?.runRepo ?? new ResearchRunRepository();
    this.scheduleRepo = options?.scheduleRepo ?? new ResearchScheduleRepository();
  }

  /**
   * Selects the most recent prior eligible COMPLETED observation for comparison.
   * Excludes failed, cancelled, running, or unrelated runs.
   * If no eligible prior run exists, returns null (first observation / baseline established).
   */
  async selectBaseline(options: SelectBaselineOptions): Promise<ResearchRunRow | null> {
    const currentRun = options.currentRun;
    const currentRunId = options.currentRunId ?? currentRun?.id ?? '';
    const taskId = options.taskId ?? currentRun?.task_id ?? '';
    const userId = options.userId ?? currentRun?.user_id ?? '';
    const scheduleId = options.scheduleId !== undefined ? options.scheduleId : currentRun?.schedule_id;
    const explicitBaselineRunId = options.explicitBaselineRunId;

    // 1. If explicit baseline requested (e.g. manual comparison), resolve and validate
    if (explicitBaselineRunId) {
      if (options.candidateRuns) {
        const found = options.candidateRuns.find((r) => r.id === explicitBaselineRunId && r.user_id === userId);
        if (found && (found.status === RunStatus.COMPLETED || found.status === RunStatus.PARTIALLY_COMPLETED)) {
          return found;
        }
      }
      try {
        const explicitRun = await this.runRepo.findById(explicitBaselineRunId, userId);
        if (!explicitRun) {
          logger.warn('BASELINE_NOT_FOUND', 'Explicit baseline run not found', { explicitBaselineRunId });
          return null;
        }
        if (
          explicitRun.status !== RunStatus.COMPLETED &&
          explicitRun.status !== RunStatus.PARTIALLY_COMPLETED
        ) {
          logger.warn('BASELINE_INELIGIBLE_STATUS', 'Explicit baseline run is not in completed state', {
            explicitBaselineRunId,
            status: explicitRun.status,
          });
          return null;
        }
        if (explicitRun.id === currentRunId) {
          return null;
        }
        return explicitRun;
      } catch {
        return null;
      }
    }

    // 2. In-memory candidate evaluation if candidates provided
    if (options.candidateRuns) {
      const eligible = options.candidateRuns
        .filter((r) => {
          if (r.id === currentRunId) return false;
          if (userId && r.user_id !== userId) return false;
          if (
            r.status !== RunStatus.COMPLETED &&
            r.status !== RunStatus.PARTIALLY_COMPLETED
          ) {
            return false;
          }
          if (scheduleId && r.schedule_id && r.schedule_id !== scheduleId) return false;
          return true;
        })
        .sort((a, b) => {
          const timeA = new Date(a.completed_at ?? a.started_at).getTime();
          const timeB = new Date(b.completed_at ?? b.started_at).getTime();
          return timeB - timeA;
        });

      return eligible[0] ?? null;
    }

    // 3. Fallback: Query database for eligible prior runs
    try {
      const taskRuns = await this.runRepo.listByTaskId(taskId, userId, { limit: 50, page: 1 });
      const eligibleTaskPrior = taskRuns.data.find(
        (r) =>
          r.id !== currentRunId &&
          (r.status === RunStatus.COMPLETED || r.status === RunStatus.PARTIALLY_COMPLETED) &&
          (!scheduleId || r.schedule_id === scheduleId)
      );

      return eligibleTaskPrior ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Evaluates observation comparability across task, schedule revision, and query scopes.
   * Detects material changes that make direct value diffing invalid.
   */
  async checkScopeCompatibility(
    baselineRun: ResearchRunRow,
    currentRun: ResearchRunRow
  ): Promise<ScopeCompatibilityCheck> {
    // 1. User isolation coherence
    if (baselineRun.user_id !== currentRun.user_id) {
      return {
        isCompatible: false,
        compatible: false,
        reasonCode: 'SOURCE_SCOPE_MISMATCH',
        explanation: 'Baseline and current runs belong to different tenants',
      };
    }

    // 2. Task coherence
    if (baselineRun.task_id !== currentRun.task_id) {
      return {
        isCompatible: false,
        compatible: false,
        reasonCode: 'QUERY_SCOPE_CHANGED',
        explanation: 'Baseline and current runs belong to different research tasks',
      };
    }

    // 3. Synthesis query coherence
    const bQuery = (baselineRun.synthesis as { query?: string } | null)?.query;
    const cQuery = (currentRun.synthesis as { query?: string } | null)?.query;
    if (bQuery && cQuery && bQuery.trim().toLowerCase() !== cQuery.trim().toLowerCase()) {
      return {
        isCompatible: false,
        compatible: false,
        reasonCode: 'QUERY_SCOPE_CHANGED',
        explanation: `Research query changed from "${bQuery}" to "${cQuery}"`,
      };
    }

    // 4. Check schedule definition revision if both belong to a schedule
    if (baselineRun.schedule_id && currentRun.schedule_id && baselineRun.schedule_id === currentRun.schedule_id) {
      try {
        const schedule = await this.scheduleRepo.findById(baselineRun.schedule_id, baselineRun.user_id);
        if (schedule && schedule.request_snapshot) {
          const snapshot = schedule.request_snapshot as { query?: string | undefined };
          if (snapshot.query && baselineRun.task_id !== currentRun.task_id) {
            return {
              isCompatible: false,
              compatible: false,
              reasonCode: 'QUERY_SCOPE_CHANGED',
              explanation: 'Underlying research schedule query definition has been revised',
            };
          }
        }
      } catch {
        // Non-fatal if offline/mock
      }
    }

    return {
      isCompatible: true,
      compatible: true,
    };
  }
}
