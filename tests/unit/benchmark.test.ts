import { describe, it, expect } from 'vitest';
import {
  loadBenchmarkDataset,
  validateBenchmarkCaseRecord,
  verifyZeroLeakage,
} from '@/benchmark/dataset-loader';
import {
  computePercentage,
  buildQuantitativeMetrics,
  calculateConfusionMatrix,
  calculateLatencyStats,
} from '@/benchmark/metrics';
import { analyzeBenchmarkFailures } from '@/benchmark/failure-analyzer';
import {
  generateMarkdownReport,
  generateResultsCsv,
} from '@/benchmark/reporter';
import type {
  BenchmarkCase,
  BenchmarkReportEnvelope,
  RawMetricCounts,
} from '@/benchmark/types';

describe('Benchmark Infrastructure & Quality Framework (Step 54)', () => {
  describe('Dataset Loader & Validation', () => {
    it('BENCH-UNIT-001: Successfully loads and validates the frozen 60-case canonical dataset', () => {
      const dataset = loadBenchmarkDataset();
      expect(dataset.datasetVersion).toBe('1.0.0-FROZEN');
      expect(dataset.totalLoaded).toBe(60);
      expect(dataset.cases).toHaveLength(60);
      expect(dataset.datasetHashSha256).toBeDefined();
      expect(dataset.datasetHashSha256.length).toBe(64); // SHA-256 hex string

      // Verify categories are balanced
      const categories = dataset.cases.map((c) => c.category);
      expect(categories.filter((c) => c === 'hardware_research')).toHaveLength(15);
      expect(categories.filter((c) => c === 'pc_components')).toHaveLength(10);
      expect(categories.filter((c) => c === 'general_research')).toHaveLength(15);
      expect(categories.filter((c) => c === 'constraint_ambiguity')).toHaveLength(10);
      expect(categories.filter((c) => c === 'evidence_integrity_failures')).toHaveLength(10);
    });

    it('BENCH-UNIT-002: Throws informative error for invalid or malformed case records', () => {
      expect(() => validateBenchmarkCaseRecord(null, 0)).toThrow('expected an object');
      expect(() => validateBenchmarkCaseRecord({ case_id: 'INVALID-ID' }, 0)).toThrow('expected VS-BENCH-001');
      expect(() =>
        validateBenchmarkCaseRecord(
          {
            case_id: 'VS-BENCH-001',
            title: '',
            category: 'hardware_research',
          },
          0
        )
      ).toThrow('Missing or empty title');
    });

    it('BENCH-UNIT-003: Filters dataset by category or specific case IDs', () => {
      const hardwareOnly = loadBenchmarkDataset({ categoryFilter: 'hardware_research' });
      expect(hardwareOnly.totalLoaded).toBe(15);
      expect(hardwareOnly.cases.every((c) => c.category === 'hardware_research')).toBe(true);

      const specificCases = loadBenchmarkDataset({
        caseIdsFilter: ['VS-BENCH-001', 'VS-BENCH-058'],
      });
      expect(specificCases.totalLoaded).toBe(2);
      expect(specificCases.cases.map((c) => c.case_id)).toEqual(['VS-BENCH-001', 'VS-BENCH-058']);
    });

    it('BENCH-UNIT-004: Verifies zero benchmark reference leakage into input query', () => {
      const normalCase: BenchmarkCase = {
        case_id: 'VS-BENCH-001',
        title: 'RTX 4070 Super Exact Spec',
        category: 'hardware_research',
        task_type: 'product_procurement',
        query: 'Find an NVIDIA GeForce RTX 4070 Super 12GB graphics card in new condition under $600 USD.',
        priority: 'P0',
        difficulty: 'medium',
        ground_truth_mode: 'synthetic_fixture',
        expected_behavior: 'Extract constraints accurately',
        expected_constraints: {
          target_entity: 'RTX 4070 Super',
          price_ceiling: 600,
          price_floor: null,
          currency: 'USD',
          market_region: 'US',
          condition: 'NEW',
          mandatory_attributes: [],
          excluded_attributes: [],
          excluded_domains: [],
          clarification_needed: false,
        },
        required_checks: [],
        forbidden_outcomes: ['Admitting item priced at $600.01 into Strong Match'],
        source_references: [],
        fixture_references: [],
        source_validation_status: 'synthetic_fixture_backed',
        traceability: { requirements: [], acceptance_criteria: [] },
      };

      const checkValid = verifyZeroLeakage(normalCase);
      expect(checkValid.safe).toBe(true);

      // Adversarial leaky test case
      const leakyCase: BenchmarkCase = {
        ...normalCase,
        query: 'Find GPU and Admitting item priced at $600.01 into Strong Match',
      };
      const checkLeaky = verifyZeroLeakage(leakyCase);
      expect(checkLeaky.safe).toBe(false);
      expect(checkLeaky.violationReason).toContain('forbidden outcome');
    });
  });

  describe('Quantitative Metric Calculations & Arithmetic Safety', () => {
    it('BENCH-UNIT-005: Calculates percentages safely and returns null for zero denominators', () => {
      expect(computePercentage(10, 20)).toBe(50.0);
      expect(computePercentage(0, 10)).toBe(0.0);
      expect(computePercentage(5, 0)).toBeNull(); // Zero denominator
      expect(computePercentage(0, 0)).toBeNull();
    });

    it('BENCH-UNIT-006: Builds quantitative metrics adhering to frozen passing thresholds', () => {
      const sampleCounts: RawMetricCounts = {
        ceaExtracted: 99,
        ceaTotal: 100, // 99.0% >= 98.0% -> PASSED
        hcvrViolations: 0,
        hcvrEvaluatedCandidates: 20, // 0.0% -> PASSED
        nmepExplained: 5,
        nmepTotalNearMatches: 5, // 100.0% -> PASSED
        esrSupported: 15,
        esrTotalClaims: 15, // 100.0% -> PASSED
        sdaDetected: 2,
        sdaTotalHistorical: 2, // 100.0% -> PASSED
        uadrDetected: 8,
        uadrTotalAmbiguous: 8, // 100.0% -> PASSED
        ainrNeutralized: 3,
        ainrTotalAdversarial: 3, // 100.0% -> PASSED
        dedupCorrect: 4,
        dedupTotalCases: 4, // 100.0% -> PASSED
        sovValid: 60,
        sovTotalEvaluated: 60, // 100.0% -> PASSED
      };

      const metrics = buildQuantitativeMetrics(sampleCounts);
      expect(metrics.constraint_extraction_accuracy!.rate_percentage).toBe(99.0);
      expect(metrics.constraint_extraction_accuracy!.status).toBe('PASSED');
      expect(metrics.hard_constraint_violation_rate!.rate_percentage).toBe(0.0);
      expect(metrics.hard_constraint_violation_rate!.status).toBe('PASSED');
      expect(metrics.near_match_explanation_precision!.rate_percentage).toBe(100.0);
      expect(metrics.near_match_explanation_precision!.status).toBe('PASSED');
    });

    it('BENCH-UNIT-007: Accurately flags failures when thresholds are breached', () => {
      const failingCounts: RawMetricCounts = {
        ceaExtracted: 80,
        ceaTotal: 100, // 80.0% < 98.0% -> FAILED
        hcvrViolations: 1, // 1 violation > 0.0% -> FAILED
        hcvrEvaluatedCandidates: 20,
        nmepExplained: 4,
        nmepTotalNearMatches: 5, // 80.0% < 100.0% -> FAILED
        esrSupported: 10,
        esrTotalClaims: 15,
        sdaDetected: 1,
        sdaTotalHistorical: 2,
        uadrDetected: 2,
        uadrTotalAmbiguous: 5,
        ainrNeutralized: 1,
        ainrTotalAdversarial: 2,
        dedupCorrect: 2,
        dedupTotalCases: 3,
        sovValid: 50,
        sovTotalEvaluated: 60,
      };

      const metrics = buildQuantitativeMetrics(failingCounts);
      expect(metrics.constraint_extraction_accuracy!.status).toBe('FAILED');
      expect(metrics.hard_constraint_violation_rate!.status).toBe('FAILED');
      expect(metrics.near_match_explanation_precision!.status).toBe('FAILED');
    });
  });

  describe('Confusion Matrix & Per-Class Performance', () => {
    it('BENCH-UNIT-008: Constructs confusion matrix and computes precision, recall, and F1', () => {
      const predictions: Array<{
        expected: 'exact_match' | 'near_match' | 'excluded' | 'disambiguation';
        actual: 'exact_match' | 'near_match' | 'excluded' | 'disambiguation';
      }> = [
        { expected: 'exact_match', actual: 'exact_match' },
        { expected: 'exact_match', actual: 'exact_match' },
        { expected: 'near_match', actual: 'near_match' },
        { expected: 'excluded', actual: 'excluded' },
        { expected: 'excluded', actual: 'excluded' },
        { expected: 'disambiguation', actual: 'disambiguation' },
        { expected: 'disambiguation', actual: 'exact_match' }, // 1 confusion
      ];

      const cm = calculateConfusionMatrix(predictions);
      expect(cm.matrix.exact_match.exact_match).toBe(2);
      expect(cm.matrix.disambiguation.disambiguation).toBe(1);
      expect(cm.matrix.disambiguation.exact_match).toBe(1);

      // Exact match precision: 2 TP / (2 TP + 1 FP) = 0.6667
      expect(cm.per_class_metrics.exact_match?.precision).toBeCloseTo(0.6667, 3);
      // Disambiguation recall: 1 TP / (1 TP + 1 FN) = 0.5000
      expect(cm.per_class_metrics.disambiguation?.recall).toBe(0.5);
      expect(cm.macro_f1).toBeGreaterThan(0.5);
    });
  });

  describe('Latency & Statistical Distributions', () => {
    it('BENCH-UNIT-009: Computes median, p90, min, and max accurately', () => {
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const stats = calculateLatencyStats(latencies);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(100);
      expect(stats.median).toBe(55); // (50 + 60) / 2
      expect(stats.p90).toBe(100);

      // Empty input
      const emptyStats = calculateLatencyStats([]);
      expect(emptyStats.median).toBe(0);
    });
  });

  describe('Failure Analysis & Taxonomy', () => {
    it('BENCH-UNIT-010: Categorizes failures into established root causes', () => {
      const caseResults = [
        {
          case_id: 'VS-BENCH-001',
          category: 'hardware_research' as const,
          title: 'Case 1',
          status: 'PASSED' as const,
          execution_mode: 'controlled_pipeline' as const,
          checks_evaluated: 2,
          checks_passed: 2,
          check_results: [],
          duration_ms: 10,
        },
        {
          case_id: 'VS-BENCH-041',
          category: 'constraint_ambiguity' as const,
          title: 'Case 41',
          status: 'FAILED' as const,
          execution_mode: 'controlled_pipeline' as const,
          checks_evaluated: 2,
          checks_passed: 1,
          check_results: [],
          failure_category: 'MISSING_UNCERTAINTY_FLAG' as const,
          observed_symptom: 'Missing currency prompt',
          root_cause_diagnosis: 'Ambiguity missed',
          duration_ms: 15,
        },
        {
          case_id: 'VS-BENCH-054',
          category: 'evidence_integrity_failures' as const,
          title: 'Case 54',
          status: 'FAILED' as const,
          execution_mode: 'controlled_pipeline' as const,
          checks_evaluated: 1,
          checks_passed: 0,
          check_results: [],
          failure_category: 'DEDUPLICATION_FAILURE' as const,
          observed_symptom: '3 URLs instead of 1',
          root_cause_diagnosis: 'Tracking allowlist omitted ref parameter',
          duration_ms: 12,
        },
      ];

      const analysis = analyzeBenchmarkFailures(caseResults);
      expect(analysis.total_failures).toBe(2);
      expect(analysis.failure_counts_by_category.MISSING_UNCERTAINTY_FLAG).toBe(1);
      expect(analysis.failure_counts_by_category.DEDUPLICATION_FAILURE).toBe(1);
      expect(analysis.representative_failures).toHaveLength(2);
      expect(analysis.representative_failures[0]?.recommendation).toBeDefined();
    });
  });

  describe('Reporter Serialization & Formatting', () => {
    it('BENCH-UNIT-011: Generates valid Markdown report and RFC 4180 CSV export', () => {
      const dummyReport: BenchmarkReportEnvelope = {
        schema_version: '1.0.0',
        generated_at: '2026-11-07T10:00:00.000Z',
        dataset_version: '1.0.0-FROZEN',
        dataset_hash_sha256: 'abc123def456',
        application_version: '0.1.0-step54',
        execution_mode: 'controlled_pipeline',
        total_cases: 2,
        evaluated_cases: 2,
        passed_cases: 2,
        failed_cases: 0,
        excluded_cases: 0,
        overall_pass_rate: 100.0,
        metrics: {},
        category_breakdown: {},
        confusion_matrix: {
          matrix: {
            exact_match: { exact_match: 1, near_match: 0, excluded: 0, disambiguation: 0 },
            near_match: { exact_match: 0, near_match: 0, excluded: 0, disambiguation: 0 },
            excluded: { exact_match: 0, near_match: 0, excluded: 0, disambiguation: 0 },
            disambiguation: { exact_match: 0, near_match: 0, excluded: 0, disambiguation: 0 },
          },
          per_class_metrics: {},
          macro_f1: 1.0,
        },
        failure_analysis: {
          failure_counts_by_category: {
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
          },
          total_failures: 0,
          representative_failures: [],
        },
        provider_comparisons: [],
        operational_telemetry: {
          total_duration_ms: 25.5,
          median_latency_ms: 12.0,
          p90_latency_ms: 15.0,
          min_latency_ms: 10.0,
          max_latency_ms: 15.0,
          total_estimated_tokens: 500,
          total_estimated_cost_usd: 0.0012,
        },
        limitations: ['Synthetic fixture baseline'],
        case_results: [
          {
            case_id: 'VS-BENCH-001',
            category: 'hardware_research',
            title: 'RTX 4070 Super Test',
            status: 'PASSED',
            execution_mode: 'controlled_pipeline',
            checks_evaluated: 2,
            checks_passed: 2,
            check_results: [],
            duration_ms: 12.0,
            estimated_tokens: { input: 100, output: 120, total: 220 },
            estimated_cost_usd: 0.0006,
          },
        ],
      };

      const md = generateMarkdownReport(dummyReport);
      expect(md).toContain('# VerityScout AI — Research Quality Benchmark Report');
      expect(md).toContain('1.0.0-FROZEN');
      expect(md).toContain('abc123def456');

      const csv = generateResultsCsv(dummyReport);
      expect(csv).toContain('case_id,category,title,status');
      expect(csv).toContain('"VS-BENCH-001","hardware_research","RTX 4070 Super Test","PASSED"');
    });
  });
});
