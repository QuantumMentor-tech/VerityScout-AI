import 'server-only';

/**
 * ==============================================================================
 * VerityScout AI — Relational Persistence Types & Schema Entities
 * ==============================================================================
 * Phase: 5 of 12 (Data Persistence & PostgreSQL Schema Architecture)
 * Step: 21 of 60
 * Status: APPROVED CANONICAL SPECIFICATION
 * Governed by: ADR-003, ADR-007, ADR-008, ADR-010, DATA_CONTRACTS.md
 * ==============================================================================
 */

export enum TaskType {
  PRODUCT_RESEARCH = 'PRODUCT_RESEARCH',
  GENERAL_RESEARCH = 'GENERAL_RESEARCH',
  PRICE_MONITOR = 'PRICE_MONITOR',
  SPEC_VERIFICATION = 'SPEC_VERIFICATION',
}

export enum RunStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
  FAILED = 'FAILED',
  CANCELLATION_REQUESTED = 'CANCELLATION_REQUESTED',
  CANCELLED = 'CANCELLED',
}

export enum RunStage {
  INITIATED = 'INITIATED',
  PLANNING = 'PLANNING',
  SEARCHING = 'SEARCHING',
  EXTRACTING = 'EXTRACTING',
  VERIFYING = 'VERIFYING',
  SYNTHESIZING = 'SYNTHESIZING',
  FINALIZING = 'FINALIZING',
}

export enum JobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SourceAccessState {
  ACCESSIBLE = 'ACCESSIBLE',
  BLOCKED_BOT_CHALLENGE = 'BLOCKED_BOT_CHALLENGE',
  HTTP_ERROR = 'HTTP_ERROR',
  TIMEOUT = 'TIMEOUT',
  DNS_RESOLUTION_FAILED = 'DNS_RESOLUTION_FAILED',
  SSRF_PROHIBITED = 'SSRF_PROHIBITED',
}

export enum ExtractionState {
  SUCCESS = 'SUCCESS',
  EMPTY_BODY = 'EMPTY_BODY',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  PARSING_FAILED = 'PARSING_FAILED',
  SKIPPED = 'SKIPPED',
}

export enum VerificationState {
  SUPPORTED = 'SUPPORTED',
  CONTRADICTED = 'CONTRADICTED',
  UNKNOWN = 'UNKNOWN',
  CONFLICTING = 'CONFLICTING',
  STALE = 'STALE',
}

export enum MatchClassification {
  EXACT_MATCH = 'EXACT_MATCH',
  NEAR_MATCH = 'NEAR_MATCH',
  PARTIALLY_VERIFIED = 'PARTIALLY_VERIFIED',
  CONFLICTING = 'CONFLICTING',
  EXCLUDED = 'EXCLUDED',
}

export enum ScheduleStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED_ERROR = 'DISABLED_ERROR',
  ARCHIVED = 'ARCHIVED',
  RETIRED = 'RETIRED',
}

export enum OccurrenceStatus {
  PLANNED = 'PLANNED',
  DISPATCHING = 'DISPATCHING',
  DISPATCHED = 'DISPATCHED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  SKIPPED = 'SKIPPED',
  RECONCILIATION_REQUIRED = 'RECONCILIATION_REQUIRED',
}

export enum ChangeType {
  PRICE_DROP = 'PRICE_DROP',
  PRICE_INCREASE = 'PRICE_INCREASE',
  STOCK_STATUS_CHANGE = 'STOCK_STATUS_CHANGE',
  SPECIFICATION_UPDATE = 'SPECIFICATION_UPDATE',
  NEW_OFFER_DISCOVERED = 'NEW_OFFER_DISCOVERED',
}

// -----------------------------------------------------------------------------
// 1. Research Tasks Row
// -----------------------------------------------------------------------------
export interface ResearchTaskRow {
  readonly id: string; // UUID
  readonly user_id: string; // UUID
  readonly title: string;
  readonly original_query: string;
  readonly task_type: TaskType;
  readonly constraints: {
    readonly maxPrice?: string | undefined;
    readonly minPrice?: string | undefined;
    readonly currency: string;
    readonly requiredCondition?: 'NEW' | 'REFURBISHED' | 'USED' | 'ANY' | undefined;
    readonly requiredBrand?: string | undefined;
    readonly excludedKeywords: readonly string[];
    readonly requiredSpecs: Readonly<Record<string, string | number>>;
  };
  readonly limits: {
    readonly maxSources: number;
    readonly maxSearchQueries: number;
    readonly maxRunCostUsd: string;
    readonly searchDepth: 'QUICK' | 'BALANCED' | 'DEEP';
  };
  readonly model_policy: {
    readonly preferredProvider: 'openai' | 'openrouter' | 'nim' | 'auto';
    readonly pinnedModelId?: string | undefined;
    readonly allowedProviders: readonly string[];
  };
  readonly is_archived: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

// -----------------------------------------------------------------------------
// 2. Research Schedules Row
// -----------------------------------------------------------------------------
export interface ResearchScheduleRow {
  readonly id: string;
  readonly task_id: string;
  readonly user_id: string;
  readonly name: string | null;
  readonly revision: number;
  readonly status: ScheduleStatus;
  readonly cron_expression: string;
  readonly recurrence_rule: Record<string, unknown> | null;
  readonly scheduled_time: string | null;
  readonly request_snapshot: Record<string, unknown> | null;
  readonly timezone: string;
  readonly last_run_at: string | null;
  readonly last_dispatched_at: string | null;
  readonly last_run_id: string | null;
  readonly next_run_at: string;
  readonly consecutive_failures: number;
  readonly change_notification_threshold_pct: number;
  readonly created_at: string;
  readonly updated_at: string;
}

// -----------------------------------------------------------------------------
// 2b. Schedule Occurrences Row
// -----------------------------------------------------------------------------
export interface ScheduleOccurrenceRow {
  readonly id: string;
  readonly schedule_id: string;
  readonly user_id: string;
  readonly schedule_revision: number;
  readonly idempotency_key: string;
  readonly scheduled_at: string;
  readonly status: OccurrenceStatus;
  readonly queue_job_id: string | null;
  readonly research_run_id: string | null;
  readonly dispatched_at: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly error_message: string | null;
  readonly recovery_metadata: Record<string, unknown> | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// -----------------------------------------------------------------------------
// 3. Research Runs Row
// -----------------------------------------------------------------------------
export interface ResearchRunRow {
  readonly id: string;
  readonly task_id: string;
  readonly user_id: string;
  readonly schedule_id: string | null;
  readonly idempotency_key: string;
  readonly status: RunStatus;
  readonly current_stage: RunStage;
  readonly stage_counters: {
    readonly queriesExecuted: number;
    readonly sourcesDiscovered: number;
    readonly sourcesExtracted: number;
    readonly claimsVerified: number;
  };
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly searchCredits: number;
    readonly estimatedCostUsd: string;
  };
  readonly selected_provider: string | null;
  readonly selected_model: string | null;
  readonly error_message: string | null;
  readonly cancellation_reason: string | null;
  readonly progress_percent?: number;
  readonly execution_duration_ms?: number | null;
  readonly synthesis?: Record<string, unknown> | null;
  readonly started_at: string;
  readonly completed_at: string | null;
}

// -----------------------------------------------------------------------------
// 4. Source Documents Row
// -----------------------------------------------------------------------------
export interface SourceDocumentRow {
  readonly id: string;
  readonly run_id: string;
  readonly user_id: string;
  readonly original_url: string;
  readonly canonical_url: string;
  readonly domain: string;
  readonly title: string;
  readonly discovery_provider: string;
  readonly access_state: SourceAccessState;
  readonly extraction_state: ExtractionState;
  readonly http_status_code: number | null;
  readonly content_hash: string | null;
  readonly extracted_text_excerpt: string;
  readonly retrieved_at: string;
  readonly published_at: string | null;
}

// -----------------------------------------------------------------------------
// 4.1 Source Discoveries Row
// -----------------------------------------------------------------------------
export interface SourceDiscoveryRow {
  readonly id: string;
  readonly source_document_id: string;
  readonly run_id: string;
  readonly user_id: string;
  readonly query_variant_id: string | null;
  readonly query_text: string;
  readonly discovery_provider: string;
  readonly provider_result_id: string | null;
  readonly original_url: string;
  readonly title: string;
  readonly snippet: string | null;
  readonly relevance_score: number | null;
  readonly discovered_at: string;
}

// -----------------------------------------------------------------------------
// 5. Candidate Results Row
// -----------------------------------------------------------------------------
export interface CandidateResultRow {
  readonly id: string;
  readonly run_id: string;
  readonly user_id: string;
  readonly title: string;
  readonly product_identifier: string | null;
  readonly seller_or_domain: string;
  readonly canonical_url: string;
  readonly price_usd: string | null; // NUMERIC(12, 4) serialized as exact decimal string
  readonly currency: string;
  readonly availability: 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  readonly condition: 'NEW' | 'REFURBISHED' | 'USED' | 'UNKNOWN';
  readonly specifications: Readonly<Record<string, string | number>>;
  readonly classification: MatchClassification;
  readonly constraint_evaluation: {
    readonly passedConstraints: readonly string[];
    readonly failedConstraints: readonly string[];
    readonly mismatchReason?: string | undefined;
  };
  readonly created_at: string;
}

// -----------------------------------------------------------------------------
// 6. Evidence Records Row
// -----------------------------------------------------------------------------
export interface EvidenceRecordRow {
  readonly id: string;
  readonly run_id: string;
  readonly source_id: string;
  readonly user_id: string;
  readonly candidate_id: string | null;
  readonly claim_key: string;
  readonly extracted_raw_value: string;
  readonly normalized_value: string;
  readonly unit_or_currency: string | null;
  readonly verbatim_quote: string;
  readonly verification_state: VerificationState;
  readonly conflict_details: string | null;
  readonly extraction_method: 'LLM_STRUCTURED' | 'REGEX_DETERMINISTIC' | 'META_TAG' | 'DOM_SELECTOR';
  readonly location_in_document: string | null;
  readonly confidence_score: string | null; // NUMERIC(5, 4)
  readonly extracted_at: string;
}

// -----------------------------------------------------------------------------
// 7. Candidate Evidence Links Row (Junction Table)
// -----------------------------------------------------------------------------
export interface CandidateEvidenceLinkRow {
  readonly candidate_id: string;
  readonly evidence_id: string;
  readonly created_at: string;
}

// -----------------------------------------------------------------------------
// 8. Provider Configurations Row
// -----------------------------------------------------------------------------
export interface ProviderConfigurationRow {
  readonly id: string;
  readonly user_id: string;
  readonly provider_id: 'openai' | 'openrouter' | 'nim' | 'tavily' | 'exa' | 'firecrawl';
  readonly is_enabled: boolean;
  readonly selected_model_id: string | null;
  readonly custom_base_url: string | null;
  readonly has_credential: boolean;
  readonly credential_preview: string | null;
  readonly last_connection_test_at: string | null;
  readonly last_connection_test_status: 'SUCCESS' | 'FAILED' | 'UNTESTED' | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// -----------------------------------------------------------------------------
// 9. Provider Vault Secrets Row
// -----------------------------------------------------------------------------
export interface ProviderVaultSecretRow {
  readonly id: string;
  readonly user_id: string;
  readonly provider_id: string;
  readonly encrypted_blob: Buffer;
  readonly initialization_vector: Buffer;
  readonly auth_tag: Buffer;
  readonly key_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

// -----------------------------------------------------------------------------
// 10. Change Events Row
// -----------------------------------------------------------------------------
export interface ChangeEventRow {
  readonly id: string;
  readonly task_id: string;
  readonly schedule_id: string | null;
  readonly user_id: string;
  readonly previous_run_id: string;
  readonly current_run_id: string;
  readonly change_type: ChangeType;
  readonly field_name: string;
  readonly previous_value: string;
  readonly new_value: string;
  readonly percentage_delta: string | null; // NUMERIC(8, 4)
  readonly candidate_title: string;
  readonly canonical_url: string;
  readonly evidence_id: string | null;
  readonly detected_at: string;
}

// -----------------------------------------------------------------------------
// 11. Usage Ledger Row
// -----------------------------------------------------------------------------
export interface UsageLedgerRow {
  readonly id: string;
  readonly user_id: string;
  readonly task_id: string | null;
  readonly run_id: string | null;
  readonly provider_id: 'openai' | 'openrouter' | 'nim' | 'tavily' | 'exa' | 'firecrawl';
  readonly model_id: string | null;
  readonly operation_category: 'SEARCH' | 'EXTRACTION' | 'SYNTHESIS';
  readonly units_consumed: number;
  readonly unit_type: 'TOKENS' | 'QUERIES' | 'PAGES';
  readonly estimated_cost_usd: string; // NUMERIC(12, 6)
  readonly currency: string;
  readonly recorded_at: string;
}

// -----------------------------------------------------------------------------
// 12. Local Authentication Users Row (Step 23)
// -----------------------------------------------------------------------------
export interface AuthUserRow {
  readonly id: string; // UUID
  readonly email: string;
  readonly password_hash: string;
  readonly display_name: string | null;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

// -----------------------------------------------------------------------------
// 13. Local Authentication Sessions Row (Step 23)
// -----------------------------------------------------------------------------
export interface AuthSessionRow {
  readonly id: string; // UUID
  readonly user_id: string; // UUID
  readonly session_token_hash: string;
  readonly expires_at: string;
  readonly created_at: string;
  readonly last_accessed_at: string;
  readonly user_agent: string | null;
  readonly ip_address: string | null;
}

// -----------------------------------------------------------------------------
// 14. Research Job Queue Row (Step 43)
// -----------------------------------------------------------------------------
export interface ResearchJobQueueRow {
  readonly id: string; // UUID
  readonly run_id: string; // UUID
  readonly task_id: string; // UUID
  readonly user_id: string; // UUID
  readonly status: JobStatus;
  readonly priority: number;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly claimed_by: string | null;
  readonly claimed_at: string | null;
  readonly lease_expires_at?: string | null;
  readonly scheduled_at?: string;
  readonly last_error?: string | null;
  readonly failure_category?: string | null;
  readonly payload: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

// -----------------------------------------------------------------------------
// 15. Research Progress Events Row (Step 44)
// -----------------------------------------------------------------------------
export type ProgressEventType =
  | 'STAGE_STARTED'
  | 'PROGRESS_UPDATE'
  | 'STAGE_COMPLETED'
  | 'RETRY_SCHEDULED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'
  | 'RECOVERED'
  | 'FAILED';

export interface ResearchProgressEventRow {
  readonly id: string; // UUID
  readonly run_id: string; // UUID
  readonly user_id: string; // UUID
  readonly stage: RunStage;
  readonly event_type: ProgressEventType;
  readonly sequence_number: number;
  readonly message: string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
}

// -----------------------------------------------------------------------------
// 16. Model Usage Events Row (Step 45)
// -----------------------------------------------------------------------------
export const UsageSource = {
  PROVIDER_REPORTED: 'PROVIDER_REPORTED',
  LOCALLY_ESTIMATED: 'LOCALLY_ESTIMATED',
  PARTIAL: 'PARTIAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type UsageSource = (typeof UsageSource)[keyof typeof UsageSource];

export const CostStatus = {
  CALCULATED_ESTIMATE: 'CALCULATED_ESTIMATE',
  PROVIDER_REPORTED_COST: 'PROVIDER_REPORTED_COST',
  UNKNOWN_COST: 'UNKNOWN_COST',
} as const;
export type CostStatus = (typeof CostStatus)[keyof typeof CostStatus];

export interface ModelUsageEventRow {
  readonly id: string; // UUID
  readonly user_id: string; // UUID
  readonly run_id: string | null; // UUID
  readonly task_id: string | null; // UUID
  readonly attempt: number;
  readonly provider_id: string;
  readonly model_id: string;
  readonly operation_type: string;
  readonly request_id: string | null;
  readonly idempotency_key: string;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly total_tokens: number | null;
  readonly cached_tokens: number | null;
  readonly reasoning_tokens: number | null;
  readonly usage_source: UsageSource;
  readonly estimated_cost_usd: string | null;
  readonly provider_cost_usd: string | null;
  readonly currency: string;
  readonly cost_status: CostStatus;
  readonly pricing_version: string | null;
  readonly cost_explanation: string | null;
  readonly latency_ms: number | null;
  readonly metadata: Record<string, unknown>;
  readonly recorded_at: string;
}

// -----------------------------------------------------------------------------
// 17. Concurrency Slots Row (Step 45)
// -----------------------------------------------------------------------------
export interface ConcurrencySlotRow {
  readonly id: string; // UUID
  readonly scope_key: string;
  readonly holder_id: string;
  readonly slot_number: number;
  readonly max_slots: number;
  readonly lease_expires_at: string;
  readonly created_at: string;
}



