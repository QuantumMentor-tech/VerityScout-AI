import type { BenchmarkCaseResult, FailureCategory } from './types';

export interface FailureAnalysisSummary {
  failure_counts_by_category: Record<FailureCategory, number>;
  total_failures: number;
  representative_failures: Array<{
    case_id: string;
    title: string;
    failure_category: FailureCategory;
    symptom: string;
    root_cause: string;
    recommendation: string;
  }>;
}

export function analyzeBenchmarkFailures(caseResults: BenchmarkCaseResult[]): FailureAnalysisSummary {
  const counts: Record<FailureCategory, number> = {
    QUERY_UNDERSTANDING_ERROR: 0,
    SKU_VARIANT_CONFUSION: 0,
    HARD_CONSTRAINT_VIOLATION: 0,
    CURRENCY_OR_MARKET_MISMATCH: 0,
    MISSING_UNCERTAINTY_FLAG: 0,
    CITATION_PROVENANCE_MISMATCH: 0,
    INDIRECT_INJECTION_VULNERABILITY: 0,
    STALE_RECORD_MISCLASSIFICATION: 0,
    DEDUPLICATION_FAILURE: 0,
    PROVIDER_CAPABILITY_MISMATCH: 0,
    OTHER_EXECUTION_FAILURE: 0,
  };

  const failedCases = caseResults.filter((c) => c.status === 'FAILED');

  for (const c of failedCases) {
    if (c.failure_category && counts[c.failure_category] !== undefined) {
      counts[c.failure_category]++;
    } else {
      counts.OTHER_EXECUTION_FAILURE++;
    }
  }

  // Representative failure cases (up to 5 for inspectability)
  const representative: FailureAnalysisSummary['representative_failures'] = [];

  for (const c of failedCases.slice(0, 5)) {
    const category = c.failure_category || 'OTHER_EXECUTION_FAILURE';
    let recommendation = 'Review query planner and constraint normalization logic.';

    if (category === 'QUERY_UNDERSTANDING_ERROR') {
      recommendation = 'Strengthen multi-word SKU and technical parameter extraction in query-normalizer.ts.';
    } else if (category === 'HARD_CONSTRAINT_VIOLATION') {
      recommendation = 'Ensure price ceiling boundary checks strictly enforce mathematical ceiling ($val <= $ceiling).';
    } else if (category === 'CITATION_PROVENANCE_MISMATCH') {
      recommendation = 'Strengthen verbatim character offset search in evidence-grounder.ts before claim persistence.';
    } else if (category === 'MISSING_UNCERTAINTY_FLAG') {
      recommendation = 'Add proactive ambiguity rules in constraint-extractor.ts when mandatory parameters are omitted.';
    }

    representative.push({
      case_id: c.case_id,
      title: c.title,
      failure_category: category,
      symptom: c.observed_symptom ?? 'Check assertion did not evaluate to true.',
      root_cause: c.root_cause_diagnosis ?? 'Unmet expectation during benchmark evaluation.',
      recommendation,
    });
  }

  return {
    failure_counts_by_category: counts,
    total_failures: failedCases.length,
    representative_failures: representative,
  };
}
