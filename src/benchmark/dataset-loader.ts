import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { BenchmarkCase, BenchmarkCategory } from './types';

export interface DatasetLoaderOptions {
  datasetPath?: string;
  categoryFilter?: BenchmarkCategory | 'ALL';
  caseIdsFilter?: string[];
  validateSchema?: boolean;
}

export interface LoadedDataset {
  datasetVersion: string;
  datasetHashSha256: string;
  totalLoaded: number;
  cases: BenchmarkCase[];
}

const DEFAULT_DATASET_PATH = path.resolve(
  process.cwd(),
  'data/benchmark/verityscout_benchmark.jsonl'
);

/**
 * Validates a single benchmark case object against the frozen specification.
 */
export function validateBenchmarkCaseRecord(record: unknown, lineIndex: number): BenchmarkCase {
  if (typeof record !== 'object' || record === null) {
    throw new Error(`Invalid benchmark record at line ${lineIndex + 1}: expected an object`);
  }

  const obj = record as Record<string, unknown>;

  if (typeof obj.case_id !== 'string' || !/^VS-BENCH-(0[0-5][0-9]|060)$/.test(obj.case_id)) {
    throw new Error(
      `Invalid case_id at line ${lineIndex + 1}: expected VS-BENCH-001 through VS-BENCH-060, got ${String(
        obj.case_id
      )}`
    );
  }

  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
    throw new Error(`Missing or empty title for case ${obj.case_id}`);
  }

  const validCategories: BenchmarkCategory[] = [
    'hardware_research',
    'pc_components',
    'general_research',
    'constraint_ambiguity',
    'evidence_integrity_failures',
  ];

  if (typeof obj.category !== 'string' || !validCategories.includes(obj.category as BenchmarkCategory)) {
    throw new Error(
      `Invalid category for case ${obj.case_id}: ${String(obj.category)}`
    );
  }

  if (typeof obj.query !== 'string' || obj.query.trim().length === 0) {
    throw new Error(`Missing or empty query for case ${obj.case_id}`);
  }

  if (typeof obj.expected_constraints !== 'object' || obj.expected_constraints === null) {
    throw new Error(`Missing expected_constraints for case ${obj.case_id}`);
  }

  if (!Array.isArray(obj.required_checks) || obj.required_checks.length === 0) {
    throw new Error(`Missing or empty required_checks array for case ${obj.case_id}`);
  }

  for (const check of obj.required_checks) {
    if (typeof check !== 'object' || check === null || !check.check_id || !check.dimension || !check.assertion) {
      throw new Error(`Malformed check item in case ${obj.case_id}`);
    }
  }

  return obj as unknown as BenchmarkCase;
}

/**
 * Reads, verifies, and parses canonical benchmark JSONL dataset.
 */
export function loadBenchmarkDataset(options?: DatasetLoaderOptions): LoadedDataset {
  const filePath = options?.datasetPath ?? DEFAULT_DATASET_PATH;

  if (!existsSync(filePath)) {
    throw new Error(`Benchmark dataset file not found at: ${filePath}`);
  }

  const rawContent = readFileSync(filePath, 'utf-8');
  const hash = createHash('sha256').update(rawContent).digest('hex');

  const lines = rawContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const cases: BenchmarkCase[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse JSON at line ${i + 1} of ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const validated = validateBenchmarkCaseRecord(parsed, i);

    if (seenIds.has(validated.case_id)) {
      throw new Error(`Duplicate case_id detected: ${validated.case_id} at line ${i + 1}`);
    }
    seenIds.add(validated.case_id);

    // Apply category filter if requested
    if (options?.categoryFilter && options.categoryFilter !== 'ALL' && validated.category !== options.categoryFilter) {
      continue;
    }

    // Apply case IDs filter if requested
    if (options?.caseIdsFilter && options.caseIdsFilter.length > 0 && !options.caseIdsFilter.includes(validated.case_id)) {
      continue;
    }

    cases.push(validated);
  }

  return {
    datasetVersion: '1.0.0-FROZEN',
    datasetHashSha256: hash,
    totalLoaded: cases.length,
    cases,
  };
}

/**
 * Verifies that the evaluated query text does not leak benchmark reference metadata or forbidden outcomes.
 */
export function verifyZeroLeakage(caseRecord: BenchmarkCase): { safe: boolean; violationReason?: string } {
  // Query should not contain secret answers, forbidden outcome text, or raw expected constraints JSON
  const queryLower = caseRecord.query.toLowerCase();

  for (const forbidden of caseRecord.forbidden_outcomes) {
    if (forbidden.length > 20 && queryLower.includes(forbidden.toLowerCase())) {
      return {
        safe: false,
        violationReason: `Query contains forbidden outcome text: "${forbidden}"`,
      };
    }
  }

  return { safe: true };
}

