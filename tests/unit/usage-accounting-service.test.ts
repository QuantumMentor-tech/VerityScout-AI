import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageAccountingService } from '@/server/usage/usage-accounting.service';
import { ModelPricingService } from '@/server/usage/pricing.service';
import { ModelUsageRepository } from '@/server/persistence/repositories/model-usage.repository';
import { ResearchRunRepository } from '@/server/persistence/repositories/research-run.repository';
import { UsageSource, CostStatus } from '@/server/persistence/types';

describe('Usage Accounting Service', () => {
  let mockUsageRepo: ModelUsageRepository;
  let mockRunRepo: ResearchRunRepository;
  let pricingService: ModelPricingService;
  let service: UsageAccountingService;

  const mockRunId = '11111111-1111-4111-a111-111111111111';
  const mockTaskId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    pricingService = new ModelPricingService();
    mockUsageRepo = {
      create: vi.fn(),
      getRunUsageSummary: vi.fn(),
      listByRunId: vi.fn(),
      findByIdempotencyKey: vi.fn(),
    } as unknown as ModelUsageRepository;

    mockRunRepo = {
      findById: vi.fn().mockResolvedValue({
        id: mockRunId,
        user_id: mockUserId,
        status: 'RUNNING',
        current_stage: 'SYNTHESIZING',
      }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as ResearchRunRepository;

    service = new UsageAccountingService({
      usageRepo: mockUsageRepo,
      runRepo: mockRunRepo,
      pricingService,
    });
  });

  it('ACCT-001: Records inference usage event and updates run aggregate', async () => {
    const mockCreatedEvent = {
      id: 'event-1',
      run_id: mockRunId,
      task_id: mockTaskId,
      user_id: mockUserId,
      operation_type: 'claim_extraction' as const,
      provider_id: 'openai',
      model_id: 'gpt-4o',
      attempt: 1,
      input_tokens: 1000,
      output_tokens: 200,
      total_tokens: 1200,
      cached_tokens: null,
      reasoning_tokens: null,
      estimated_cost_usd: '0.004500',
      provider_cost_usd: null,
      currency: 'USD',
      cost_status: CostStatus.CALCULATED_ESTIMATE,
      usage_source: UsageSource.PROVIDER_REPORTED,
      pricing_version: '2026-11-catalog-v1',
      idempotency_key: 'test-key',
      recorded_at: new Date().toISOString(),
    };

    (mockUsageRepo.create as any).mockResolvedValueOnce(mockCreatedEvent);
    (mockUsageRepo.getRunUsageSummary as any).mockResolvedValueOnce({
      runId: mockRunId,
      totalInputTokens: 1000,
      totalOutputTokens: 200,
      totalTokens: 1200,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalRequests: 1,
      knownUsageRequests: 1,
      unknownUsageRequests: 0,
      totalEstimatedCostUsd: '0.004500',
      totalProviderCostUsd: null,
      currency: 'USD',
      unknownCostRequests: 0,
      attemptsCount: 1,
      byOperation: {},
      byModel: {},
    });

    const event = await service.recordInferenceUsage({
      runId: mockRunId,
      taskId: mockTaskId,
      userId: mockUserId,
      operationType: 'claim_extraction',
      providerId: 'openai',
      modelId: 'gpt-4o',
      attempt: 1,
      inputTokens: 1000,
      outputTokens: 200,
    });

    expect(event).toBeDefined();
    expect(mockUsageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        run_id: mockRunId,
        operation_type: 'claim_extraction',
        provider_id: 'openai',
        model_id: 'gpt-4o',
        input_tokens: 1000,
        output_tokens: 200,
        cost_status: CostStatus.CALCULATED_ESTIMATE,
      })
    );

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      mockRunId,
      'RUNNING',
      'SYNTHESIZING',
      { total_cost_usd: '0.004500' },
      mockUserId
    );
  });

  it('ACCT-002: Generates distinct idempotency keys across retry attempts', async () => {
    (mockUsageRepo.create as any).mockImplementation((params: any) =>
      Promise.resolve({ id: 'evt-1', ...params })
    );
    (mockUsageRepo.getRunUsageSummary as any).mockResolvedValue({
      runId: mockRunId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalRequests: 0,
      knownUsageRequests: 0,
      unknownUsageRequests: 0,
      totalEstimatedCostUsd: '0',
      totalProviderCostUsd: null,
      currency: 'USD',
      unknownCostRequests: 0,
      attemptsCount: 1,
      byOperation: {},
      byModel: {},
    });

    await service.recordInferenceUsage({
      runId: mockRunId,
      taskId: mockTaskId,
      userId: mockUserId,
      operationType: 'research_synthesis',
      providerId: 'openai',
      modelId: 'gpt-4o',
      attempt: 1,
      inputTokens: 500,
      outputTokens: 100,
    });

    await service.recordInferenceUsage({
      runId: mockRunId,
      taskId: mockTaskId,
      userId: mockUserId,
      operationType: 'research_synthesis',
      providerId: 'openai',
      modelId: 'gpt-4o',
      attempt: 2,
      inputTokens: 500,
      outputTokens: 100,
    });

    const call1Key = (mockUsageRepo.create as any).mock.calls[0][0].idempotency_key;
    const call2Key = (mockUsageRepo.create as any).mock.calls[1][0].idempotency_key;

    expect(call1Key).not.toBe(call2Key);
    expect(call1Key).toContain('-1-');
    expect(call2Key).toContain('-2-');
  });

  it('ACCT-003: Gracefully handles unpriced models without throwing', async () => {
    (mockUsageRepo.create as any).mockResolvedValueOnce({
      id: 'event-unpriced',
      estimated_cost_usd: null,
      cost_status: CostStatus.UNKNOWN_COST,
    });
    (mockUsageRepo.getRunUsageSummary as any).mockResolvedValueOnce({
      runId: mockRunId,
      totalInputTokens: 500,
      totalOutputTokens: 100,
      totalTokens: 600,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalRequests: 1,
      knownUsageRequests: 1,
      unknownUsageRequests: 0,
      totalEstimatedCostUsd: null,
      totalProviderCostUsd: null,
      currency: 'USD',
      unknownCostRequests: 1,
      attemptsCount: 1,
      byOperation: {},
      byModel: {},
    });

    const event = await service.recordInferenceUsage({
      runId: mockRunId,
      taskId: mockTaskId,
      userId: mockUserId,
      operationType: 'claim_extraction',
      providerId: 'openrouter',
      modelId: 'unlisted/experimental-model',
      inputTokens: 500,
      outputTokens: 100,
    });

    expect(event).toBeDefined();
    expect(mockUsageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cost_status: CostStatus.UNKNOWN_COST,
        estimated_cost_usd: null,
      })
    );
  });
});
