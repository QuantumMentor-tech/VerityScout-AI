import { describe, it, expect } from 'vitest';
import {
  serializeRunToJson,
  serializeHistoryToJson,
} from '@/server/export/json-serializer';
import {
  ResearchRunExportSnapshot,
  HistoryExportSnapshot,
  EXPORT_SCHEMA_VERSION,
} from '@/server/export/export.types';
import {
  RunStatus,
  RunStage,
  TaskType,
  MatchClassification,
  VerificationState,
  ChangeType,
  ChangeStatus,
  ComparisonStatus,
} from '@/server/persistence/types';

describe('JSON Serializer (Step 49)', () => {
  const mockSnapshot: ResearchRunExportSnapshot = {
    run: {
      id: 'run-1',
      task_id: 'task-1',
      user_id: 'user-1',
      schedule_id: 'sched-1',
      idempotency_key: 'idem-1',
      status: RunStatus.COMPLETED,
      current_stage: RunStage.FINALIZING,
      stage_counters: {
        queriesExecuted: 2,
        sourcesDiscovered: 6,
        sourcesExtracted: 6,
        claimsVerified: 12,
      },
      usage: {
        promptTokens: 120,
        completionTokens: 250,
        searchCredits: 2,
        estimatedCostUsd: '0.0150',
      },
      selected_provider: 'openai',
      selected_model: 'gpt-4o',
      error_message: null,
      cancellation_reason: null,
      progress_percent: 100,
      execution_duration_ms: 3500,
      synthesis: {
        summary: 'All sources confirm Lenovo ThinkPad T14 AMD in stock at $649.99.',
      },
      started_at: '2026-11-06T08:00:00.000Z',
      completed_at: '2026-11-06T08:00:03.500Z',
    },
    task: {
      id: 'task-1',
      user_id: 'user-1',
      title: 'ThinkPad T14 AMD Research',
      original_query: 'lenovo thinkpad t14 gen 3 amd ryzen 7',
      task_type: TaskType.PRODUCT_RESEARCH,
      constraints: { maxPrice: '800', condition: 'NEW' } as any,
      limits: {} as any,
      model_policy: {} as any,
      is_archived: false,
      created_at: '2026-11-06T07:59:00.000Z',
      updated_at: '2026-11-06T07:59:00.000Z',
    },
    schedule: {
      id: 'sched-1',
      task_id: 'task-1',
      user_id: 'user-1',
      name: 'Daily ThinkPad Monitor',
      cron_expression: '0 9 * * *',
      timezone: 'America/New_York',
      scheduled_time: '09:00',
      recurrence_rule: {} as any,
      status: 'ACTIVE' as any,
      revision: 1,
      next_run_at: '2026-11-07T14:00:00.000Z',
      last_run_at: '2026-11-06T08:00:00.000Z',
      last_dispatched_at: '2026-11-06T08:00:00.000Z',
      last_run_id: 'run-1',
      change_notification_threshold_pct: 0,
      request_snapshot: {},
      consecutive_failures: 0,
      created_at: '2026-11-01T08:00:00.000Z',
      updated_at: '2026-11-06T08:00:00.000Z',
    },
    candidates: [
      {
        id: 'cand-1',
        run_id: 'run-1',
        user_id: 'user-1',
        title: 'Lenovo ThinkPad T14 Gen 3 AMD',
        product_identifier: '21CF003VUS',
        seller_or_domain: 'lenovo.com',
        canonical_url: 'https://lenovo.com/p/21CF003VUS',
        price_usd: '649.99',
        currency: 'USD',
        availability: 'IN_STOCK',
        condition: 'NEW',
        specifications: { ram: '16 GB', storage: '512 GB' },
        classification: MatchClassification.EXACT_MATCH,
        constraint_evaluation: {
          passedConstraints: ['maxPrice', 'condition'],
          failedConstraints: [],
        },
        created_at: '2026-11-06T08:00:02.000Z',
      },
    ],
    evidence: [
      {
        id: 'ev-1',
        run_id: 'run-1',
        source_id: 'src-1',
        user_id: 'user-1',
        candidate_id: 'cand-1',
        claim_key: 'price',
        extracted_raw_value: '$649.99',
        normalized_value: '649.99',
        unit_or_currency: 'USD',
        verbatim_quote: 'Sale price: $649.99 with free shipping',
        verification_state: VerificationState.SUPPORTED,
        conflict_details: null,
        extraction_method: 'DOM_SELECTOR',
        location_in_document: '#price',
        confidence_score: '0.99',
        extracted_at: '2026-11-06T08:00:02.000Z',
      },
    ],
    sources: [
      {
        id: 'src-1',
        run_id: 'run-1',
        user_id: 'user-1',
        original_url: 'https://lenovo.com/p/21CF003VUS?tracker=1',
        canonical_url: 'https://lenovo.com/p/21CF003VUS',
        domain: 'lenovo.com',
        title: 'Lenovo ThinkPad T14 AMD Store',
        discovery_provider: 'tavily',
        access_state: 'ACCESSIBLE' as any,
        extraction_state: 'COMPLETED' as any,
        http_status_code: 200,
        content_hash: 'hash-abc',
        extracted_text_excerpt: 'Excerpt',
        retrieved_at: '2026-11-06T08:00:01.000Z',
        published_at: null,
      },
    ],
    comparison: {
      id: 'comp-1',
      task_id: 'task-1',
      schedule_id: 'sched-1',
      user_id: 'user-1',
      baseline_run_id: 'run-base',
      current_run_id: 'run-1',
      status: ComparisonStatus.CHANGES_DETECTED,
      comparison_policy_version: 'v1.0',
      reason_code: null,
      summary: { totalCompared: 1, changedCount: 1 },
      detected_at: '2026-11-06T08:00:03.000Z',
      created_at: '2026-11-06T08:00:03.000Z',
    },
    changes: [
      {
        id: 'ch-1',
        task_id: 'task-1',
        schedule_id: 'sched-1',
        user_id: 'user-1',
        previous_run_id: 'run-base',
        current_run_id: 'run-1',
        comparison_id: 'comp-1',
        candidate_id: 'cand-1',
        candidate_title: 'Lenovo ThinkPad T14 Gen 3 AMD',
        canonical_url: 'https://lenovo.com/p/21CF003VUS',
        field_name: 'price',
        change_type: ChangeType.PRICE_DROP,
        change_status: ChangeStatus.SUPPORTED,
        reason_code: 'PRICE_DROP_CONFIRMED',
        previous_value: '749.99 USD',
        new_value: '649.99 USD',
        percentage_delta: '-13.3300',
        evidence_id: 'ev-1',
        baseline_evidence_id: 'ev-0',
        explanation: 'Price dropped by $100.',
        idempotency_key: 'idem-ch-1',
        detected_at: '2026-11-06T08:00:03.000Z',
      },
    ],
  };

  it('produces valid UTF-8 JSON conforming to the versioned envelope schema', () => {
    const jsonStr = serializeRunToJson(mockSnapshot);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.export_metadata.export_scope).toBe('single_run');
    expect(parsed.export_metadata.format).toBe('json');
    expect(parsed.export_metadata.record_counts.candidates).toBe(1);
    expect(parsed.export_metadata.record_counts.evidence).toBe(1);
    expect(parsed.export_metadata.record_counts.sources).toBe(1);
    expect(parsed.export_metadata.record_counts.changes).toBe(1);

    expect(parsed.data.run.id).toBe('run-1');
    expect(parsed.data.task.original_query).toBe('lenovo thinkpad t14 gen 3 amd ryzen 7');
    expect(parsed.data.schedule.name).toBe('Daily ThinkPad Monitor');
    expect(parsed.data.results[0].price_numeric).toBe(649.99);
    expect(parsed.data.results[0].classification).toBe('EXACT_MATCH');
    expect(parsed.data.evidence[0].extracted_raw_value).toBe('$649.99');
    expect(parsed.data.comparison.status).toBe('CHANGES_DETECTED');
    expect(parsed.data.changes[0].percentage_delta).toBe(-13.33);
  });

  it('does NOT leak API keys, vault tokens, or connection credentials', () => {
    const jsonStr = serializeRunToJson(mockSnapshot);

    expect(jsonStr).not.toContain('apiKey');
    expect(jsonStr).not.toContain('api_key');
    expect(jsonStr).not.toContain('secret');
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('connectionString');
    expect(jsonStr).not.toContain('credential');
  });

  it('serializes research history snapshots accurately', () => {
    const historySnapshot: HistoryExportSnapshot = {
      runs: [
        {
          runId: 'run-10',
          taskId: 'task-10',
          taskTitle: 'Monitor GPU Prices',
          query: 'rtx 4090',
          taskType: 'PRICE_MONITOR',
          status: 'COMPLETED',
          candidateCount: 3,
          queriesExecuted: 1,
          sourcesDiscovered: 4,
          sourcesExtracted: 4,
          claimsVerified: 6,
          startedAt: '2026-11-06T08:00:00.000Z',
          createdAt: '2026-11-06T08:00:00.000Z',
        },
      ],
      totalCount: 1,
      filtersApplied: { status: 'COMPLETED' },
    };

    const jsonStr = serializeHistoryToJson(historySnapshot);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.export_metadata.export_scope).toBe('history');
    expect(parsed.data.total_count).toBe(1);
    expect(parsed.data.runs[0].query).toBe('rtx 4090');
    expect(parsed.data.filters_applied.status).toBe('COMPLETED');
  });
});
