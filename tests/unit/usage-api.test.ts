import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRunUsageRoute } from '@/app/api/research/runs/[runId]/usage/route';
import { GET as getSettingsUsageRoute } from '@/app/api/settings/usage/route';
import * as authModule from '@/server/auth/authorization';
import {
  ResearchRunRepository,
  ModelUsageRepository,
} from '@/server/persistence/repositories';
import * as baseRepoModule from '@/server/persistence/repositories/base.repository';

describe('Usage API Endpoints', () => {
  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockRunId = '22222222-2222-4222-a222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(authModule, 'requireAuthenticatedCaller').mockResolvedValue({
      user: {
        id: mockUserId,
        email: 'researcher@verityscout.com',
        displayName: 'Researcher',
        createdAt: '2026-11-01T00:00:00Z',
      },
      userId: mockUserId,
    });
  });

  describe('GET /api/research/runs/[runId]/usage', () => {
    it('API-USE-001: Returns 401 when unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/usage`);
      const res = await getRunUsageRoute(req, { params: Promise.resolve({ runId: mockRunId }) });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });

    it('API-USE-002: Returns 404 when run does not exist or belongs to another user', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValueOnce(null);

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/usage`);
      const res = await getRunUsageRoute(req, { params: Promise.resolve({ runId: mockRunId }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Research run not found');
    });

    it('API-USE-003: Returns 200 with usage summary breakdown for valid run', async () => {
      vi.spyOn(ResearchRunRepository.prototype, 'findById').mockResolvedValueOnce({
        id: mockRunId,
        user_id: mockUserId,
      } as any);

      vi.spyOn(ModelUsageRepository.prototype, 'getRunUsageSummary').mockResolvedValueOnce({
        runId: mockRunId,
        totalInputTokens: 2500,
        totalOutputTokens: 600,
        totalTokens: 3100,
        cachedTokens: 500,
        reasoningTokens: 0,
        totalRequests: 2,
        knownUsageRequests: 2,
        unknownUsageRequests: 0,
        totalEstimatedCostUsd: '0.012250',
        totalProviderCostUsd: null,
        currency: 'USD',
        unknownCostRequests: 0,
        attemptsCount: 1,
        byOperation: {
          claim_extraction: {
            requests: 1,
            inputTokens: 1000,
            outputTokens: 200,
            totalTokens: 1200,
            estimatedCostUsd: '0.004500',
          },
        },
        byModel: {},
      });

      vi.spyOn(ModelUsageRepository.prototype, 'listByRunId').mockResolvedValueOnce([
        {
          id: 'event-1',
          operation_type: 'claim_extraction',
          provider_id: 'openai',
          model_id: 'gpt-4o',
          input_tokens: 1000,
          output_tokens: 200,
          total_tokens: 1200,
          cached_tokens: null,
          reasoning_tokens: null,
          usage_source: 'PROVIDER_REPORTED',
          estimated_cost_usd: '0.004500',
          cost_status: 'CALCULATED_ESTIMATE',
          pricing_version: '2026-11-catalog-v1',
          cost_explanation: 'Standard rate',
          attempt: 1,
          recorded_at: '2026-11-05T10:00:00Z',
        } as any,
      ]);

      const req = new NextRequest(`http://localhost:3000/api/research/runs/${mockRunId}/usage`);
      const res = await getRunUsageRoute(req, { params: Promise.resolve({ runId: mockRunId }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.runId).toBe(mockRunId);
      expect(data.summary.totalTokens).toBe(3100);
      expect(data.summary.totalEstimatedCostUsd).toBe('0.012250');
      expect(data.events).toHaveLength(1);
      expect(data.events[0].id).toBe('event-1');
    });
  });

  describe('GET /api/settings/usage', () => {
    it('API-USE-004: Returns 401 when unauthenticated', async () => {
      vi.spyOn(authModule, 'requireAuthenticatedCaller').mockRejectedValueOnce(
        new Error('Unauthenticated')
      );

      const res = await getSettingsUsageRoute();

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });

    it('API-USE-005: Returns 200 with aggregated user usage breakdown', async () => {
      vi.spyOn(baseRepoModule, 'executeQuery').mockResolvedValueOnce({
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            provider_id: 'openai',
            operation_type: 'claim_extraction',
            requests_count: 5,
            total_input_tokens: '5000',
            total_output_tokens: '1000',
            total_tokens: '6000',
            total_estimated_cost_usd: '0.022500',
            currency: 'USD',
          },
        ],
      } as any);

      const res = await getSettingsUsageRoute();

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userId).toBe(mockUserId);
      expect(data.totalTokens).toBe(6000);
      expect(data.totalEstimatedCostUsd).toBe('0.022500');
      expect(data.breakdown).toHaveLength(1);
      expect(data.breakdown[0].providerId).toBe('openai');
    });
  });
});

