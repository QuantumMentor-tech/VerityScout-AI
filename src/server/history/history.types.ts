import 'server-only';
import { RunStatus, TaskType } from '@/server/persistence/types';
import { EnrichedHistoryItem } from '@/server/export/export.types';

export interface HistoryFilterOptions {
  readonly query?: string | undefined;
  readonly status?: RunStatus | string | undefined;
  readonly scheduleId?: string | undefined;
  readonly taskType?: TaskType | string | undefined;
  readonly fromDate?: string | undefined;
  readonly toDate?: string | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

export interface HistoryQueryResult {
  readonly runs: readonly EnrichedHistoryItem[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly filtersApplied: HistoryFilterOptions;
}

