export interface HistoryRecord {
  readonly runId: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly query: string;
  readonly taskType: string;
  readonly status: string;
  readonly scheduleId?: string | null;
  readonly scheduleName?: string | null;
  readonly queriesExecuted: number;
  readonly sourcesDiscovered: number;
  readonly sourcesExtracted: number;
  readonly claimsVerified: number;
  readonly candidateCount: number;
  readonly selectedModel?: string | null;
  readonly selectedProvider?: string | null;
  readonly totalCostUsd?: string | null;
  readonly durationMs?: number | null;
  readonly startedAt: string;
  readonly completedAt?: string | null;
  readonly createdAt: string;
}

export interface HistoryFilters {
  query?: string;
  status?: string;
  taskType?: string;
  scheduleId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

