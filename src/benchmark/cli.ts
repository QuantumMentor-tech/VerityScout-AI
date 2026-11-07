#!/usr/bin/env node

// Stub 'server-only' package for standalone CLI benchmarking in Node.js
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
} catch {
  // Ignore if server-only cannot be resolved
}

import type { BenchmarkCategory, ExecutionMode } from './types';

async function main(): Promise<void> {
  const { runBenchmark } = await import('./runner');

  const args = process.argv.slice(2);
  let categoryFilter: BenchmarkCategory | 'ALL' = 'ALL';
  let executionMode: ExecutionMode = 'controlled_pipeline';

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      categoryFilter = arg.split('=')[1] as BenchmarkCategory;
    } else if (arg.startsWith('--mode=')) {
      executionMode = arg.split('=')[1] as ExecutionMode;
    }
  }

  console.info('='.repeat(70));
  console.info('🚀 VerityScout AI — Research Quality Benchmark Runner (Step 54)');
  console.info(`Mode: ${executionMode} | Category: ${categoryFilter}`);
  console.info('='.repeat(70));

  try {
    const report = await runBenchmark({
      categoryFilter,
      executionMode,
      writeArtifacts: true,
    });

    console.info('\n📊 Benchmark Execution Summary:');
    console.info(`- Total Cases: ${report.total_cases}`);
    console.info(`- Evaluated: ${report.evaluated_cases}`);
    console.info(`- Passed: ${report.passed_cases}`);
    console.info(`- Failed: ${report.failed_cases}`);
    console.info(`- Overall Pass Rate: ${report.overall_pass_rate.toFixed(1)}%`);
    console.info(`- Execution Duration: ${report.operational_telemetry.total_duration_ms.toFixed(0)}ms`);
    console.info(`- Total Estimated Tokens: ${report.operational_telemetry.total_estimated_tokens.toLocaleString()}`);
    console.info(`- Incurred Cost: $0.0000 USD (Synthetic/Deterministic Controlled Mode)`);

    console.info('\n📈 Core Quality Metrics:');
    for (const [, m] of Object.entries(report.metrics)) {
      const rate = m.rate_percentage !== null ? `${m.rate_percentage.toFixed(1)}%` : 'N/A';
      console.info(`  • ${m.metric_name}: ${rate} [Target: ${m.target_threshold}] -> ${m.status}`);
    }

    console.info('\n📁 Artifacts Generated:');
    console.info('  • Markdown Report: docs/benchmark/RESEARCH_QUALITY_BENCHMARK_REPORT.md');
    console.info('  • Structured JSON: data/benchmark/benchmark_results.json');
    console.info('  • CSV Export:      data/benchmark/benchmark_results.csv');
    console.info('='.repeat(70));
    console.info('✅ Benchmark execution completed successfully.');
  } catch (err: unknown) {
    console.error('\n❌ Benchmark execution failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal benchmark runner error:', err);
  process.exit(1);
});
