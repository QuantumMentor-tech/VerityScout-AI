# VerityScout AI — Source Extraction Security & Threat Controls

**Document Identifier:** VS-SEC-EXTRACT-v1.0  
**Status:** APPROVED SECURITY SPECIFICATION  
**Phase:** Phase 7 (Step 34 of 60)  
**Author:** Principal Security Architect, Application Security Lead  
**Classification:** Security Architecture & Threat Mitigation  
**Traceability:** Mapped to [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md) (`SEC-011`, `SEC-012`, `SEC-013`, `SEC-014`, `SEC-020`, `SEC-022`) and [URL_VALIDATION_AND_DESTINATION_POLICY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/URL_VALIDATION_AND_DESTINATION_POLICY.md).

---

## 1. Threat Overview: Web Extraction Attack Surface

Fetching and parsing untrusted third-party web pages introduces multiple severe security risks:
1. **Server-Side Request Forgery (SSRF):** Attacker-controlled URLs targeting internal databases, cloud instance metadata (`169.254.169.254`), or loopback administrative endpoints.
2. **DNS Rebinding:** Time-of-Check to Time-of-Use (TOCTOU) IP remapping bypassing initial pre-flight checks.
3. **Malicious Script Execution & XSS:** Downloaded HTML containing `<script>` tags, inline event handlers, or malicious iframes designed to execute on the server or leak to client browsers.
4. **Denial of Service (DoS) & Memory Exhaustion:** Decompression bombs, infinite streaming bodies, slowloris sockets, and deeply nested DOM trees designed to crash Node.js worker processes.
5. **Prompt Injection & Indirect Jailbreaks:** Webpage text crafted to instruct downstream AI models to ignore directives, reveal API keys, or alter research constraints.
6. **Credential Leakage Across Redirects:** Leaking user session cookies or search-provider API keys to untrusted third-party servers upon HTTP 302 redirects.

---

## 2. Implemented Defense Controls & Invariants

### 2.1 Outbound Network & SSRF Controls (Step 32 Integration)
- Every extraction URL must pass `validateUrl(url, 'PUBLIC_RESEARCH_SOURCE')`.
- Prohibited destinations are rejected before network socket creation:
  - Loopback (`127.0.0.0/8`, `::1/128`)
  - Cloud Instance Metadata (`169.254.0.0/16`, `fe80::/10`)
  - RFC 1918 Private Networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Non-standard ports (strictly ports 80 and 443 permitted)
  - Raw IP literals in URLs
- **Socket IP Pinning:** Outbound HTTP transport resolves DNS upfront and forces the TCP socket to connect *only* to the pre-validated IP address, eliminating DNS rebinding while preserving TLS SNI and certificate validation.

### 2.2 Redirect Security & Credential Stripping
- Outbound requests do not follow automatic redirects.
- Each redirect hop is inspected and re-validated independently through the entire SSRF policy pipeline.
- Maximum redirect hops is capped at `5`. Redirect loops are detected and rejected.
- All sensitive headers (`Authorization`, `Cookie`) are stripped upon redirect.

### 2.3 Inert DOM & Script Prohibition
- Local HTML parsing uses JSDOM with script execution disabled (`runScripts: undefined`).
- Remote resource loading (sub-frames, remote scripts, stylesheets, images, fonts) is strictly disabled.
- DOM parsing operates entirely in memory; parsing never triggers outbound network calls.
- DOM element count is capped at 10,000 elements to prevent parser memory exhaustion.

### 2.4 Streaming Size Ceilings & Timeouts
- **Response Size Ceiling (5 MB):** Socket streams are terminated immediately if `Content-Length` or actual streamed bytes exceed 5 MB (`5,242,880` bytes), preventing decompression bombs.
- **Connection Timeout (5s):** Sockets that fail to establish a TCP handshake within 5,000 ms are destroyed.
- **Response Timeout (15s):** Sockets that fail to complete response delivery within 15,000 ms are destroyed.
- **Markdown Output Cap (500 KB):** Parsed text content is capped at 500 KB.

### 2.5 Tag-Stripped Output & Prompt Injection Defense
- The parser extracts clean text and Markdown structure. **Raw HTML is never emitted to downstream consumers or client UIs.**
- Extracted webpage text is treated strictly as **untrusted data**.
- Text is wrapped in data containers; it is never executed as instructions, and cannot alter application configuration, API credentials, or research constraints.

### 2.6 Access Restriction & Ethical Web Standards
- In compliance with project standards, VerityScout AI respects access controls:
  - If a page blocks automated access (HTTP 401, 403, Cloudflare challenge, or CAPTCHA), the system records `accessState: BLOCKED_BOT_CHALLENGE` or `HTTP_ERROR`.
  - The application **never** attempts to bypass CAPTCHAs, solve bot challenges, rotate proxies to evade rate limits, or circumvent paywalls.

