import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  ModelUsageRepository,
  RunUsageSummary,
  CreateModelUsageEventInput,
} from '@/server/persistence/repositories/model-usage.repository';
import { ResearchRunRepository } from '@/server/persistence/repositories/research-run.repository';
import { ModelPricingService, getDefaultPricingService } from './pricing.service';
import type { ModelUsageEventRow, UsageSource } from '@/server/persistence/types';
import { logger } from '@/lib/logging/logger';

export interface RecordInferenceUsageInput {
  readonly userId: string;
  readonly runId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly attempt?: number | undefined;
  readonly providerId: string;
  readonly modelId: string;
  readonly operationType: string;
  readonly requestId?: string | null | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly inputTokens?: number | null | undefined;
  readonly outputTokens?: number | null | undefined;
  readonly totalTokens?: number | null | undefined;
  readonly cachedTokens?: number | null | undefined;
  readonly reasoningTokens?: number | null | undefined;
  readonly usageSource?: UsageSource | undefined;
  readonly providerReportedCost?: number | string | null | undefined;
  readonly latencyMs?: number | null | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface UsageAccountingOptions {
  readonly usageRepo?: ModelUsageRepository | undefined;
  readonly pricingService?: ModelPricingService | undefined;
  readonly runRepo?: ResearchRunRepository | undefined;
}

export class UsageAccountingService {
  private readonly usageRepo: ModelUsageRepository;
  private readonly pricingService: ModelPricingService;
  private readonly runRepo: ResearchRunRepository;

  constructor(options?: UsageAccountingOptions) {
    this.usageRepo = options?.usageRepo ?? new ModelUsageRepository();
    this.pricingService = options?.pricingService ?? getDefaultPricingService();
    this.runRepo = options?.runRepo ?? new ResearchRunRepository();
  }

  /**
   * Records a validated AI usage event, calculates decimal-safe cost,
   * enforces idempotency, and updates research run usage counters.
   */
  async recordInferenceUsage(input: RecordInferenceUsageInput): Promise<ModelUsageEventRow> {
    const {
      userId,
      runId,
      taskId,
      attempt = 1,
      providerId,
      modelId,
      operationType,
      requestId,
      idempotencyKey,
      inputTokens,
      outputTokens,
      totalTokens,
      cachedTokens,
      reasoningTokens,
      usageSource = 'PROVIDER_REPORTED',
      providerReportedCost,
      latencyMs,
      metadata = {},
    } = input;

    // Validate token numbers
    if (inputTokens !== undefined && inputTokens !== null && (inputTokens < 0 || !Number.isInteger(inputTokens))) {
      throw new Error(`Invalid input tokens: ${inputTokens}`);
    }
    if (outputTokens !== undefined && outputTokens !== null && (outputTokens < 0 || !Number.isInteger(outputTokens))) {
      throw new Error(`Invalid output tokens: ${outputTokens}`);
    }
    if (totalTokens !== undefined && totalTokens !== null && (totalTokens < 0 || !Number.isInteger(totalTokens))) {
      throw new Error(`Invalid total tokens: ${totalTokens}`);
    }

    // Determine total tokens if not explicitly provided
    const resolvedTotalTokens =
      totalTokens !== undefined && totalTokens !== null
        ? totalTokens
        : inputTokens !== undefined && inputTokens !== null && outputTokens !== undefined && outputTokens !== null
        ? inputTokens + outputTokens
        : null;

    // Calculate cost
    const costCalc = this.pricingService.calculateCost({
      providerId,
      modelId,
      inputTokens,
      outputTokens,
      providerReportedCost,
    });

    // Form unique idempotency key
    const resolvedIdempotencyKey =
      idempotencyKey ||
      (requestId
        ? `req-${providerId}-${requestId}-${attempt}`
        : runId
        ? `run-${runId}-${operationType}-${attempt}-${randomUUID().slice(0, 8)}`
        : `usage-${providerId}-${modelId}-${Date.now()}-${randomUUID().slice(0, 8)}`);

    const repoInput: CreateModelUsageEventInput = {
      user_id: userId,
      run_id: runId ?? null,
      task_id: taskId ?? null,
      attempt,
      provider_id: providerId,
      model_id: modelId,
      operation_type: operationType,
      request_id: requestId ?? null,
      idempotency_key: resolvedIdempotencyKey,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      total_tokens: resolvedTotalTokens,
      cached_tokens: cachedTokens ?? null,
      reasoning_tokens: reasoningTokens ?? null,
      usage_source: usageSource,
      estimated_cost_usd: costCalc.estimatedCostUsd,
      provider_cost_usd: costCalc.providerCostUsd,
      currency: costCalc.currency,
      cost_status: costCalc.costStatus,
      pricing_version: costCalc.pricingVersion,
      cost_explanation: costCalc.costExplanation,
      latency_ms: latencyMs ?? null,
      metadata,
    };

    const event = await this.usageRepo.create(repoInput);

    logger.info('AI_USAGE_RECORDED', 'AI usage event recorded in durable ledger', {
      eventId: event.id,
      runId,
      providerId,
      modelId,
      operationType,
      inputTokens,
      outputTokens,
      totalTokens: resolvedTotalTokens,
      costStatus: costCalc.costStatus,
      estimatedCostUsd: costCalc.estimatedCostUsd,
    });

    // If attributed to a research run, update run total_cost_usd snapshot
    if (runId) {
      try {
        const summary = await this.usageRepo.getRunUsageSummary(runId, userId);
        const currentRun = await this.runRepo.findById(runId);
        if (currentRun && summary.totalEstimatedCostUsd !== null) {
          await this.runRepo.updateStatus(
            runId,
            currentRun.status,
            currentRun.current_stage,
            { total_cost_usd: summary.totalEstimatedCostUsd },
            userId
          );
        }
      } catch (runErr) {
        logger.warn('AI_USAGE_RUN_UPDATE_FAILED', 'Failed to update research run usage summary', {
          runId,
          error: runErr instanceof Error ? runErr.message : String(runErr),
        });
      }
    }

    return event;
  }

  /**
   * Retrieves full aggregated usage breakdown for a research run.
   */
  async getRunUsageSummary(runId: string, userId?: string): Promise<RunUsageSummary> {
    return this.usageRepo.getRunUsageSummary(runId, userId);
  }

  /**
   * Lists chronological usage events for a research run.
   */
  async listEventsByRun(runId: string, userId?: string): Promise<ModelUsageEventRow[]> {
    return this.usageRepo.listByRunId(runId, userId);
  }
}

let defaultUsageAccountingService: UsageAccountingService | null = null;

export function getDefaultUsageAccountingService(): UsageAccountingService {
  if (!defaultUsageAccountingService) {
    defaultUsageAccountingService = new UsageAccountingService();
  }
  return defaultUsageAccountingService;
}
