import 'server-only';
import {
  CandidateResultRow,
  EvidenceRecordRow,
  SourceDocumentRow,
  ChangeEventRow,
} from '@/server/persistence/types';
import { EnrichedHistoryItem } from './export.types';

/**
 * Checks if a string represents a valid numeric value (including signed integers, decimals, and scientific notation).
 */
export function isNumericString(val: string): boolean {
  if (!val || val.trim().length === 0) return false;
  return /^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(val.trim());
}

/**
 * Sanitizes a single cell value for spreadsheet safety and CSV quoting.
 * Defends against CSV / Spreadsheet formula injection (OWASP ASVS / Section 10.5).
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) return '';
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  let text: string;
  if (typeof value === 'object') {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }

  // 1. Formula Injection Mitigation:
  // Inspect leading character (allowing for leading whitespace or control characters)
  const trimmed = text.trim();
  if (trimmed.length > 0) {
    const firstChar = trimmed[0];
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@' || firstChar === '\t' || firstChar === '\r') {
      // Allow legitimate negative or positive numbers without mangling
      if (!isNumericString(trimmed)) {
        text = `'${text}`;
      }
    }
  }

  // 2. CSV Escaping (RFC 4180):
  // If cell contains comma, quote, line break, or starts/ends with spaces, wrap in quotes
  const needsQuotes =
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text.startsWith(' ') ||
    text.endsWith(' ');

  if (needsQuotes) {
    const escaped = text.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return text;
}

/**
 * Serializes a list of records to CSV with a header row and CRLF line endings.
 */
export function serializeToCsv(
  headers: readonly string[],
  rows: readonly (Record<string, unknown> | readonly unknown[])[]
): string {
  const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(',');
  const lines: string[] = [headerLine];

  for (const row of rows) {
    let line: string;
    if (Array.isArray(row)) {
      line = row.map((cell) => sanitizeCsvCell(cell)).join(',');
    } else {
      const record = row as Record<string, unknown>;
      line = headers.map((h) => sanitizeCsvCell(record[h])).join(',');
    }
    lines.push(line);
  }

  return lines.join('\r\n') + '\r\n';
}

/**
 * Serializes candidate results dataset to tabular CSV.
 */
export function serializeCandidatesCsv(
  candidates: readonly CandidateResultRow[],
  runId: string
): string {
  const headers = [
    'run_id',
    'candidate_id',
    'title',
    'product_identifier',
    'seller_or_domain',
    'canonical_url',
    'price',
    'currency',
    'availability',
    'condition',
    'classification',
    'passed_constraints',
    'failed_constraints',
    'created_at',
  ];

  const rows = candidates.map((c) => ({
    run_id: runId,
    candidate_id: c.id,
    title: c.title,
    product_identifier: c.product_identifier ?? '',
    seller_or_domain: c.seller_or_domain,
    canonical_url: c.canonical_url,
    price: c.price_usd != null ? Number(c.price_usd) : '',
    currency: c.currency,
    availability: c.availability,
    condition: c.condition,
    classification: c.classification,
    passed_constraints: (c.constraint_evaluation?.passedConstraints ?? []).join('; '),
    failed_constraints: (c.constraint_evaluation?.failedConstraints ?? []).join('; '),
    created_at: c.created_at,
  }));

  return serializeToCsv(headers, rows);
}

/**
 * Serializes evidence records dataset to tabular CSV.
 */
export function serializeEvidenceCsv(
  evidence: readonly EvidenceRecordRow[],
  sources: readonly SourceDocumentRow[],
  runId: string
): string {
  const sourceMap = new Map(sources.map((s) => [s.id, s.canonical_url]));

  const headers = [
    'run_id',
    'evidence_id',
    'candidate_id',
    'source_id',
    'source_url',
    'claim_key',
    'extracted_raw_value',
    'normalized_value',
    'unit_or_currency',
    'verification_state',
    'extraction_method',
    'confidence_score',
    'verbatim_quote',
    'extracted_at',
  ];

  const rows = evidence.map((e) => ({
    run_id: runId,
    evidence_id: e.id,
    candidate_id: e.candidate_id ?? '',
    source_id: e.source_id,
    source_url: sourceMap.get(e.source_id) ?? '',
    claim_key: e.claim_key,
    extracted_raw_value: e.extracted_raw_value,
    normalized_value: e.normalized_value,
    unit_or_currency: e.unit_or_currency ?? '',
    verification_state: e.verification_state,
    extraction_method: e.extraction_method,
    confidence_score: e.confidence_score != null ? Number(e.confidence_score) : '',
    verbatim_quote: e.verbatim_quote,
    extracted_at: e.extracted_at,
  }));

  return serializeToCsv(headers, rows);
}

/**
 * Serializes research change events dataset to tabular CSV.
 */
export function serializeChangesCsv(
  changes: readonly ChangeEventRow[],
  runId: string
): string {
  const headers = [
    'run_id',
    'comparison_id',
    'change_id',
    'candidate_id',
    'candidate_title',
    'canonical_url',
    'field_name',
    'change_type',
    'change_status',
    'reason_code',
    'previous_value',
    'new_value',
    'percentage_delta',
    'explanation',
    'detected_at',
  ];

  const rows = changes.map((c) => ({
    run_id: runId,
    comparison_id: c.comparison_id ?? '',
    change_id: c.id,
    candidate_id: c.candidate_id ?? '',
    candidate_title: c.candidate_title,
    canonical_url: c.canonical_url,
    field_name: c.field_name,
    change_type: c.change_type,
    change_status: c.change_status ?? 'SUPPORTED',
    reason_code: c.reason_code ?? '',
    previous_value: c.previous_value,
    new_value: c.new_value,
    percentage_delta: c.percentage_delta != null ? Number(c.percentage_delta) : '',
    explanation: c.explanation ?? '',
    detected_at: c.detected_at,
  }));

  return serializeToCsv(headers, rows);
}

/**
 * Serializes research history dataset to tabular CSV.
 */
export function serializeHistoryCsv(
  history: readonly EnrichedHistoryItem[]
): string {
  const headers = [
    'run_id',
    'task_id',
    'task_title',
    'original_query',
    'task_type',
    'status',
    'schedule_id',
    'schedule_name',
    'queries_executed',
    'sources_discovered',
    'sources_extracted',
    'claims_verified',
    'candidate_count',
    'total_cost_usd',
    'selected_model',
    'duration_ms',
    'started_at',
    'completed_at',
    'created_at',
  ];

  const rows = history.map((item) => ({
    run_id: item.runId,
    task_id: item.taskId,
    task_title: item.taskTitle,
    original_query: item.query,
    task_type: item.taskType,
    status: item.status,
    schedule_id: item.scheduleId ?? '',
    schedule_name: item.scheduleName ?? '',
    queries_executed: item.queriesExecuted,
    sources_discovered: item.sourcesDiscovered,
    sources_extracted: item.sourcesExtracted,
    claims_verified: item.claimsVerified,
    candidate_count: item.candidateCount,
    total_cost_usd: item.totalCostUsd ?? '',
    selected_model: item.selectedModel ?? '',
    duration_ms: item.durationMs ?? '',
    started_at: item.startedAt,
    completed_at: item.completedAt ?? '',
    created_at: item.createdAt,
  }));

  return serializeToCsv(headers, rows);
}

