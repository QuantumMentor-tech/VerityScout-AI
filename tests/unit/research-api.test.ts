import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createRunRoute, GET as listRunsRoute } from '@/app/api/research/runs/route';
import { GET as getRunRoute } from '@/app/api/research/runs/[runId]/route';
import { GET as getRunResultsRoute } from '@/app/api/research/runs/[runId]/results/route';
import * as authModule from '@/server/auth/authorization';
import * as txModule from '@/server/persistence/transaction';
import {
  ResearchTaskRepository,
  ResearchRunRepository,
  CandidateResultRepository,
  EvidenceRecordRepository,
  SourceDocumentRepository,
} from '@/server/persistence/repositories';
import { setResearchJobQueue } from '@/server/queue';
import { InMemoryJobQueueAdapter } from '@/server/queue/in-memory-job-queue';
import { RunStatus, RunStage, TaskType } from '@/server/persistence/types';

describe('Research API Endpoints', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockRunId = '22222222-2222-4222-a222-222222222222';
  const mockTaskId = '33333333-3333-4333-a333-333333333333';

  let queue: InMemoryJobQueueAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    queue = new InMemoryJobQueueAdapter();
    setResearchJobQueue(queue);

    vi.spyOn(authModule, 'requireAuthenticatedCaller').mockResolvedValue({
      user: {
        id: mockUserId,
        email: 'researcher@verityscout.com',
        displayName: 'Researcher',
        createdAt: '2026-11-01T00:00:00Z',
      },
      userId: mockUserId,
    });

    vi.spyOn(txModule, 'withTransaction').mockImplementation(async (cb: any) => cb({}));
  });

  describe('POST /api/research/runs', () => {
    it('API-RUN-001: Returns 401 when caller is unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest('http://localhost:3000/api/research/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Find thinkpad' }),
      });

      const res = await createRunRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });

    it('API-RUN-002: Rejects invalid request payloads with 400', async () => {
      // Query too short (< 3 chars)
      const shortReq = new NextRequest('http://localhost:3000/api/research/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'ab' }),
      });

      const shortRes = await createRunRoute(shortReq);
      expect(shortRes.status).toBe(400);

      // Invalid JSON
      const badReq = new NextRequest('http://localhost:3000/api/research/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });

      const badRes = await createRunRoute(badReq);
      expect(badRes.status).toBe(400);
    });

    it('API-RUN-003: Durably accepts valid request and enqueues job with HTTP 202 Accepted', async () => {
      vi.spyOn(ResearchTaskRepository.prototype, 'create').mockResolvedValue({
        id: mockTaskId,
        user_id: mockUserId,
        title: 'Find refurbished ThinkPad',
        original_query: 'Find refurbished ThinkPad T14 AMD with 32GB RAM under $700',
        task_type: TaskType.PRODUCT_RESEARCH,
        constraints: {
          currency: 'USD',
          excludedKeywords: [],
          requiredSpecs: {},
        },
        limits: {
          maxSources: 10,
          maxSearchQueries: 5,
          maxRunCostUsd: '1.0000',
          searchDepth: 'BALANCED',
        },
        model_policy: {
          preferredProvider: 'auto',
          allowedProviders: ['openai', 'openrouter', 'nim'],
        },
        is_archived: false,
        created_at: '2026-11-04T12:00:00Z',
        updated_at: '2026-11-04T12:00:00Z',
      });

      vi.spyOn(ResearchRunRepository.prototype, 'create').mockResolvedValue({
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        schedule_id: null,
        idempotency_key: 'idemp-1',
        status: RunStatus.QUEUED,
        current_stage: RunStage.INITIATED,
        stage_counters: { queriesExecuted: 0, sourcesDiscovered: 0, sourcesExtracted: 0, claimsVerified: 0 },
        usage: { promptTokens: 0, completionTokens: 0, searchCredits: 0, estimatedCostUsd: '0.0000' },
        selected_provider: null,
        selected_model: null,
        error_message: null,
        cancellation_reason: null,
        started_at: '2026-11-04T12:00:00Z',
        completed_at: null,
      });

      const req = new NextRequest('http://localhost:3000/api/research/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Find refurbished ThinkPad T14 AMD with 32GB RAM under $700',
          taskType: 'PRODUCT_RESEARCH',
        }),
      });

      const res = await createRunRoute(req);
      expect(res.status).toBe(202);

      const data = await res.json();
      expect(data.runId).toBe(mockRunId);
      expect(data.taskId).toBe(mockTaskId);
      expect(data.status).toBe(RunStatus.QUEUED);
      expect(data.message).toContain('durably queued');

      const metrics = await queue.getMetrics();
      expect(metrics.queued).toBe(1);
    });
  });

  describe('GET /api/research/runs', () => {
    it('API-RUN-004: Returns paginated research runs for authenticated user', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'listByOwner').mockResolvedValue({
        data: [
          {
            id: mockRunId,
            task_id: mockTaskId,
            user_id: mockUserId,
            schedule_id: null,
            idempotency_key: 'idemp-1',
            status: RunStatus.COMPLETED,
            current_stage: RunStage.FINALIZING,
            stage_counters: { queriesExecuted: 2, sourcesDiscovered: 5, sourcesExtracted: 3, claimsVerified: 4 },
            usage: { promptTokens: 0, completionTokens: 0, searchCredits: 0, estimatedCostUsd: '0.0000' },
            selected_provider: null,
            selected_model: null,
            error_message: null,
            cancellation_reason: null,
            started_at: '2026-11-04T12:00:00Z',
            completed_at: '2026-11-04T12:01:00Z',
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });

      const req = new NextRequest('http://localhost:3000/api/research/runs?page=1&limit=10');
      const res = await listRunsRoute(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.length).toBe(1);
      expect(data.data[0].id).toBe(mockRunId);
    });
  });

  describe('GET /api/research/runs/[runId]', () => {
    it('API-RUN-005: Returns 404 when run does not exist or owner mismatch', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/research/runs/non-existent');
      const res = await getRunRoute(req, {
        params: Promise.resolve({ runId: 'non-existent' }),
      });

      expect(res.status).toBe(404);
    });

    it('API-RUN-006: Returns run status and stage counters for valid owner', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValue({
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        schedule_id: null,
        idempotency_key: 'idemp-1',
        status: RunStatus.RUNNING,
        current_stage: RunStage.SEARCHING,
        stage_counters: { queriesExecuted: 2, sourcesDiscovered: 8, sourcesExtracted: 0, claimsVerified: 0 },
        usage: { promptTokens: 0, completionTokens: 0, searchCredits: 0, estimatedCostUsd: '0.0000' },
        selected_provider: null,
        selected_model: null,
        error_message: null,
        cancellation_reason: null,
        started_at: '2026-11-04T12:00:00Z',
        completed_at: null,
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}`);
      const res = await getRunRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(mockRunId);
      expect(data.status).toBe(RunStatus.RUNNING);
      expect(data.currentStage).toBe(RunStage.SEARCHING);
      expect(data.stageCounters.sourcesDiscovered).toBe(8);
    });
  });

  describe('GET /api/research/runs/[runId]/results', () => {
    it('API-RUN-007: Returns completed: false while run is in progress', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValue({
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        schedule_id: null,
        idempotency_key: 'idemp-1',
        status: RunStatus.RUNNING,
        current_stage: RunStage.EXTRACTING,
        stage_counters: { queriesExecuted: 3, sourcesDiscovered: 10, sourcesExtracted: 2, claimsVerified: 0 },
        usage: { promptTokens: 0, completionTokens: 0, searchCredits: 0, estimatedCostUsd: '0.0000' },
        selected_provider: null,
        selected_model: null,
        error_message: null,
        cancellation_reason: null,
        started_at: '2026-11-04T12:00:00Z',
        completed_at: null,
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/results`);
      const res = await getRunResultsRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.completed).toBe(false);
      expect(data.status).toBe(RunStatus.RUNNING);
    });

    it('API-RUN-008: Returns completed: false with error when run failed', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValue({
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        schedule_id: null,
        idempotency_key: 'idemp-1',
        status: RunStatus.FAILED,
        current_stage: RunStage.FINALIZING,
        stage_counters: { queriesExecuted: 1, sourcesDiscovered: 0, sourcesExtracted: 0, claimsVerified: 0 },
        usage: { promptTokens: 0, completionTokens: 0, searchCredits: 0, estimatedCostUsd: '0.0000' },
        selected_provider: null,
        selected_model: null,
        error_message: 'All search queries timed out',
        cancellation_reason: null,
        started_at: '2026-11-04T12:00:00Z',
        completed_at: '2026-11-04T12:01:00Z',
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/results`);
      const res = await getRunResultsRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.completed).toBe(false);
      expect(data.status).toBe(RunStatus.FAILED);
      expect(data.error).toBe('All search queries timed out');
    });

    it('API-RUN-009: Returns completed: true with candidates, evidence, sources, and synthesis when completed', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValue({
        id: mockRunId,
        task_id: mockTaskId,
        user_id: mockUserId,
        schedule_id: null,
        idempotency_key: 'idemp-1',
        status: RunStatus.COMPLETED,
        current_stage: RunStage.FINALIZING,
        stage_counters: { queriesExecuted: 3, sourcesDiscovered: 10, sourcesExtracted: 5, claimsVerified: 12 },
        usage: { promptTokens: 0, completionTokens: 0, searchCredits: 0, estimatedCostUsd: '0.0000' },
        selected_provider: null,
        selected_model: null,
        error_message: null,
        cancellation_reason: null,
        started_at: '2026-11-04T12:00:00Z',
        completed_at: '2026-11-04T12:01:30Z',
        synthesis: { directAnswer: 'Found 3 verified matching ThinkPad configurations.' },
      });

      vi.spyOn(CandidateResultRepository.prototype, 'listByRunId').mockResolvedValue({
        data: [
          {
            id: 'cand-1',
            run_id: mockRunId,
            user_id: mockUserId,
            title: 'Lenovo ThinkPad T14 Gen 3',
            product_identifier: '21CF003VUS',
            seller_or_domain: 'lenovo.com',
            canonical_url: 'https://lenovo.com/thinkpad-t14',
            price_usd: '649.99',
            currency: 'USD',
            availability: 'IN_STOCK',
            condition: 'REFURBISHED',
            specifications: {},
            classification: 'EXACT_MATCH' as any,
            constraint_evaluation: { passedConstraints: [], failedConstraints: [] },
            created_at: '2026-11-04T12:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      vi.spyOn(EvidenceRecordRepository.prototype, 'listByRunId').mockResolvedValue({
        data: [
          {
            id: 'ev-1',
            source_id: 'src-1',
            run_id: mockRunId,
            user_id: mockUserId,
            candidate_id: 'cand-1',
            claim_key: 'RAM',
            extracted_raw_value: '32 GB',
            normalized_value: '32 GB',
            unit_or_currency: 'GB',
            verbatim_quote: 'Installed Memory: 32 GB DDR5',
            verification_state: 'SUPPORTED' as any,
            conflict_details: null,
            extraction_method: 'REGEX_DETERMINISTIC',
            location_in_document: null,
            confidence_score: '1.0000',
            extracted_at: '2026-11-04T12:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

      vi.spyOn(SourceDocumentRepository.prototype, 'listByRunId').mockResolvedValue({
        data: [
          {
            id: 'src-1',
            run_id: mockRunId,
            user_id: mockUserId,
            original_url: 'https://lenovo.com/thinkpad-t14',
            canonical_url: 'https://lenovo.com/thinkpad-t14',
            domain: 'lenovo.com',
            title: 'ThinkPad T14 Gen 3 Specs',
            discovery_provider: 'tavily',
            access_state: 'ACCESSIBLE' as any,
            extraction_state: 'SUCCESS' as any,
            http_status_code: 200,
            content_hash: 'hash1',
            extracted_text_excerpt: 'Memory: 32GB',
            retrieved_at: '2026-11-04T12:00:00Z',
            published_at: null,
          },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/results`);
      const res = await getRunResultsRoute(req, {
        params: Promise.resolve({ runId: mockRunId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.completed).toBe(true);
      expect(data.status).toBe(RunStatus.COMPLETED);
      expect(data.candidates.length).toBe(1);
      expect(data.evidence.length).toBe(1);
      expect(data.sources.length).toBe(1);
      expect(data.synthesis.directAnswer).toContain('Found 3 verified');
    });
  });
});
