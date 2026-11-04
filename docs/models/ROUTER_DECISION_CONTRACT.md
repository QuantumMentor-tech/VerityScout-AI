# Model Routing Decision & Request Contract Reference

**Governed by:** Implementation Step 42 (Phase 9: Model Routing and Asynchronous Research)  
**Authoritative Location:** `src/server/models/router/router-contracts.ts`

---

## 1. Request Contract

```typescript
export interface ModelRoutingRequest {
  readonly userId: string;
  readonly operationType: ModelOperationType;
  readonly customRequirements?: Partial<ModelOperationProfile> | undefined;
  readonly routingMode?: 'AUTO_PICK' | 'EXPLICIT' | 'FALLBACK' | undefined;
  readonly explicitSelection?: {
    readonly providerId: AiProviderId;
    readonly modelId: string;
  } | undefined;
  readonly preferredProviders?: readonly AiProviderId[] | undefined;
  readonly preferredFamilies?: readonly string[] | undefined;
  readonly allowFallback?: boolean | undefined;
  readonly correlationId?: string | undefined;
}
```

---

## 2. Decision Contract

```typescript
export interface SelectedModelInfo {
  readonly providerId: AiProviderId;
  readonly nativeModelId: string;
  readonly catalogId: string;
  readonly displayName: string;
  readonly family: string;
  readonly structuredOutputLevel: StructuredOutputSupportLevel;
  readonly contextWindowTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly isRecommended: boolean;
}

export interface CandidateRejection {
  readonly modelId: string;
  readonly providerId: AiProviderId;
  readonly reasonCode: CandidateRejectionReason;
  readonly details: string;
}

export interface ModelRoutingDecision {
  readonly decisionId: string;
  readonly status: 'SUCCESS' | 'NO_ELIGIBLE_MODEL' | 'EXPLICIT_INCOMPATIBLE' | 'CONFIGURATION_UNAVAILABLE' | 'INVALID_REQUEST';
  readonly routingMode: 'AUTO_PICK' | 'EXPLICIT' | 'FALLBACK';
  readonly operationType: ModelOperationType;
  readonly policyVersion: string;
  readonly selectedModel: SelectedModelInfo | null;
  readonly selectionReasons: readonly string[];
  readonly explanation: string;
  readonly eligibleCandidatesCount: number;
  readonly rejectedCandidates: readonly CandidateRejection[];
  readonly alternativeCandidates?: readonly SelectedModelInfo[] | undefined;
  readonly timestamp: string;
}
```

---

## 3. Router Service API

```typescript
export class ModelRouterService {
  route(request: ModelRoutingRequest): Promise<ModelRoutingDecision>;
}

export function getDefaultModelRouterService(): ModelRouterService;
export function resetDefaultModelRouterService(): void;
```

