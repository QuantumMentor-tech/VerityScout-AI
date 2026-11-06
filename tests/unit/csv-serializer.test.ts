import { describe, it, expect } from 'vitest';
import {
  sanitizeCsvCell,
  serializeToCsv,
  serializeCandidatesCsv,
  serializeEvidenceCsv,
  serializeChangesCsv,
  serializeHistoryCsv,
  isNumericString,
} from '@/server/export/csv-serializer';
import {
  CandidateResultRow,
  EvidenceRecordRow,
  SourceDocumentRow,
  ChangeEventRow,
  MatchClassification,
  VerificationState,
  ChangeType,
  ChangeStatus,
} from '@/server/persistence/types';
import { EnrichedHistoryItem } from '@/server/export/export.types';

describe('CSV Serializer & Formula Injection Protection (Step 49)', () => {
  describe('Formula Injection Mitigation (SEC-025 / OWASP ASVS)', () => {
    it('escapes dangerous text values starting with = by prepending single quote', () => {
      const hostile1 = '=cmd|\' /C calc\'!A0';
      const hostile2 = '=SUM(A1:B10)';
      const hostile3 = '   =HYPERLINK("http://evil.com", "Click")';

      expect(sanitizeCsvCell(hostile1)).toBe('\'=cmd|\' /C calc\'!A0');
      expect(sanitizeCsvCell(hostile2)).toBe('\'=SUM(A1:B10)');
      expect(sanitizeCsvCell(hostile3)).toBe('"\'   =HYPERLINK(""http://evil.com"", ""Click"")"');
    });

    it('escapes dangerous text values starting with +, @, \\t, \\r', () => {
      expect(sanitizeCsvCell('+cmd|')).toBe('\'+cmd|');
      expect(sanitizeCsvCell('@SUM(12)')).toBe('\'@SUM(12)');
      expect(sanitizeCsvCell('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
      expect(sanitizeCsvCell('\t=evil()')).toBe('\'\t=evil()');
      expect(sanitizeCsvCell('+1 (800) 555-0199')).toBe('\'+1 (800) 555-0199');
    });

    it('preserves valid negative and positive numbers without prepending quotes', () => {
      // Normal numbers must NOT be mangled
      expect(sanitizeCsvCell(-15.2)).toBe('-15.2');
      expect(sanitizeCsvCell(42)).toBe('42');
      expect(sanitizeCsvCell(0)).toBe('0');
      expect(sanitizeCsvCell('-15.20')).toBe('-15.20');
      expect(sanitizeCsvCell('+99.99')).toBe('+99.99');
      expect(sanitizeCsvCell('-0.005')).toBe('-0.005');
      expect(sanitizeCsvCell('1e-5')).toBe('1e-5');
    });

    it('escapes text starting with - that is NOT a valid number', () => {
      expect(sanitizeCsvCell('-cmd|\' /C calc\'')).toBe('\'-cmd|\' /C calc\'');
      expect(sanitizeCsvCell('-2+3+cmd')).toBe('\'-2+3+cmd');
    });

    it('identifies numeric strings accurately', () => {
      expect(isNumericString('-15.2')).toBe(true);
      expect(isNumericString('100')).toBe(true);
      expect(isNumericString('+5')).toBe(true);
      expect(isNumericString('-0.0001')).toBe(true);
      expect(isNumericString('-15.2.3')).toBe(false);
      expect(isNumericString('-cmd')).toBe(false);
      expect(isNumericString('=100')).toBe(false);
    });
  });

  describe('RFC 4180 Escaping', () => {
    it('escapes commas, double quotes, and embedded newlines correctly', () => {
      const withComma = 'Dell, Inc.';
      expect(sanitizeCsvCell(withComma)).toBe('"Dell, Inc."');

      const withQuote = '15.6" OLED Display';
      expect(sanitizeCsvCell(withQuote)).toBe('"15.6"" OLED Display"');

      const withNewline = 'Line 1\nLine 2';
      expect(sanitizeCsvCell(withNewline)).toBe('"Line 1\nLine 2"');
    });

    it('generates well-formed CSV with CRLF line endings', () => {
      const headers = ['id', 'title', 'price'];
      const rows = [
        ['1', 'Product A', 99.99],
        ['2', 'Product B, Deluxe', -10],
      ];

      const csv = serializeToCsv(headers, rows);
      expect(csv).toBe('id,title,price\r\n1,Product A,99.99\r\n2,"Product B, Deluxe",-10\r\n');
    });
  });

  describe('Specialized Dataset Serializers', () => {
    it('serializes candidates dataset correctly', () => {
      const candidates: CandidateResultRow[] = [
        {
          id: 'cand-1',
          run_id: 'run-1',
          user_id: 'user-1',
          title: 'Sony WH-1000XM5',
          product_identifier: 'WH1000XM5',
          seller_or_domain: 'amazon.com',
          canonical_url: 'https://amazon.com/dp/B09XS7JWHH',
          price_usd: '398.00',
          currency: 'USD',
          availability: 'IN_STOCK',
          condition: 'NEW',
          specifications: { weight: '250 g' },
          classification: MatchClassification.EXACT_MATCH,
          constraint_evaluation: { passedConstraints: ['price', 'brand'], failedConstraints: [] },
          created_at: '2026-11-06T08:00:00.000Z',
        },
      ];

      const csv = serializeCandidatesCsv(candidates, 'run-1');
      expect(csv).toContain('run_id,candidate_id,title,product_identifier');
      expect(csv).toContain('cand-1,Sony WH-1000XM5,WH1000XM5');
      expect(csv).toContain('EXACT_MATCH');
      expect(csv).toContain('price; brand');
    });

    it('serializes evidence dataset with source URL joins', () => {
      const evidence: EvidenceRecordRow[] = [
        {
          id: 'ev-1',
          run_id: 'run-1',
          source_id: 'src-1',
          user_id: 'user-1',
          candidate_id: 'cand-1',
          claim_key: 'price',
          extracted_raw_value: '$398.00',
          normalized_value: '398.00',
          unit_or_currency: 'USD',
          verbatim_quote: 'Now $398.00 with free delivery',
          verification_state: VerificationState.SUPPORTED,
          conflict_details: null,
          extraction_method: 'DOM_SELECTOR',
          location_in_document: '#price',
          confidence_score: '0.98',
          extracted_at: '2026-11-06T08:00:00.000Z',
        },
      ];

      const sources: SourceDocumentRow[] = [
        {
          id: 'src-1',
          run_id: 'run-1',
          user_id: 'user-1',
          original_url: 'https://amazon.com/dp/B09XS7JWHH?ref=sr',
          canonical_url: 'https://amazon.com/dp/B09XS7JWHH',
          domain: 'amazon.com',
          title: 'Sony WH-1000XM5 Product Page',
          discovery_provider: 'tavily',
          access_state: 'ACCESSIBLE' as any,
          extraction_state: 'COMPLETED' as any,
          http_status_code: 200,
          content_hash: 'hash-1',
          extracted_text_excerpt: 'Excerpt',
          retrieved_at: '2026-11-06T08:00:00.000Z',
          published_at: null,
        },
      ];

      const csv = serializeEvidenceCsv(evidence, sources, 'run-1');
      expect(csv).toContain('run_id,evidence_id,candidate_id,source_id,source_url');
      expect(csv).toContain('ev-1,cand-1,src-1,https://amazon.com/dp/B09XS7JWHH');
      expect(csv).toContain('SUPPORTED');
    });

    it('serializes changes dataset with signed percentage deltas', () => {
      const changes: ChangeEventRow[] = [
        {
          id: 'change-1',
          task_id: 'task-1',
          schedule_id: 'sched-1',
          user_id: 'user-1',
          previous_run_id: 'run-base',
          current_run_id: 'run-curr',
          comparison_id: 'comp-1',
          candidate_id: 'cand-1',
          candidate_title: 'MacBook Pro 14 M3',
          canonical_url: 'https://apple.com/macbook-pro',
          field_name: 'price',
          change_type: ChangeType.PRICE_DROP,
          change_status: ChangeStatus.SUPPORTED,
          reason_code: 'PRICE_DROP_CONFIRMED',
          previous_value: '1599.00 USD',
          new_value: '1399.00 USD',
          percentage_delta: '-12.5100',
          evidence_id: 'ev-1',
          baseline_evidence_id: 'ev-0',
          explanation: 'Price decreased by 12.51%.',
          idempotency_key: 'idem-1',
          detected_at: '2026-11-06T08:00:00.000Z',
        },
      ];

      const csv = serializeChangesCsv(changes, 'run-curr');
      expect(csv).toContain('change_type,change_status,reason_code');
      expect(csv).toContain('PRICE_DROP,SUPPORTED,PRICE_DROP_CONFIRMED');
      expect(csv).toContain('-12.51');
    });

    it('serializes history summary dataset', () => {
      const history: EnrichedHistoryItem[] = [
        {
          runId: 'run-1',
          taskId: 'task-1',
          taskTitle: 'Monitor RTX 4090 GPU Prices',
          query: 'geforce rtx 4090 24gb',
          taskType: 'PRICE_MONITOR',
          status: 'COMPLETED',
          scheduleId: 'sched-1',
          scheduleName: 'Daily GPU Price Check',
          queriesExecuted: 2,
          sourcesDiscovered: 10,
          sourcesExtracted: 8,
          claimsVerified: 15,
          candidateCount: 4,
          totalCostUsd: '0.0125',
          selectedModel: 'gpt-4o',
          durationMs: 4200,
          startedAt: '2026-11-06T08:00:00.000Z',
          completedAt: '2026-11-06T08:00:04.200Z',
          createdAt: '2026-11-06T08:00:00.000Z',
        },
      ];

      const csv = serializeHistoryCsv(history);
      expect(csv).toContain('task_title,original_query,task_type,status');
      expect(csv).toContain('Monitor RTX 4090 GPU Prices,geforce rtx 4090 24gb,PRICE_MONITOR,COMPLETED');
      expect(csv).toContain('Daily GPU Price Check');
      expect(csv).toContain('4');
    });
  });
});
