# VerityScout AI — URL Canonicalization Policy (v1)

**Document Identifier:** VS-URL-CANONICALIZATION-POLICY-v1.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Phase:** Phase 7 (Step 35 of 60)  
**Classification:** Core Information Retrieval & Security Policy  
**Traceability:** Mapped to [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-006`, `AC-006`, `SEC-008`).

---

## 1. Objectives & Epistemological Principles

In **VerityScout AI**, web search results and discovery leads may reference the exact same underlying web document under distinct URL variations (e.g. click trackers, campaign tags, differing query parameter orders, anchors, or default ports). 

The URL Canonicalization Engine ([`src/server/search/canonicalizer.ts`](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/src/server/search/canonicalizer.ts)) produces a deterministic, conservative identity representation (`canonicalUrl`) for discovered web resources without destroying provenance or confusing identity with content truth:

1. **Conservative Equivalence:** URLs are merged only under explicitly proven, deterministic equivalence rules. Unbounded or speculative URL rewriting is strictly prohibited.
2. **Provenance Preservation:** The original discovered URL (`originalUrl`) and its complete query string and fragment are preserved in discrete discovery records.
3. **Identity vs. Content:** A canonical URL identifies a *source identity* within a research run. It does **not** assert that the content is immutable, identical across time, authoritative, or factually verified.
4. **Zero-Network Invariant:** URL canonicalization is 100% pure, synchronous, and offline. Canonicalization never makes network calls or DNS requests to infer identity.

---

## 2. Canonicalization Rules & Normalization Pipeline

The policy version is designated **`v1`** (`CANONICALIZER_POLICY_VERSION = 'v1'`).

```
Raw Discovered URL
      │
      ▼
[1. WHATWG URL Parsing & Scheme Validation] ──(Disallowed scheme)──► Invalid Result
      │
      ▼
[2. Fragment Extraction & Stripping] ─────────► Fragment saved to metadata; stripped from canonical URL
      │
      ▼
[3. Hostname Normalization] ──────────────────► Lowercase; remove trailing dot; Punycode preservation
      │
      ▼
[4. Port Normalization] ──────────────────────► Strip default (:80 for http, :443 for https); preserve non-default (:8080, :8443)
      │
      ▼
[5. Path Preservation] ──────────────────────► Case-sensitive; trailing slash preserved; encoding normalized
      │
      ▼
[6. Query Parameter Handling] ────────────────► Strip approved tracking params; preserve content params; sort lexicographically
      │
      ▼
Deterministic Canonical URL Output
```

### 2.1 Scheme Validation
- **Permitted Schemes:** Strictly `http:` and `https:`.
- **Prohibited Schemes:** `file:`, `javascript:`, `ftp:`, `data:`, `blob:` return `isSuccess: false`.
- **Scheme Distinction:** `http` and `https` are **never** blindly merged. An HTTP URL and an HTTPS URL are preserved as distinct resources unless explicitly resolved through a permitted redirect chain during Step 34 extraction.

### 2.2 Hostname Normalization
- Hostnames are converted to lowercase standard form.
- Fully qualified domain names with a trailing dot (e.g. `example.com.`) have the trailing dot removed (`example.com`).
- Internationalized domain names (IDN) and Punycode labels are normalized standardly according to the WHATWG specification.

### 2.3 Port Normalization
- Explicit default ports are removed: `:80` on HTTP and `:443` on HTTPS are stripped.
- Non-default ports (e.g. `:8080`, `:8443`, `:3000`) are **strictly preserved** as they represent distinct network services.

### 2.4 Path Normalization
- **Case Preservation:** Path segments retain their original case (e.g. `/Wiki/Product` is not rewritten to `/wiki/product`).
- **Trailing Slash Preservation:** Trailing slashes are **not** stripped or added indiscriminately (e.g. `/docs/api` and `/docs/api/` are kept distinct unless the server redirects).
- **Dot Segment Resolution:** Relative segments (`.` and `..`) are safely resolved by WHATWG URL parsing.

### 2.5 Query Parameter Normalization & Tracking Allowlist
Query parameters frequently distinguish products, versions, languages, or pages. The canonicalizer uses an **explicit, conservative allowlist** of known non-content tracking parameters to strip:

```typescript
export const APPROVED_TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Google Analytics & UTM
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  // Google Click IDs & Analytics
  'gclid', 'gclsrc', 'dclid', '_ga', '_gl',
  // Social Platforms
  'fbclid', 'msclkid', 'twclid', 'igshid',
  // Marketing Platforms
  '_hsenc', '_hsmi', 'mc_eid', 'mc_cid',
  // Affiliate Tracking
  'zanpid', 'wickedid', 'oly_anon_id', 'oly_enc_id',
]);
```

- **Content Parameters Strictly Preserved:** Parameters such as `id`, `sku`, `p`, `page`, `v`, `variant`, `color`, `size`, `model`, `q`, `search`, `category`, `sort`, `filter`, and `lang` are strictly preserved.
- **Repeated Parameters:** Repeated query parameters (e.g. `tag=laptop&tag=ultrabook`) preserve their values and relative order.
- **Deterministic Parameter Sorting:** Remaining parameters are sorted lexicographically by key to ensure `?a=1&b=2` and `?b=2&a=1` produce the identical canonical URL.

### 2.6 Fragment Handling
- Fragments (`#section`, `#reviews`) are stripped from the canonical URL representation because HTTP transport does not transmit fragments and the underlying HTML document is identical.
- The fragment is extracted and retained in discovery provenance metadata (`originalFragment`) so evidence anchors can reference specific section locations.

---

## 3. Page-Supplied Canonical URL Hints (`<link rel="canonical">`)

Web pages frequently declare a canonical URL hint via `<link rel="canonical" href="...">`.

### Core Safety Rule: Untrusted Hints
Page-supplied canonical URLs are **untrusted metadata hints**. They:
1. **Never** automatically replace the application's canonical URL.
2. **Never** trigger automated network requests or crawling.
3. Must pass Step 32 SSRF validation before even being recorded as metadata.

### Evaluation Classifications:
- `SAME_ORIGIN_MATCH`: Hint matches the application's computed canonical URL.
- `SAME_ORIGIN_DIFFERENT`: Hint suggests a different path or clean parameter set on the same domain.
- `CROSS_ORIGIN`: Hint points to an external domain (e.g. syndicated content). Preserved as untrusted audit metadata; never auto-merged.
- `INVALID_URL`: Hint contains unparseable syntax or unsupported schemes.
- `UNSAFE_DESTINATION`: Hint points to loopback, private RFC 1918, or cloud metadata endpoints. Flagged and rejected.

---

## 4. Concrete Examples

| Original Discovered URL | Canonicalized URL (`v1`) | Notes |
| :--- | :--- | :--- |
| `https://example.com/item?utm_source=news&id=101` | `https://example.com/item?id=101` | `utm_source` removed; `id` preserved. |
| `https://example.com/search?b=2&a=1` | `https://example.com/search?a=1&b=2` | Parameters sorted deterministically. |
| `https://example.com/product#specs` | `https://example.com/product` | Fragment stripped; preserved in metadata. |
| `http://example.com:80/page` | `http://example.com/page` | Default port 80 stripped. |
| `https://example.com:8443/page` | `https://example.com:8443/page` | Non-default port 8443 strictly preserved. |
| `https://EXAMPLE.com./docs/` | `https://example.com/docs/` | Hostname lowercased, trailing dot removed, trailing slash preserved. |
| `http://example.com/item` vs `https://example.com/item` | Preserved distinct | HTTP and HTTPS are distinct source identities. |

