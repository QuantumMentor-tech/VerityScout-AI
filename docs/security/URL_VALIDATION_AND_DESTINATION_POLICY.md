# VerityScout AI — Safe URL Validation & Network Destination Policy Specification

**Document Identifier:** VS-SEC-URL-POLICY-v1.0  
**Status:** APPROVED SECURITY SPECIFICATION  
**Phase:** Phase 7 (Step 32 of 60)  
**Author:** Principal Security Architect, Network Security Engineer  
**Classification:** Server-Side Security Architecture  
**Traceability:** Mapped to [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md) (`SEC-011`, `SEC-012`, `SEC-013`) and [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-006`, `AC-006`).

---

## 1. Executive Summary & Purpose

VerityScout AI operates as an evidence-first research and product discovery engine. Its operation requires fetching untrusted web content from public search results, manufacturer product pages, retailer specifications, and benchmark databases, as well as communicating with trusted, hosted AI provider APIs (OpenAI, OpenRouter, NVIDIA NIM).

Interacting with external destinations introduces Server-Side Request Forgery (SSRF), DNS rebinding, internal network reconnaissance, cloud metadata exfiltration, and redirect escalation risks. 

This document defines the server-only network security architecture implemented in `src/server/security/` across:
1. `ip-classifier.ts`: RFC-compliant 128-bit IPv4/IPv6 classification and embedded IPv4 detection.
2. `destination-policy.ts`: Explicit decoupling of public research source policies and trusted provider policies.
3. `url-validator.ts`: WHATWG URL parsing, scheme checking, port restrictions, credential stripping, and IDN canonicalization.
4. `dns-resolver.ts`: Complete A/AAAA answer validation with fail-closed mixed-answer protection.
5. `safe-http-client.ts`: Secure HTTP/HTTPS transport with socket IP pinning (DNS-rebinding defense), manual redirect loop prevention, sensitive header stripping, streaming byte limits, and bounded connect/read timeouts.

---

## 2. Policy Decoupling: Public Sources vs. Trusted AI Providers

A primary vulnerability in outbound HTTP systems is applying a single permissive policy across heterogeneous network consumers. VerityScout AI strictly enforces two distinct destination policies:

| Security Parameter | `PUBLIC_RESEARCH_SOURCE_POLICY` | `TRUSTED_PROVIDER_POLICY` |
|---|---|---|
| **Primary Consumer** | Step 33 Search Adapters, Step 34 HTML/JSON Extractors | Step 28 OpenAI, Step 29 OpenRouter, Step 30 NVIDIA NIM |
| **Allowed Schemes** | `http:`, `https:` | Strictly `https:` (HTTP downgrade forbidden) |
| **Allowed Ports** | Standard ports `80` (HTTP), `443` (HTTPS) only | Port `443` only |
| **Allowed Hostnames** | Any valid public FQDN (resolving to public IPs) | Strict allowlist: `api.openai.com`, `openrouter.ai`, `integrate.api.nvidia.com` |
| **IP Literals in URL** | Strictly forbidden | Strictly forbidden |
| **Allowed HTTP Methods** | `GET`, `HEAD` | `GET`, `POST` |
| **Max Redirects** | Bounded ceiling of `5` hops | Strictly `0` (automatic redirects disabled) |
| **Max Response Size** | 5 MB (`5,242,880` bytes) streaming ceiling | 10 MB (`10,485,760` bytes) |
| **Connect Timeout** | `5,000` ms (5 seconds) | Configured by provider adapter (10,000 ms) |
| **Response Timeout** | `15,000` ms (15 seconds) | Configured by provider adapter (30,000 ms) |
| **TLS Certificate Check**| Strict validation (SNI preserved) | Strict validation (SNI preserved) |

---

## 3. URL Parsing & Canonicalization Rules

Untrusted destination strings must pass WHATWG-compliant URL validation before any network resolution occurs:

1. **Protocol Whitelisting:** Only `http:` and `https:` schemes are accepted. Schemes such as `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`, `ws:`, `wss:`, and `vbscript:` are immediately rejected.
2. **Rejection of Embedded Credentials:** Any URL containing userinfo (e.g., `https://user:pass@host/`) is rejected to prevent credential confusion and obfuscation.
3. **Rejection of Relative / Protocol-Relative URLs:** Inputs starting with `/` or `//` without an explicit, approved scheme are rejected.
4. **Canonicalization & IDN Support:**
   - Trailing dots are stripped canonically (e.g., `example.com.` $\to$ `example.com`).
   - Internationalized Domain Names (IDN) are normalized to ASCII Punycode via standard WHATWG domain serialization.
   - Hostnames are forced to lowercase.
5. **Direct IP Literal Rejection:** URLs using raw IP addresses as hostnames (e.g. `http://127.0.0.1/`, `http://[::1]/`, `http://169.254.169.254/`) are rejected outright for public sources.

---

## 4. IP Address Classification & Prohibited Ranges

IP validation is performed using 128-bit `BigInt` math to ensure mathematical precision without 32-bit integer overflow bugs.

### 4.1 Prohibited IPv4 Ranges
- `0.0.0.0/8` — Current network / this host (RFC 1122)
- `10.0.0.0/8` — Private-Use network (RFC 1918)
- `100.64.0.0/10` — Shared Address Space / CGNAT (RFC 6598)
- `127.0.0.0/8` — Loopback network (RFC 1122)
- `169.254.0.0/16` — Link-Local & Cloud Metadata (RFC 3927)
- `172.16.0.0/12` — Private-Use network (RFC 1918)
- `192.0.0.0/24` — IETF Protocol Assignments (RFC 6890)
- `192.0.2.0/24` — Documentation TEST-NET-1 (RFC 5737)
- `192.88.99.0/24` — 6to4 Relay Anycast (RFC 3068 / RFC 7526)
- `192.168.0.0/16` — Private-Use network (RFC 1918)
- `198.18.0.0/15` — Benchmarking network (RFC 2544)
- `198.51.100.0/24` — Documentation TEST-NET-2 (RFC 5737)
- `203.0.113.0/24` — Documentation TEST-NET-3 (RFC 5737)
- `224.0.0.0/4` — Multicast network (RFC 5771)
- `240.0.0.0/4` — Reserved for future use (RFC 1112)
- `255.255.255.255/32` — Limited broadcast (RFC 919)

### 4.2 Prohibited IPv6 Ranges
- `::/128` — Unspecified address (RFC 4291)
- `::1/128` — Loopback address (RFC 4291)
- `100::/64` — Discard-only prefix (RFC 6666)
- `2001:db8::/32` — Documentation network (RFC 3849)
- `fc00::/7` — Unique Local Address / ULA (RFC 4193)
- `fe80::/10` — Link-Local unicast (RFC 4291)
- `ff00::/8` — Multicast address (RFC 4291)
- Any address with an RFC 4007 scoped zone index (e.g. `%eth0`).

### 4.3 Embedded IPv4 Transposition & Evasion Defense
Attackers often attempt to circumvent IPv4 blocklists by disguising private IPv4 addresses within IPv6 addresses. VerityScout AI extracts and verifies embedded IPv4 addresses in:
1. **IPv4-Mapped IPv6 (`::ffff:0:0/96`):** The lower 32 bits are extracted and checked against all prohibited IPv4 ranges.
2. **6to4 Prefix (`2002::/16`):** Bits 16..47 containing the encapsulated IPv4 address are extracted and classified.
3. **NAT64 Well-Known Prefix (`64:ff9b::/96`):** The lower 32 bits are extracted and checked against all prohibited IPv4 ranges.

---

## 5. DNS Resolution & Rebinding Defense

### 5.1 Fail-Closed Mixed-Answer Protection
Attackers may configure authoritative DNS servers to return both a legitimate public IP and an internal address (e.g., `127.0.0.1` or `169.254.169.254`). If a client application validates only the first record but the operating system socket layer connects to another, the SSRF check is bypassed.

**Defense Rule:** `resolveAndValidateDns` queries all `A` and `AAAA` records. If **ANY** returned address belongs to a prohibited range, the entire resolution is rejected (`PROHIBITED_DESTINATION`).

### 5.2 Connection-Level Socket Pinning (DNS Rebinding Immunity)
In a Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding attack, an attacker's DNS server returns a valid public IP during validation (TTL = 0), and then immediately returns `127.0.0.1` when the HTTP client initiates its socket connection.

**Defense Mechanism:**
`safeFetch` decouples the logical TLS hostname from the physical transport connection:
1. DNS resolution and classification occur upfront.
2. A custom `http.Agent` / `https.Agent` is instantiated for the request with a custom `lookup` function that returns *only* the pre-validated IP address to the TCP socket layer.
3. Node's TLS layer continues to use the logical `hostname` for the Server Name Indication (SNI) extension and X.509 certificate validation.
4. Result: The socket connects directly to the validated IP, immune to DNS rebinding, while full cryptographic certificate verification is preserved.

---

## 6. Redirect Handling & Security Guardrails

Untrusted servers routinely use HTTP 3xx redirects to pivot inbound requests to internal resources or to steal credentials.

`safeFetch` handles redirects manually (`maxRedirects: 5` for public sources, `0` for trusted providers):
1. **Loop Detection:** A `Set<string>` tracks all visited canonical URLs. If a target URL has already been visited, a `REDIRECT_LOOP` error is raised.
2. **Independent Validation:** Every redirect `Location` header is parsed and re-validated through the entire validation pipeline (WHATWG parsing $\to$ Policy check $\to$ DNS resolution $\to$ IP classification).
3. **Relative URL Resolution:** Relative redirects (e.g., `/search?q=1`) are resolved against the current hop's canonical base URL.
4. **Credential Stripping:** Any sensitive headers (`Authorization`, `Cookie`) present on the initial request are permanently stripped upon the first redirect hop.

---

## 7. Transport Limits & Resource Protection

To guard against Denial of Service (DoS), slowloris, and resource exhaustion:
1. **Streaming Size Limit (5 MB):** Responses are metered as chunks arrive. If the `Content-Length` header declares $>5$ MB or if cumulative chunks exceed 5 MB, the socket is immediately destroyed with `RESPONSE_SIZE_EXCEEDED`.
2. **Connect Timeout (5 seconds):** Sockets that do not complete the TCP handshake and TLS negotiation within 5,000 ms are destroyed with a `TIMEOUT` error.
3. **Response Timeout (15 seconds):** Streams that do not finish emitting data within 15,000 ms are aborted.
4. **Caller Cancellation:** The client accepts standard `AbortSignal` instances and tears down sockets immediately upon cancellation.

