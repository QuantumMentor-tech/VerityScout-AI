# VerityScout AI — Claim Schema & Evidence Grounding Contract

**Document Identifier:** VS-CLAIM-SCHEMA-GROUNDING-v1.0  
**Status:** APPROVED DATA CONTRACT SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 36 of 60)  
**Classification:** Core Data Schema & Runtime Validation  
**Traceability:** Mapped to [DATA_CONTRACTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/DATA_CONTRACTS.md) (`Section 3.4`), `UR-007`, `UR-025`, `AC-007`.

---

## 1. Canonical Claim Contract (`ExtractedClaim`)

Every factual claim extracted by the system conforms to the runtime-validated `ExtractedClaimSchema` ([`src/server/claims/contracts.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/claims/contracts.ts)):

```typescript
export interface ExtractedClaim {
  readonly id: string;                        // Stable UUIDv4 identifying the claim
  readonly runId: string;                     // Foreign key -> research_runs.id
  readonly sourceDocumentId: string;          // Foreign key -> source_documents.id
  readonly userId: string;                    // Tenant owner identifier (SEC-008)
  readonly subject: string | null;            // Primary subject entity (e.g. 'ThinkPad X1')
  readonly claimKey: string;                  // Standardized snake_case attribute key
  readonly extractedRawValue: string;         // Verbatim value stated by source ('$1,299.00', '1.4 kg')
  readonly claimType: ClaimType;              // 'PROPERTY' | 'PRICE' | 'AVAILABILITY' | 'SPECIFICATION' | 'WARRANTY' | 'COMPATIBILITY' | 'GENERAL_FACT'
  readonly polarity: ClaimPolarity;           // 'POSITIVE' | 'NEGATIVE'
  readonly qualifiers: readonly string[];     // Contextual constraints (['base model only'])
  readonly evidence: EvidenceSpan;            // Strictly verified supporting quote and offsets
  readonly extractionStatus: ExtractionStatus;// 'EXPLICIT' | 'INFERRED' | 'AMBIGUOUS' | 'UNRESOLVED'
  readonly extractionMethod: ExtractionMethod;// 'LLM_STRUCTURED' | 'REGEX_DETERMINISTIC' | 'META_TAG' | 'DOM_SELECTOR'
  readonly verificationState: VerificationState; // 'SUPPORTED' | 'CONTRADICTED' | 'UNKNOWN' | 'CONFLICTING' | 'STALE'
  readonly conflictDetails?: string;          // Explanation if conflicting assertions exist
  readonly extractedAt: string;               // ISO 8601 UTC timestamp
}
```

---

## 2. Supporting Evidence Span Contract (`EvidenceSpan`)

To ensure evidentiary accountability, every claim references an `EvidenceSpan`:

```typescript
export interface EvidenceSpan {
  readonly verbatimQuote: string;             // Exact text span from source document
  readonly charOffsetStart: number;           // 0-indexed character start in source text
  readonly charOffsetEnd: number;             // 0-indexed character end in source text
  readonly locationInDocument?: string;       // Heading, section, or paragraph locator
  readonly groundingStatus: EvidenceGroundingStatus; // 'GROUNDED_EXACT' | 'GROUNDED_NORMALIZED' | 'UNVERIFIED_QUOTE' | 'LOCATOR_UNVERIFIABLE'
  readonly confidenceScore: number;           // Score between 0.0 and 1.0
}
```

### Invariants:
1. `sourceText.substring(charOffsetStart, charOffsetEnd) === verbatimQuote`
2. `charOffsetStart >= 0` and `charOffsetEnd <= sourceText.length`
3. If `groundingStatus === 'UNVERIFIED_QUOTE'`, the claim is rejected and quarantined.

---

## 3. Raw Value Preservation Principles

| Source Stated Value | Step 36 Preserved Value | Notes |
| :--- | :--- | :--- |
| `"1.4 kg (3.08 lbs)"` | `"1.4 kg (3.08 lbs)"` | Raw representation preserved; unit conversion belongs to Step 37. |
| `"Starting at $299"` | `"Starting at $299"` | Preserves qualifier "Starting at" and currency "$". |
| `"Up to 14 hours"` | `"Up to 14 hours"` | Preserves range qualifier "Up to". |
| `"Not compatible with Thunderbolt 3"` | `"Not compatible with Thunderbolt 3"` | Preserves raw text; polarity marked `NEGATIVE`. |

