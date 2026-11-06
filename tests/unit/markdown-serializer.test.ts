import { describe, it, expect } from 'vitest';
import {
  escapeMarkdownTableCell,
  escapeMarkdownText,
  serializeRunToMarkdown,
  serializeHistoryToMarkdown,
} from '@/server/export/markdown-serializer';
import {
  ResearchRunExportSnapshot,
  HistoryExportSnapshot,
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

describe('Markdown Serializer & Injection Safety (Step 49)', () => {
  describe('Escaping Helpers', () => {
    it('escapes table cell pipes, angle brackets, and newlines', () => {
      expect(escapeMarkdownTableCell('A | B')).toBe('A \\| B');
      expect(escapeMarkdownTableCell('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(escapeMarkdownTableCell('Line 1\nLine 2')).toBe('Line 1 Line 2');
    });

    it('escapes raw HTML-like text in text blocks', () => {
      expect(escapeMarkdownText('Check <device> model')).toBe('Check &lt;device&gt; model');
    });
  });

  describe('Report Serialization', () => {
    const mockSnapshot: ResearchRunExportSnapshot = {
      run: {
        id: 'run-md-1',
        task_id: 'task-1',
        user_id: 'user-1',
        schedule_id: 'sched-1',
        idempotency_key: 'idem-1',
        status: RunStatus.COMPLETED,
        current_stage: RunStage.FINALIZING,
        stage_counters: { queriesExecuted: 1, sourcesDiscovered: 4, sourcesExtracted: 4, claimsVerified: 8 },
        usage: { promptTokens: 50, completionTokens: 100, searchCredits: 1, estimatedCostUsd: '0.0050' },
        selected_provider: 'openai',
        selected_model: 'gpt-4o',
        error_message: null,
        cancellation_reason: null,
        execution_duration_ms: 2500,
        synthesis: {
          summary: 'Framework Laptop 13 is confirmed in stock.',
          findings: ['Core i7-1360P model available', 'Battery life verified at 12 hours'],
          conflicts: ['Vendor claims 16h battery while independent review measured 11.5h'],
          limitations: ['Shipping dates vary by region'],
        },
        started_at: '2026-11-06T08:00:00.000Z',
        completed_at: '2026-11-06T08:00:02.500Z',
      },
      task: {
        id: 'task-1',
        user_id: 'user-1',
        title: 'Framework Laptop 13 Audit',
        original_query: 'framework laptop 13 intel 13th gen',
        task_type: TaskType.PRODUCT_RESEARCH,
        constraints: { minRam: '16 GB' } as any,
        limits: {} as any,
        model_policy: {} as any,
        is_archived: false,
        created_at: '2026-11-06T07:59:00.000Z',
        updated_at: '2026-11-06T07:59:00.000Z',
      },
      candidates: [
        {
          id: 'cand-1',
          run_id: 'run-md-1',
          user_id: 'user-1',
          title: 'Framework Laptop 13 (Intel 13th Gen)',
          product_identifier: 'FRMW-13-INTEL',
          seller_or_domain: 'frame.work',
          canonical_url: 'https://frame.work/products/laptop-13-gen-intel',
          price_usd: '1049.00',
          currency: 'USD',
          availability: 'IN_STOCK',
          condition: 'NEW',
          specifications: { ram: '16 GB', display: '13.5 inch' },
          classification: MatchClassification.EXACT_MATCH,
          constraint_evaluation: { passedConstraints: ['minRam'], failedConstraints: [] },
          created_at: '2026-11-06T08:00:01.000Z',
        },
      ],
      evidence: [
        {
          id: 'ev-1',
          run_id: 'run-md-1',
          source_id: 'src-1',
          user_id: 'user-1',
          candidate_id: 'cand-1',
          claim_key: 'price',
          extracted_raw_value: '$1,049.00',
          normalized_value: '1049.00',
          unit_or_currency: 'USD',
          verbatim_quote: 'Pre-order starting at $1,049.00 with free shipping',
          verification_state: VerificationState.SUPPORTED,
          conflict_details: null,
          extraction_method: 'DOM_SELECTOR',
          location_in_document: '#price',
          confidence_score: '0.99',
          extracted_at: '2026-11-06T08:00:01.000Z',
        },
      ],
      sources: [
        {
          id: 'src-1',
          run_id: 'run-md-1',
          user_id: 'user-1',
          original_url: 'https://frame.work/products/laptop-13-gen-intel?ref=1',
          canonical_url: 'https://frame.work/products/laptop-13-gen-intel',
          domain: 'frame.work',
          title: 'Framework | Laptop 13',
          discovery_provider: 'tavily',
          access_state: 'ACCESSIBLE' as any,
          extraction_state: 'COMPLETED' as any,
          http_status_code: 200,
          content_hash: 'hash-xyz',
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
        current_run_id: 'run-md-1',
        status: ComparisonStatus.CHANGES_DETECTED,
        comparison_policy_version: 'v1.0',
        reason_code: null,
        summary: { totalCompared: 1, changedCount: 1 },
        detected_at: '2026-11-06T08:00:02.000Z',
        created_at: '2026-11-06T08:00:02.000Z',
      },
      changes: [
        {
          id: 'ch-1',
          task_id: 'task-1',
          schedule_id: 'sched-1',
          user_id: 'user-1',
          previous_run_id: 'run-base',
          current_run_id: 'run-md-1',
          comparison_id: 'comp-1',
          candidate_id: 'cand-1',
          candidate_title: 'Framework Laptop 13 (Intel 13th Gen)',
          canonical_url: 'https://frame.work/products/laptop-13-gen-intel',
          field_name: 'price',
          change_type: ChangeType.PRICE_DROP,
          change_status: ChangeStatus.SUPPORTED,
          reason_code: 'PRICE_DROP_CONFIRMED',
          previous_value: '1199.00 USD',
          new_value: '1049.00 USD',
          percentage_delta: '-12.5100',
          evidence_id: 'ev-1',
          baseline_evidence_id: 'ev-0',
          explanation: 'Price reduced by $150.',
          idempotency_key: 'idem-ch-1',
          detected_at: '2026-11-06T08:00:02.000Z',
        },
      ],
    };

    it('generates structured Markdown containing metadata, synthesis, candidates, and citations', () => {
      const md = serializeRunToMarkdown(mockSnapshot);

      expect(md).toContain('# Research Verification Report');
      expect(md).toContain('**Query:** framework laptop 13 intel 13th gen');
      expect(md).toContain('| **Status** | **COMPLETED** |');
      expect(md).toContain('## Research Synthesis');
      expect(md).toContain('Framework Laptop 13 is confirmed in stock.');
      expect(md).toContain('⚠️ **Conflict:**');
      expect(md).toContain('## Candidate Evaluation Results (1)');
      expect(md).toContain('[Framework Laptop 13 (Intel 13th Gen)](https://frame.work/products/laptop-13-gen-intel)');
      expect(md).toContain('1049.00 USD');
      expect(md).toContain('EXACT_MATCH');
      expect(md).toContain('## Grounded Evidence Claims (1)');
      expect(md).toContain('[frame.work](https://frame.work/products/laptop-13-gen-intel)');
      expect(md).toContain('Pre-order starting at $1,049.00 with free shipping');
      expect(md).toContain('## Observation Changes Detected vs Baseline');
      expect(md).toContain('PRICE_DROP');
      expect(md).toContain('-12.5%');
    });

    it('serializes history summary table to Markdown', () => {
      const historySnapshot: HistoryExportSnapshot = {
        runs: [
          {
            runId: 'run-1',
            taskId: 'task-1',
            taskTitle: 'Monitor ThinkPad T14',
            query: 'thinkpad t14',
            taskType: 'PRICE_MONITOR',
            status: 'COMPLETED',
            candidateCount: 2,
            queriesExecuted: 1,
            sourcesDiscovered: 5,
            sourcesExtracted: 5,
            claimsVerified: 10,
            selectedModel: 'gpt-4o',
            durationMs: 3100,
            startedAt: '2026-11-06T08:00:00.000Z',
            createdAt: '2026-11-06T08:00:00.000Z',
          },
        ],
        totalCount: 1,
      };

      const md = serializeHistoryToMarkdown(historySnapshot);
      expect(md).toContain('# Research History Audit Export');
      expect(md).toContain('| Run ID | Title / Query | Status | Model | Candidates | Started At | Duration |');
      expect(md).toContain('Monitor ThinkPad T14');
      expect(md).toContain('gpt-4o');
      expect(md).toContain('3.1s');
    });
  });
});
