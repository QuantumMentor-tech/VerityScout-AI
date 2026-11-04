# VerityScout AI — Product Identity, Price & Specification Normalization

**Document Identifier:** VS-PRODUCT-IDENTITY-SPEC-NORMALIZATION-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 37 of 60)  
**Classification:** Core Data Normalization & Epistemic Traceability  
**Traceability:** Mapped to [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-008`, `UR-026`, `AC-008`, `SEC-009`, `SEC-033`).

---

## 1. Core Epistemological Foundations

A non-negotiable architectural invariant of **VerityScout AI** is that **normalization enables systematic comparison; it does NOT establish factual veracity or merge distinct product identities**:

> **Normalization answers: "What is the typed, unit-standardized, comparable representation of this source-stated claim?"**  
> **Normalization does NOT answer: "Is this product identical to another, does this offer meet user constraints, or should we exchange currencies?"**

Key principles enforced by the Step 37 implementation:

1. **Source Immutability:** Raw extracted values (e.g., `"1.4 kg"`, `"$1,299.99"`, `"Starting at $299"`) and verbatim quotes are never mutated, overwritten, or discarded.
2. **Zero Currency Conversion:** Differently denominated prices (e.g., USD vs EUR vs CAD) remain strictly separate. No external exchange rates or guessed conversion multipliers are applied. Bare ambiguous dollar signs (`$`) default to `null` ISO currency code to eliminate false geographic assumptions.
3. **No Premature Merging:** Product variants (e.g., `X100` vs `X100 Pro` vs `X100 Gen 2`) and conditions (`NEW` vs `REFURBISHED` vs `USED`) are preserved with their differentiating tokens intact.
4. **Strict Dimensional Compatibility:** Unit conversions are permitted solely within the same physical dimension (e.g., `kg` $\to$ `g`, `cm` $\to$ `mm`). Cross-dimensional conversions (e.g., `kg` $\to$ `mm` or `W` $\to$ `hours`) are strictly rejected.
5. **Exact Decimal Monetary Representation:** Monetary amounts are stored as exact decimal strings (`"1299.99"`) to eliminate IEEE 754 floating-point inaccuracies.
6. **Full Upstream Traceability:** Every `NormalizedAttribute` maintains direct cryptographic references to its originating Step 36 `claimId`, Step 34 `sourceDocumentId`, `runId`, and user context.

---

## 2. Architecture & Processing Flow

The normalization subsystem bridges extracted source claims (`ExtractedClaim` from Step 36) to downstream constraint evaluation (Step 38):

```
ExtractedClaim[] (Step 36)
          │
          ▼
ProductNormalizationService
          │
          ▼
  normalizeClaim (Dispatcher)
  ├── 1. PRICE: parseMonetary (price-parser.ts)
  │      ├── Currency identification (ISO 4217, null on ambiguous '$')
  │      ├── Exact decimal formatting (US / EU international formats)
  │      ├── Price typing (CURRENT, LIST, DISCOUNTED, STARTING_AT, RANGE, SUBSCRIPTION)
  │      └── ZERO currency conversion guarantee
  │
  ├── 2. SPECIFICATION: parseMeasurement (units.ts)
  │      ├── Dimension mapping (MASS, LENGTH, DISPLAY_SIZE, STORAGE, MEMORY, etc.)
  │      ├── Deterministic conversion to canonical units (g, mm, in, GB, MB, hours, W)
  │      └── Range, bounds (isUpperBound, isLowerBound), and approximation flags
  │
  ├── 3. IDENTITY / PROPERTY: parseProductIdentity (identity-parser.ts)
  │      ├── Brand & model number extraction
  │      ├── Variant & family token preservation
  │      ├── Condition classification (NEW, REFURBISHED, USED, UNKNOWN)
  │      └── Promotional noise elimination
  │
  ├── 4. AVAILABILITY: normalizeAvailability
  │      └── Standardization (IN_STOCK, OUT_OF_STOCK, PREORDER, BACKORDER)
  │
  └── 5. GENERAL / FEATURE: Fallback representation
          │
          ▼
Output Contracts:
  1. NormalizedAttribute[] (Audit-grade detailed representation)
  2. ComparableAttribute[] (Step 38 deterministic constraint evaluation input)
  3. NormalizationSummary (Batch execution metrics)
```

---

## 3. Physical Dimension & Unit Dictionary

| Dimension | Canonical Unit | Supported Source Units | Conversion Policy |
| :--- | :--- | :--- | :--- |
| **MASS** | `g` | `g`, `mg`, `kg`, `oz`, `lb` | $1\text{ kg} = 1000\text{ g}$, $1\text{ lb} \approx 453.59\text{ g}$ |
| **LENGTH** | `mm` | `mm`, `cm`, `m`, `in`, `ft` | $1\text{ cm} = 10\text{ mm}$, $1\text{ in} = 25.4\text{ mm}$ |
| **DISPLAY_SIZE** | `in` | `in`, `"`, `cm`, `mm` | Diagonal screen size preserved in inches |
| **STORAGE** | `GB` | `B`, `KB`, `MB`, `GB`, `TB`, `PB`, `GiB`, `TiB` | Base-10 metric for storage drives; IEC binary for GiB/TiB |
| **MEMORY** | `MB` | `KB`, `MB`, `GB`, `TB`, `KiB`, `MiB`, `GiB`, `TiB` | Base-2 binary standard for RAM ($1\text{ GB} = 1024\text{ MB}$) |
| **DURATION** | `hours` | `s`, `min`, `h`, `hr`, `days` | $1\text{ hr} = 1\text{ hr}$, $1\text{ day} = 24\text{ hrs}$ |
| **FREQUENCY** | `GHz` | `Hz`, `kHz`, `MHz`, `GHz`, `THz` | $1\text{ GHz} = 1\text{ GHz}$, $3200\text{ MHz} = 3.2\text{ GHz}$ |
| **POWER** | `W` | `mW`, `W`, `kW`, `hp` | $1\text{ kW} = 1000\text{ W}$, $1\text{ hp} \approx 745.7\text{ W}$ |
| **RESOLUTION** | `pixels` | `WxH` (e.g. `1920x1080`) | Width $\times$ Height total pixel count |
| **COUNT** | `count` | `core`, `cores`, `port`, `ports`, `count` | Factor 1 |

---

## 4. Verification and Test Evidence

Verified offline through comprehensive unit tests in [`tests/unit/product-normalization.test.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working Projects/VerityScout%20AI%20WEB%20(working)/tests/unit/product-normalization.test.ts):

- **Unit and Measurement Tests:** Mass (g), length (mm), display size (in), storage (GB), memory (MB), ranges (`10 - 12 hours`), bounds (`up to 14 hours`, `at least 5 kg`), approximations (`~1.4 kg`), cross-dimensional conversion rejection.
- **Price Tests:** US formatting (`$1,299.99`), EU formatting (`1.299,99 €`), ambiguous `$` nullification, explicit currencies (`USD`, `CAD`, `AUD`, `GBP`, `EUR`, `INR`, `JPY`), price classification (`LIST`, `DISCOUNTED`, `STARTING_AT`, `RANGE`, `SUBSCRIPTION`), non-numeric handling (`UNRESOLVED`).
- **Product Identity Tests:** Brand recognition, model number / SKU extraction, variant token preservation (`X100` vs `X100 Pro` vs `X100 Gen 2`), condition detection (`NEW`, `REFURBISHED`, `USED`).
- **ComparableAttribute Handoff:** Complete integration test dispatching claims into Step 38 comparable representation.
- **Performance & Batch Processing:** `ProductNormalizationService` execution returning `NormalizationSummary`.

