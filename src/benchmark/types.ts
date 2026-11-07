/**
 * VerityScout AI — Research Quality Benchmark Type Definitions
 * Governed by: Step 54 (Research Quality Benchmark Report)
 * Standard: Evidence-grounded, reproducible, statistically responsible, provider-comparable.
 */

export type BenchmarkCategory =
  | 'hardware_research'
  | 'pc_components'
  | 'general_research'
  | 'constraint_ambiguity'
  | 'evidence_integrity_failures';

export type BenchmarkPriority = 'P0' | 'P1' | 'P2';
export type BenchmarkDifficulty = 'easy' | 'medium' | 'hard' | 'adversarial';
export type GroundTruthMode = 'synthetic_fixture' | 'static' | 'dynamic_live';
export type SourceValidationStatus =
  | 'synthetic_fixture_backed'
  | 'verified_live_snapshot'
  | 'query_parsing_only'
  | 'provisional';

export interface ExpectedConstraints {
  target_entity: string;
  price_ceiling: number | null;
  price_floor: number | null;
  currency: string | null;
  market_region: string | null;
  condition: string | null;
  mandatory_attributes: string[];
  excluded_attributes: string[];
  excluded_domains: string[];
  clarification_needed: boolean;
}

export interface RequiredCheck {
  check_id: string;
  dimension:
    | 'query_understanding'
    | 'constraint_satisfaction'
    | 'evidence_support'
    | 'dynamic_fact_correctness'
    | 'operational_transparency'
    | 'research_integrity';
  assertion: string;
  eval_type: 'exact_match' | 'deterministic_rule' | 'provenance_check' | 'state_assertion';
}

export interface SourceReference {
  url: string;
  role: string;
  title: string;
  validation_status: string;
  checked_at: string;
  supported_claim: string;
  evidence_note?: string;
  source_tier?: string;
}

export interface BenchmarkCase {
  case_id: string;
  title: string;
  category: BenchmarkCategory;
  task_type: string;
  query: string;
  priority: BenchmarkPriority;
  difficulty: BenchmarkDifficulty;
  ground_truth_mode: GroundTruthMode;
  expected_behavior: string;
  expected_constraints: ExpectedConstraints;
  required_checks: RequiredCheck[];
  forbidden_outcomes: string[];
  source_references: SourceReference[];
  fixture_references: string[];
  source_validation_status: SourceValidationStatus;
  traceability: {
    requirements: string[];
    acceptance_criteria: string[];
  };
  notes?: string;
}

export type ExecutionMode = 'controlled_pipeline' | 'fixture_evaluation' | 'live_provider';

export type FailureCategory =
  | 'QUERY_UNDERSTANDING_ERROR'
  | 'SKU_VARIANT_CONFUSION'
  | 'HARD_CONSTRAINT_VIOLATION'
  | 'CURRENCY_OR_MARKET_MISMATCH'
  | 'MISSING_UNCERTAINTY_FLAG'
  | 'CITATION_PROVENANCE_MISMATCH'
  | 'INDIRECT_INJECTION_VULNERABILITY'
  | 'STALE_RECORD_MISCLASSIFICATION'
  | 'DEDUPLICATION_FAILURE'
  | 'PROVIDER_CAPABILITY_MISMATCH'
  | 'OTHER_EXECUTION_FAILURE';

export interface CheckEvaluationResult {
  check_id: string;
  dimension: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export interface BenchmarkCaseResult {
  case_id: string;
  category: BenchmarkCategory;
  title: string;
  status: 'PASSED' | 'FAILED' | 'EXCLUDED';
  execution_mode: ExecutionMode;
  checks_evaluated: number;
  checks_passed: number;
  check_results: CheckEvaluationResult[];
  failure_category?: FailureCategory | null;
  observed_symptom?: string | null;
  root_cause_diagnosis?: string | null;
  duration_ms: number;
  estimated_tokens?: {
    input: number;
    output: number;
    total: number;
  };
  estimated_cost_usd?: number | null;
}

export interface RawMetricCounts {
  // Dimension 1: Constraint Extraction
  ceaExtracted: number;
  ceaTotal: number;

  // Dimension 2: Hard-Constraint Satisfaction
  hcvrViolations: number;
  hcvrEvaluatedCandidates: number;

  // Near-Match Precision
  nmepExplained: number;
  nmepTotalNearMatches: number;

  // Dimension 3: Evidence Grounding
  esrSupported: number;
  esrTotalClaims: number;

  // Dynamic & Staleness
  sdaDetected: number;
  sdaTotalHistorical: number;

  // Uncertainty & Ambiguity
  uadrDetected: number;
  uadrTotalAmbiguous: number;

  // Adversarial Neutralization
  ainrNeutralized: number;
  ainrTotalAdversarial: number;

  // Deduplication
  dedupCorrect: number;
  dedupTotalCases: number;

  // Structured Output Validity
  sovValid: number;
  sovTotalEvaluated: number;
}

export interface QuantitativeMetric {
  metric_name: string;
  dimension: string;
  numerator: number;
  denominator: number;
  rate_percentage: number | null; // null if denominator is 0
  target_threshold: string;
  status: 'PASSED' | 'FAILED' | 'NOT_EVALUATED';
  description: string;
}

export interface CategorySummary {
  category: BenchmarkCategory;
  total_cases: number;
  evaluated_cases: number;
  passed_cases: number;
  failed_cases: number;
  pass_rate: number;
  average_latency_ms: number;
}

export interface ConfusionMatrix {
  matrix: {
    exact_match: { exact_match: number; near_match: number; excluded: number; disambiguation: number };
    near_match: { exact_match: number; near_match: number; excluded: number; disambiguation: number };
    excluded: { exact_match: number; near_match: number; excluded: number; disambiguation: number };
    disambiguation: { exact_match: number; near_match: number; excluded: number; disambiguation: number };
  };
  per_class_metrics: Record<
    string,
    {
      precision: number | null;
      recall: number | null;
      f1_score: number | null;
      support: number;
    }
  >;
  macro_f1: number | null;
}

export interface ProviderComparisonResult {
  provider_id: string;
  model_id: string;
  supported_operations: string[];
  tested_cases: number;
  structured_output_validity_rate: number;
  average_latency_ms: number;
  estimated_cost_per_query_usd: number | null;
  zero_cost_self_hosted: boolean;
  notes: string;
}

export interface BenchmarkReportEnvelope {
  schema_version: '1.0.0';
  generated_at: string;
  dataset_version: string;
  dataset_hash_sha256?: string;
  application_version: string;
  execution_mode: ExecutionMode;
  total_cases: number;
  evaluated_cases: number;
  passed_cases: number;
  failed_cases: number;
  excluded_cases: number;
  overall_pass_rate: number;
  metrics: Record<string, QuantitativeMetric>;
  category_breakdown: Record<string, CategorySummary>;
  confusion_matrix: ConfusionMatrix;
  failure_analysis: {
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
  };
  provider_comparisons: ProviderComparisonResult[];
  operational_telemetry: {
    total_duration_ms: number;
    median_latency_ms: number;
    p90_latency_ms: number;
    min_latency_ms: number;
    max_latency_ms: number;
    total_estimated_tokens: number;
    total_estimated_cost_usd: number;
  };
  limitations: string[];
  case_results: BenchmarkCaseResult[];
}
