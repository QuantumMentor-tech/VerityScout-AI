import 'server-only';
import {
  ResearchRunRow,
  ResearchTaskRow,
  CandidateResultRow,
  EvidenceRecordRow,
  SourceDocumentRow,
  ResearchComparisonRow,
  ChangeEventRow,
  ResearchScheduleRow,
} from '@/server/persistence/types';

export const EXPORT_SCHEMA_VERSION = '1.0.0';

export type ExportFormat = 'json' | 'csv' | 'markdown';

export type CsvDatasetType = 'candidates' | 'evidence' | 'changes' | 'history';

export interface ExportScopeOptions {
  readonly format: ExportFormat;
  readonly dataset?: CsvDatasetType | undefined;
  readonly includeEvidence?: boolean | undefined;
  readonly includeComparisons?: boolean | undefined;
}

export interface ResearchRunExportSnapshot {
  readonly run: ResearchRunRow;
  readonly task: ResearchTaskRow;
  readonly schedule?: ResearchScheduleRow | null | undefined;
  readonly candidates: readonly CandidateResultRow[];
  readonly evidence: readonly EvidenceRecordRow[];
  readonly sources: readonly SourceDocumentRow[];
  readonly comparison?: ResearchComparisonRow | null | undefined;
  readonly changes?: readonly ChangeEventRow[] | undefined;
}

export interface HistoryExportSnapshot {
  readonly runs: readonly EnrichedHistoryItem[];
  readonly totalCount: number;
  readonly filtersApplied?: Record<string, unknown> | undefined;
}

export interface EnrichedHistoryItem {
  readonly runId: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly query: string;
  readonly taskType: string;
  readonly status: string;
  readonly scheduleId?: string | null | undefined;
  readonly scheduleName?: string | null | undefined;
  readonly queriesExecuted: number;
  readonly sourcesDiscovered: number;
  readonly sourcesExtracted: number;
  readonly claimsVerified: number;
  readonly candidateCount: number;
  readonly selectedModel?: string | null | undefined;
  readonly selectedProvider?: string | null | undefined;
  readonly totalCostUsd?: string | null | undefined;
  readonly durationMs?: number | null | undefined;
  readonly startedAt: string;
  readonly completedAt?: string | null | undefined;
  readonly createdAt: string;
}

export interface JsonExportEnvelope<T = unknown> {
  readonly schema_version: string;
  readonly export_metadata: {
    readonly exported_at: string;
    readonly export_scope: 'single_run' | 'history';
    readonly format: 'json';
    readonly generator: string;
    readonly record_counts: Record<string, number>;
  };
  readonly data: T;
}

