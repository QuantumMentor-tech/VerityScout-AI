# VerityScout AI — Structured Fact Extraction & Claim Representation

**Document Identifier:** VS-FACT-EXTRACTION-CLAIM-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 8, Verification and Reports (Step 36 of 60)  
**Classification:** Core Information Extraction & Epistemic Traceability  
**Traceability:** Mapped to [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-007`, `UR-025`, `AC-007`, `SEC-008`, `SEC-032`).

---

## 1. Core Epistemological Foundations

A cardinal design invariant of **VerityScout AI** is the strict epistemic boundary between **source-stated assertions** and **verified facts**:

> **Extraction answers: "What does this source explicitly state, and what passage supports that statement?"**  
> **Extraction does NOT answer: "Is this statement true, current, or comparable across products?"**

A model may extract an attribute accurately from a product review or retailer listing, but the source itself may be outdated, misleading, promotional, or inaccurate. The extraction pipeline captures statements and their exact textual backing without prematurely conferring the status of verified ground truth.

---

## 2. Extraction Pipeline Architecture

The pipeline consumes `ExtractedDocument` instances produced by Step 34 and canonical `source_documents` identities established in Step 35:

```
ExtractedDocument (Step 34) + Canonical Source (Step 35)
                         │
                         ▼
             ClaimExtractionService
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼ (AI Provider Configured)      ▼ (Offline / Zero-Spend Fallback)
    AiClaimExtractor           extractClaimsViaRules
 (Prompt-Injection Barrier)     (Deterministic Regex Engine)
         │                               │
         └───────────────┬───────────────┘
                         │
                         ▼
              verifyEvidenceGrounding
        (Exact Substring & Offset Verification)
                         │
         ┌───────────────┴───────────────┐
         ▼ (Quote Grounded)              ▼ (Quote Absent / Hallucinated)
   Accepted Claims               Quarantined / Rejected Claims
 (ExtractedClaim[])             (UNVERIFIED_QUOTE)
         │
         ▼ (persist = true)
  evidence_records Table
```

### 2.1 Preserving Raw Source Values
Extracted values are preserved exactly as phrased in the source text:
- `"1.4 kg"`, `"1400 g"`
- `"$1,299.00"`, `"Starting at $299"`
- `"Up to 14 hours"`
- `"In Stock (2 units remaining)"`

**Step 36 strictly refrains from unit conversion, currency exchange, price rounding, or cross-product comparability.** Those operations belong exclusively to **Step 37**.

### 2.2 Preserving Negation & Qualifiers
- **Polarity:** Statements that express an absence, exclusion, or incompatibility are given `polarity: 'NEGATIVE'` (e.g. `"Not compatible with Thunderbolt 3"`).
- **Qualifiers:** Contextual restrictions, model variants, conditional discounts, or geographic limits are captured in `qualifiers: string[]` (e.g. `['base model only', 'with student discount']`).

### 2.3 Preserving Conflicting Assertions
If a document or across documents differing statements exist (e.g. "Starting at $1,299" and "Upgraded model: $1,899"), the pipeline extracts **both** as discrete claims. Contradictions are never silently discarded or reconciled at extraction time.

---

## 3. Strict Quote Grounding (`verifyEvidenceGrounding`)

A claim cannot enter the accepted evidence set on trust alone. Every candidate claim must supply a `verbatim_quote`:
1. **Exact Substring Matching:** The verbatim quote must exist as an exact substring in the extracted document text.
2. **Character Offsets:** The 0-indexed start and end character offsets (`charOffsetStart`, `charOffsetEnd`) are calculated and verified such that `sourceText.substring(start, end) === verbatimQuote`.
3. **Normalized Whitespace Fallback:** If line breaks or consecutive spaces were collapsed by formatting, normalized matching projects back to the original slice with `GROUNDED_NORMALIZED`.
4. **Hallucination Quarantine:** Any quote not found in the source text is rejected with `UNVERIFIED_QUOTE` and quarantined from the research findings.

---

## 4. Prompt-Injection Defense (`SEC-008`, `SEC-032`)

Web documents are untrusted external inputs. The extraction prompt establishes defense-in-depth:
1. **Passive Data Boundary:** Document text is enclosed within `<untrusted_document_content>` tags. The model is explicitly instructed that content inside those tags cannot override system directives or grant privileges.
2. **Zero Code Execution:** Extracted text is never executed or evaluated as JavaScript, HTML, or shell commands.
3. **Zero Secret Egress:** Error messages and logs strictly redact credentials, auth tokens, or private research payloads.

