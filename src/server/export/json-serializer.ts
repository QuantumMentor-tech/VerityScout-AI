import 'server-only';
import {
  EXPORT_SCHEMA_VERSION,
  JsonExportEnvelope,
  ResearchRunExportSnapshot,
  HistoryExportSnapshot,
} from './export.types';

/**
 * Serializes a complete research run snapshot into a versioned, secure JSON export envelope.
 * Excludes internal database internals, credentials, and credentials vault tokens.
 */
export function serializeRunToJson(snapshot: ResearchRunExportSnapshot): string {
  const { run, task, schedule, candidates, evidence, sources, comparison, changes } = snapshot;

  const envelope: JsonExportEnvelope = {
    schema_version: EXPORT_SCHEMA_VERSION,
    export_metadata: {
      exported_at: new Date().toISOString(),
      export_scope: 'single_run',
      format: 'json',
      generator: 'VerityScout AI Research Export Engine v1.0',
      record_counts: {
        candidates: candidates.length,
        evidence: evidence.length,
        sources: sources.length,
        changes: changes?.length ?? 0,
      },
    },
    data: {
      run: {
        id: run.id,
        task_id: run.task_id,
        status: run.status,
        current_stage: run.current_stage,
        stage_counters: run.stage_counters,
        usage: {
          prompt_tokens: run.usage?.promptTokens ?? 0,
          completion_tokens: run.usage?.completionTokens ?? 0,
          search_credits: run.usage?.searchCredits ?? 0,
          estimated_cost_usd: run.usage?.estimatedCostUsd ?? '0.0000',
        },
        selected_provider: run.selected_provider,
        selected_model: run.selected_model,
        progress_percent: run.progress_percent ?? 100,
        execution_duration_ms: run.execution_duration_ms ?? null,
        error_message: run.error_message,
        cancellation_reason: run.cancellation_reason,
        started_at: run.started_at,
        completed_at: run.completed_at,
      },
      task: {
        id: task.id,
        title: task.title,
        original_query: task.original_query,
        task_type: task.task_type,
        constraints: task.constraints ?? {},
        limits: task.limits ?? {},
        created_at: task.created_at,
      },
      schedule: schedule
        ? {
            id: schedule.id,
            name: schedule.name,
            cron_expression: schedule.cron_expression,
            timezone: schedule.timezone,
            status: schedule.status,
            revision: schedule.revision,
          }
        : null,
      results: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        product_identifier: c.product_identifier,
        seller_or_domain: c.seller_or_domain,
        canonical_url: c.canonical_url,
        price_numeric: c.price_usd != null ? Number(c.price_usd) : null,
        currency: c.currency,
        availability: c.availability,
        condition: c.condition,
        classification: c.classification,
        specifications: c.specifications ?? {},
        constraint_evaluation: c.constraint_evaluation ?? {
          passedConstraints: [],
          failedConstraints: [],
        },
        created_at: c.created_at,
      })),
      evidence: evidence.map((e) => ({
        id: e.id,
        candidate_id: e.candidate_id,
        source_id: e.source_id,
        claim_key: e.claim_key,
        extracted_raw_value: e.extracted_raw_value,
        normalized_value: e.normalized_value,
        unit_or_currency: e.unit_or_currency,
        verbatim_quote: e.verbatim_quote,
        verification_state: e.verification_state,
        conflict_details: e.conflict_details,
        extraction_method: e.extraction_method,
        confidence_score: e.confidence_score != null ? Number(e.confidence_score) : null,
        extracted_at: e.extracted_at,
      })),
      sources: sources.map((s) => ({
        id: s.id,
        original_url: s.original_url,
        canonical_url: s.canonical_url,
        domain: s.domain,
        title: s.title,
        access_state: s.access_state,
        extraction_state: s.extraction_state,
        http_status_code: s.http_status_code,
        published_at: s.published_at,
        retrieved_at: s.retrieved_at,
      })),
      synthesis: run.synthesis ?? null,
      comparison: comparison
        ? {
            id: comparison.id,
            baseline_run_id: comparison.baseline_run_id,
            current_run_id: comparison.current_run_id,
            status: comparison.status,
            comparison_policy_version: comparison.comparison_policy_version,
            reason_code: comparison.reason_code,
            summary: comparison.summary,
            detected_at: comparison.detected_at,
          }
        : null,
      changes:
        changes?.map((ch) => ({
          id: ch.id,
          candidate_id: ch.candidate_id,
          candidate_title: ch.candidate_title,
          canonical_url: ch.canonical_url,
          field_name: ch.field_name,
          change_type: ch.change_type,
          change_status: ch.change_status,
          reason_code: ch.reason_code,
          previous_value: ch.previous_value,
          new_value: ch.new_value,
          percentage_delta: ch.percentage_delta != null ? Number(ch.percentage_delta) : null,
          explanation: ch.explanation,
          evidence_id: ch.evidence_id,
          baseline_evidence_id: ch.baseline_evidence_id,
          detected_at: ch.detected_at,
        })) ?? [],
    },
  };

  return JSON.stringify(envelope, null, 2);
}

/**
 * Serializes a research history collection into a versioned JSON export envelope.
 */
export function serializeHistoryToJson(snapshot: HistoryExportSnapshot): string {
  const envelope: JsonExportEnvelope = {
    schema_version: EXPORT_SCHEMA_VERSION,
    export_metadata: {
      exported_at: new Date().toISOString(),
      export_scope: 'history',
      format: 'json',
      generator: 'VerityScout AI Research Export Engine v1.0',
      record_counts: {
        total_runs: snapshot.runs.length,
      },
    },
    data: {
      filters_applied: snapshot.filtersApplied ?? {},
      total_count: snapshot.totalCount,
      runs: snapshot.runs,
    },
  };

  return JSON.stringify(envelope, null, 2);
}

