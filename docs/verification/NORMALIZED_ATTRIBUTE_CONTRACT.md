# VerityScout AI — Normalized Attribute & Comparable Attribute Contract Specification

**Document Identifier:** VS-NORMALIZED-ATTRIBUTE-CONTRACT-v1.0  
**Status:** APPROVED INTERFACE SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 37 of 60)  
**Governing Standard:** Deterministic Evidence-Linked Normalization  
**Upstream Source:** Step 36 [`ExtractedClaim`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/claims/contracts.ts)  
**Downstream Consumer:** Step 38 Deterministic Constraint Evaluation & Candidate Verification  

---

## 1. Schema Definitions

Located in [`src/server/normalization/contracts.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/normalization/contracts.ts).

### 1.1 `NormalizedAttribute` (Audit-Grade Representation)

```typescript
export interface NormalizedAttribute {
  readonly id: string;
  readonly claimId: string;
  readonly sourceDocumentId: string;
  readonly runId: string;
  readonly userId: string;
  readonly attributeKey: string;
  readonly rawValue: string;
  readonly attributeType: 'MONETARY' | 'DIMENSION' | 'IDENTITY' | 'CATEGORICAL' | 'GENERAL';
  readonly status: 'NORMALIZED' | 'PARTIALLY_NORMALIZED' | 'UNRESOLVED' | 'INVALID';
  readonly monetaryValue?: MonetaryValue;
  readonly measurementValue?: MeasurementValue;
  readonly identityValue?: ProductIdentityValue;
  readonly categoricalValue?: CategoricalValue;
  readonly generalValue?: string;
  readonly qualifiers: readonly string[];
  readonly evidenceQuote: string;
  readonly charOffsets: {
    readonly start: number;
    readonly end: number;
  };
  readonly unresolvedReason?: string;
  readonly normalizedAt: string;
  readonly rulesetVersion: string;
}
```

### 1.2 `ComparableAttribute` (Step 38 Evaluation Contract)

Designed for consumption by Step 38 constraint evaluation without requiring knowledge of raw extraction strings or parsing logic:

```typescript
export interface ComparableAttribute {
  readonly key: string;
  readonly type: NormalizedAttributeType;
  readonly numericValue?: number | undefined;
  readonly decimalString?: string | undefined;
  readonly unit?: string | undefined;
  readonly currency?: string | undefined;
  readonly textValue?: string | undefined;
  readonly isRange: boolean;
  readonly rangeMin?: number | undefined;
  readonly rangeMax?: number | undefined;
  readonly condition?: ProductCondition | undefined;
  readonly availability?: AvailabilityStatus | undefined;
  readonly qualifiers: readonly string[];
  readonly isApproximate: boolean;
  readonly confidence: number;
}
```

---

## 2. Invariants for Step 38 Handoff

1. **Deterministic Constraint Matching:** Step 38 may compare `numericValue` against user thresholds (e.g. `price <= 1000`, `weight <= 1500g`) with exact unit alignment guaranteed by Step 37.
2. **Currency Segregation:** If `currency` is undefined or null (due to ambiguous `$` in source text), Step 38 must treat the currency as unverified rather than assuming USD.
3. **Condition Awareness:** If user constraints require `condition: 'NEW'`, Step 38 can directly check `ComparableAttribute.condition === 'NEW'`. Refurbished or used items are never conflated with new goods.
4. **Range Handling:** When `isRange: true`, `rangeMin` and `rangeMax` supply the lower and upper bounds for constraint satisfaction algorithms.

