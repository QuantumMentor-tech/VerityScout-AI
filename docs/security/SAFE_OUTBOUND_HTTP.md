# VerityScout AI — Safe Outbound HTTP Integration Guide

**Document Identifier:** VS-SEC-OUTBOUND-HTTP-v1.0  
**Status:** APPROVED ENGINEERING SPECIFICATION  
**Phase:** Phase 7 (Step 32 of 60)  
**Author:** Principal Software Architect, Application Security Lead  
**Classification:** Backend Developer Integration Contract  
**Target Audience:** Engineers implementing Step 33 (Search Adapters) and Step 34 (HTML/JSON Extraction)  
**Traceability:** Mapped to [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md) (`SEC-011`, `SEC-012`, `SEC-013`).

---

## 1. Overview & Architectural Role

All outbound HTTP network communication in VerityScout AI that interacts with external, user-supplied, search-discovered, or provider-hosted endpoints **MUST** pass through the security subsystem located in `src/server/security/`.

Direct, unmediated usage of global `fetch`, `node:http`, `node:https`, or third-party HTTP clients like `axios` on user-supplied or untrusted URLs is **strictly prohibited**.

The security subsystem provides defense-in-depth:
- URL parsing and normalization (WHATWG standard).
- RFC-compliant IPv4 and IPv6 classification (128-bit math, embedded IPv4 decoding).
- Complete DNS resolution with fail-closed mixed-answer protection.
- Connection-level DNS rebinding immunity via socket pinning.
- Preserved TLS SNI and cryptographic certificate verification.
- Controlled redirect execution with loop prevention and credential stripping.
- Streaming byte consumption ceilings (5 MB) and connect/read timeouts.

---

## 2. Subsystem Module Exports

The security subsystem exports clean contracts from `src/server/security/index.ts`:

```typescript
import {
  safeFetch,
  SafeHttpError,
  type SafeHttpErrorCode,
  type SafeFetchRequestInit,
  type SafeFetchResponse,
  validateUrl,
  type UrlValidationResult,
  resolveAndValidateDns,
  type DnsValidationResult,
  classifyIpAddress,
  type IpClassificationResult,
  PUBLIC_RESEARCH_SOURCE_POLICY,
  TRUSTED_PROVIDER_POLICY,
  APPROVED_PROVIDER_HOSTS,
  type DestinationPolicyType,
} from '@/server/security';
```

---

## 3. Developer Integration Guide

### 3.1 Fetching a Public Web Page (Step 34 HTML Extraction)

When extracting content from an external product page or search result:

```typescript
import { safeFetch, SafeHttpError } from '@/server/security';

export async function fetchPublicSourceHtml(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await safeFetch(url, {
      policy: 'PUBLIC_RESEARCH_SOURCE', // Default policy
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream server returned HTTP ${response.status} ${response.statusText}`);
    }

    // response.text() consumes the stream up to the 5MB safety limit
    const html = await response.text();
    return html;
  } catch (error) {
    if (error instanceof SafeHttpError) {
      // SafeHttpError guarantees no internal network secrets or credentials are leaked
      switch (error.code) {
        case 'INVALID_URL':
        case 'PROHIBITED_DESTINATION':
          // Log security event or return graceful domain-blocked error
          throw new Error(`Untrusted or private URL blocked: ${error.message}`);
        case 'RESPONSE_SIZE_EXCEEDED':
          throw new Error('Target document exceeds the 5MB safety ceiling');
        case 'TIMEOUT':
          throw new Error('Connection or response timed out');
        case 'CANCELLED':
          throw new Error('Operation was cancelled by user');
        default:
          throw new Error(`Network retrieval failed: ${error.message}`);
      }
    }
    throw error;
  }
}
```

### 3.2 Pre-Validating a User-Supplied Source URL

If a user or background process needs to validate whether a URL is acceptable before performing work:

```typescript
import { validateUrl } from '@/server/security';

const validation = validateUrl(userInput, 'PUBLIC_RESEARCH_SOURCE');
if (!validation.isValid) {
  // Reject immediately without touching DNS or the network
  return { valid: false, reason: validation.error };
}

// Access normalized values
console.log(validation.canonicalUrl); // e.g. "https://example.com/item"
console.log(validation.hostname);     // e.g. "example.com"
```

### 3.3 Consuming Streaming Responses Responsibly

`safeFetch` responses provide three body consumers:
1. `response.text()`: Reads the buffered response as a UTF-8 string.
2. `response.json<T>()`: Parses the response buffer as JSON.
3. `response.arrayBuffer()`: Returns raw binary data for downstream processing.

All response methods enforce the underlying streaming size ceiling. If a server trickles data beyond the 5 MB ceiling or hangs for $>15$ seconds, the socket is immediately terminated.

---

## 4. Error Codes & Normalization Reference

| Error Code | Trigger Condition | Recommended Caller Action |
|---|---|---|
| `INVALID_URL` | Malformed URL, unapproved scheme (e.g. `ftp:`), embedded credentials, unapproved port, or raw IP literal. | Return 400 Bad Request to caller. |
| `PROHIBITED_DESTINATION` | Hostname resolves to private, loopback, link-local, multicast, or cloud metadata IP. | Record security audit event; reject source. |
| `DNS_RESOLUTION_FAILED` | Domain name does not exist (NXDOMAIN) or DNS server failed. | Mark source as unreachable. |
| `UNSAFE_REDIRECT` | Redirect location missing, invalid scheme, or targets a private destination. | Terminate redirect chain; discard source. |
| `REDIRECT_LOOP` | Circular redirect cycle detected (e.g., A $\to$ B $\to$ A). | Abort request. |
| `EXCESSIVE_REDIRECTS` | Redirect hops exceeded maximum allowed limit ($>5$). | Abort request. |
| `RESPONSE_SIZE_EXCEEDED`| Declared or transferred payload exceeds 5 MB. | Truncate or reject document. |
| `TIMEOUT` | Socket connection ($>5$s) or response stream ($>15$s) timed out. | Retry with backoff or report timeout. |
| `CANCELLED` | Caller aborted the `AbortSignal`. | Clean up local task state. |
| `UNSUPPORTED_METHOD` | Prohibited HTTP verb used (e.g. POST on public research sources). | Fix caller implementation. |
| `TRANSPORT_ERROR` | TLS handshake failure, TCP socket reset, or low-level network failure. | Safe error normalized for user display. |

---

## 5. Non-Negotiable Security Rules for Developers

1. **Never Disable Socket Pinning:** Do not bypass the custom `agent.lookup` implementation. It is the sole protection against DNS rebinding attacks.
2. **Never Forward Credentials on Redirects:** `safeFetch` automatically removes `Authorization` and `Cookie` headers upon redirect. Do not re-attach credentials without validating origin identity.
3. **Never Increase Body Ceilings Without Approval:** The 5 MB ceiling is an architectural invariant designed to prevent memory exhaustion during extraction.
4. **Never Downgrade AI Providers to Plaintext HTTP:** All provider communication must remain strictly over HTTPS on port 443.

