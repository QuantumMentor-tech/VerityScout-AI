# VerityScout AI — Extracted Document Contract & Content Normalization

**Document Identifier:** VS-EXTRACT-CONTRACT-v1.0  
**Status:** APPROVED DATA CONTRACT SPECIFICATION  
**Phase:** Phase 7 (Step 34 of 60)  
**Author:** Principal Software Architect, Senior QA Automation Engineer  
**Classification:** Domain Data Contract  
**Traceability:** Mapped to [DATA_CONTRACTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/DATA_CONTRACTS.md) (Section 3.3), [ADR-005](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/adr/ADR-005-search-and-extraction-provider-abstraction.md), and [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-006`, `AC-006`).

---

## 1. Epistemological Standard: Content Extraction vs. Fact Verification

A core design invariant of **VerityScout AI** is:
> **Extracted webpage content is raw external evidence, not verified truth.**

A successful page extraction means only that HTML or text content was safely retrieved from a validated URL, stripped of boilerplate, and converted into Markdown. It does **not** prove:
- That the seller or author's statements are true.
- That a quoted price is current or in stock.
- That product specifications satisfy user constraints.
- That claims are non-conflicting or authoritative.

Individual claim extraction belongs to **Step 36**, candidate attribute normalization to **Step 37**, and deterministic constraint verification to **Step 38**.

---

## 2. Canonical Extracted Document Schema (`ExtractedDocument`)

Every extracted web source conforms to `ExtractedDocument` (`src/server/extraction/contracts.ts`):

```typescript
export interface ExtractedDocument {
  readonly id: string;                     // Unique UUIDv4 identifying extraction record
  readonly provider: ExtractionProviderId; // 'direct_safe_fetch' | 'firecrawl' | 'mock_extract'
  readonly requestedUrl: string;           // Verbatim URL requested before redirects
  readonly finalUrl: string;               // Final validated destination reached
  readonly domain: string;                 // Extracted FQDN hostname
  readonly title: string | null;           // Extracted page title (null if absent)
  readonly markdownContent: string;        // Clean, tag-stripped Markdown text
  readonly textExcerpt: string | null;     // Concise lead excerpt (<800 chars)
  readonly contentHash: string | null;     // SHA-256 hex digest of markdownContent
  readonly author: string | null;          // Author name if present on page
  readonly publisher: string | null;       // Site name or publisher
  readonly publishedDate: string | null;   // ISO 8601 string if reported on page
  readonly language: string | null;        // Document language (e.g. 'en')
  readonly contentType: string | null;     // MIME type (e.g. 'text/html')
  readonly httpStatusCode: number;         // Upstream HTTP response status
  readonly accessState: SourceAccessState; // Network accessibility classification
  readonly extractionState: ExtractionState;// Content processing classification
  readonly warnings: readonly string[];    // Diagnostic warnings
  readonly retrievedAt: string;            // ISO 8601 UTC timestamp of retrieval
  readonly usage: {
    readonly bytesReceived: number;        // Raw bytes transferred
    readonly latencyMs: number;            // Total socket dispatch to parse duration
  };
}
```

---

## 3. Truthful Metadata Semantics

1. **Publication Date vs. Retrieval Time:**
   - `publishedDate`: Represents the date reported *by the webpage itself* via `<meta property="article:published_time">`, `<time datetime="...">`, or schema tags. If absent, it is strictly `null`.
   - `retrievedAt`: Represents the exact wall-clock timestamp when VerityScout AI retrieved the document.
   - The application **never** defaults `publishedDate` to `retrievedAt`.
2. **Missing Metadata Invariant:**
   - Absent authors, titles, or publishers are preserved as `null`. Synthetic placeholders like `"Unknown Author"` or deriving the author from the URL hostname are strictly forbidden.
3. **Requested URL vs. Final URL:**
   - Preserves both `requestedUrl` and `finalUrl` across redirect hops. Downstream deduplication (Step 35) uses both fields to establish canonical document identity without premature URL merging.

---

## 4. State Classifications

### 4.1 `SourceAccessState`
- `ACCESSIBLE`: Document retrieved successfully over HTTP/HTTPS.
- `BLOCKED_BOT_CHALLENGE`: Upstream blocked request with Cloudflare, Turnstile, or CAPTCHA challenge.
- `HTTP_ERROR`: Upstream returned HTTP 4xx or 5xx error.
- `TIMEOUT`: TCP connection ($>5$s) or response stream ($>15$s) timed out.
- `DNS_RESOLUTION_FAILED`: Domain name failed DNS resolution (NXDOMAIN).
- `SSRF_PROHIBITED`: Destination URL violated Step 32 network policy (loopback, RFC 1918, link-local, unapproved port).

### 4.2 `ExtractionState`
- `SUCCESS`: Substantive text content extracted into Markdown.
- `EMPTY_BODY`: Page returned HTTP 200 but contained no readable text (e.g. empty SPA shell).
- `PAYLOAD_TOO_LARGE`: Response exceeded the 5 MB streaming ceiling.
- `UNSUPPORTED_CONTENT`: Response Content-Type was non-text (e.g. `application/pdf`, `image/png`).
- `PARSING_FAILED`: Markup structure could not be parsed safely.
- `SKIPPED`: Document extraction skipped due to SSRF block, HTTP error, or bot challenge.

---

## 5. Downstream Integration Boundary (Steps 35 and 36)

- **Step 35 (Canonicalization & Deduplication):** Consumes `ExtractedDocument` instances, performs URL parameter scrubbing, detects cross-query duplicate documents via `contentHash`, and persists unique sources into the PostgreSQL `source_documents` table.
- **Step 36 (Structured Fact Extraction):** Consumes `markdownContent` as untrusted input to extract structured product attributes, pricing, and verbatim quote excerpts.

