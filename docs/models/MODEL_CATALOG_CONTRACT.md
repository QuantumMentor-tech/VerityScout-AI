# Model Catalog Interface and Contract Reference

**Governed by:** Implementation Step 41 (Phase 9: Model Routing and Asynchronous Research)  
**Authoritative Types:** `src/server/models/contracts.ts`

---

## 1. Canonical Model Identification

Canonical model identifiers are formatted as:
```
${providerId}:${nativeModelId}
```

Examples:
- `openai:gpt-4o`
- `openrouter:anthropic/claude-3.5-sonnet`
- `nim:meta/llama-3.1-70b-instruct`

### Builder and Parser Functions:
```typescript
function createModelCatalogId(providerId: AiProviderId, nativeModelId: string): string;
function parseModelCatalogId(catalogId: string): { providerId: AiProviderId; nativeModelId: string };
```

---

## 2. Model Catalog Entry Schema

```typescript
export interface ModelCatalogEntry {
  readonly id: string;
  readonly providerId: AiProviderId;
  readonly nativeModelId: string;
  readonly displayName: string;
  readonly family: string;
  readonly description?: string | undefined;
  readonly contextWindowTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly pricing?: ModelPricing | undefined;
  readonly capabilities: ModelCapabilities;
  readonly availabilityState: ModelAvailabilityState;
  readonly provenance: CapabilityProvenance;
  readonly isRecommended: boolean;
  readonly lastVerifiedAt?: string | undefined;
  readonly lastRefreshedAt: string;
}
```

---

## 3. Query Contract

```typescript
export interface ModelCatalogQuery {
  readonly providerId?: AiProviderId | undefined;
  readonly requiredCapabilities?: readonly ModelCapabilityType[] | undefined;
  readonly structuredOutputLevels?: readonly StructuredOutputSupportLevel[] | undefined;
  readonly supportsImages?: boolean | undefined;
  readonly minContextWindow?: number | undefined;
  readonly availabilityStates?: readonly ModelAvailabilityState[] | undefined;
  readonly family?: string | undefined;
  readonly searchTerm?: string | undefined;
}
```

---

## 4. Service API

```typescript
export class ModelCatalogService {
  listModels(query?: ModelCatalogQuery): Promise<readonly ModelCatalogEntry[]>;
  getModel(providerId: AiProviderId, nativeModelId: string): Promise<ModelCatalogEntry | null>;
  checkCapability(providerId: AiProviderId, nativeModelId: string, capability: ModelCapabilityType): Promise<boolean>;
  getStructuredOutputLevel(providerId: AiProviderId, nativeModelId: string): Promise<StructuredOutputSupportLevel>;
  registerOperatorModel(entry: ModelCatalogEntry): void;
  refreshCatalog(options?: { providerId?: AiProviderId; context?: ProviderOperationContext }): Promise<CatalogRefreshSummary>;
  getFreshness(providerId?: AiProviderId): CatalogFreshnessInfo;
}
```

