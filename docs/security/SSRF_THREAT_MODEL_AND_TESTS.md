# VerityScout AI — SSRF Threat Model & Security Test Verification

**Document Identifier:** VS-SEC-SSRF-THREAT-v1.0  
**Status:** APPROVED SECURITY SPECIFICATION  
**Phase:** Phase 7 (Step 32 of 60)  
**Author:** Application Security Architect, Penetration Testing Lead  
**Classification:** Threat Modeling & Security Assurance  
**Traceability:** Mapped to [SECURITY_REQUIREMENTS.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/security/SECURITY_REQUIREMENTS.md) (`SEC-011`, `SEC-012`, `SEC-013`) and [IMPLEMENTATION_TRACEABILITY.md](file:///e:/Projects/All%20working%20projects/Website%20Working%20Projects/VerityScout%20AI%20WEB%20(working)/docs/architecture/IMPLEMENTATION_TRACEABILITY.md) (`UR-006`, `AC-006`).

---

## 1. Executive Summary

As an evidence-based search and synthesis engine, VerityScout AI accepts user-supplied query plans, searches external indexes, and fetches candidate product specifications from public internet sources. Whenever a server-side process initiates outbound HTTP requests based on external input, it is susceptible to **Server-Side Request Forgery (SSRF)**.

This threat model outlines the attack surfaces, threat vectors, defense-in-depth mitigations, and automated test validations implemented in Step 32 (`src/server/security/` and `tests/unit/safe-url-validator.test.ts`).

---

## 2. SSRF Attack Vectors & Implemented Mitigations

### 2.1 Threat Vector 1: Loopback & Local Inter-Process Communication
- **Attack Description:** An attacker inputs URLs pointing to loopback addresses (`127.0.0.1`, `localhost`, `[::1]`, `0.0.0.0`) to access locally hosted administrative services, internal databases (PostgreSQL on port 5432, Redis on 6379), or debugging ports.
- **Implemented Mitigation:**
  - `classifyIpAddress` verifies IP against `127.0.0.0/8` (RFC 1122), `0.0.0.0/8`, and `::1/128` (RFC 4291).
  - `validateUrl` rejects raw IP literals and localhost hostnames.
  - Sockets attempting to bind to loopback IPs are blocked prior to connection.
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Tests: `blocks IPv4 Loopback addresses`, `blocks IPv6 Loopback`, `rejects public URLs that use private IP literals directly`).

### 2.2 Threat Vector 2: Cloud Instance Metadata Service (IMDS) Exfiltration
- **Attack Description:** In cloud environments (AWS, GCP, Azure, DigitalOcean), instance metadata services reside at link-local address `169.254.169.254` or `[fe80::1]`. Attackers use SSRF to extract IAM instance credentials, VPC configurations, and startup secrets.
- **Implemented Mitigation:**
  - Explicit classification of `169.254.0.0/16` (RFC 3927) and `fe80::/10` (RFC 4291) as prohibited.
  - Fail-closed DNS rejection if any hostname resolves to `169.254.169.254`.
  - Fixed standard port enforcement (80/443 only).
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Tests: `blocks IPv4 Link-Local & Cloud Metadata Services`, `fails closed when DNS answer resolves to cloud metadata IP`).

### 2.3 Threat Vector 3: Private Corporate Intranet (RFC 1918 & RFC 4193) Probing
- **Attack Description:** Attackers submit intranet URLs (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`) to map internal topology, probe internal microservices, or exploit unauthenticated internal endpoints.
- **Implemented Mitigation:**
  - RFC 1918 and RFC 4193 CIDR blocks are flagged as prohibited.
  - Port restrictions block non-standard ports (e.g. 8080, 8443, 9000, 3000).
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Tests: `blocks IPv4 Private-Use Networks`, `blocks IPv6 Unique Local Addresses`, `rejects nonstandard ports for public research sources`).

### 2.4 Threat Vector 4: IPv6 Transposition & Evasion (IPv4-Mapped, 6to4, NAT64)
- **Attack Description:** Attackers circumvent naive IPv4 regexes by encoding private IPv4 addresses inside IPv6 representations (e.g., `[::ffff:127.0.0.1]`, `[2002:7f00:1::]`, or `[64:ff9b::169.254.169.254]`).
- **Implemented Mitigation:**
  - `ip-classifier.ts` parses IPv6 addresses into 128-bit `BigInt` structures.
  - It detects IPv4-mapped (`::ffff:0:0/96`), 6to4 (`2002::/16`), and NAT64 (`64:ff9b::/96`) prefixes, extracts the embedded 32-bit IPv4 value, and validates it against all IPv4 rules.
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Tests: `detects and blocks IPv4-mapped IPv6 embedding private/prohibited addresses`, `detects and blocks 6to4 encapsulation`, `detects and blocks NAT64 embedding private IPv4`).

### 2.5 Threat Vector 5: Mixed-Answer DNS Exploitation
- **Attack Description:** An attacker registers a domain whose DNS server returns multiple `A` records (e.g., `93.184.216.34` AND `127.0.0.1`). If the security validator inspects only the first record, the operating system socket may connect to the second record.
- **Implemented Mitigation:**
  - `resolveAndValidateDns` inspects every address returned in both `A` and `AAAA` lookups.
  - If **ANY** address belongs to a prohibited range, the entire lookup is marked invalid.
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Test: `fails closed when DNS answer contains ANY private or loopback IP (mixed-answer attack)`).

### 2.6 Threat Vector 6: Time-of-Check to Time-of-Use (TOCTOU) DNS Rebinding
- **Attack Description:** The attacker sets DNS TTL to 0. During application validation, the domain resolves to a public IP. Immediately afterwards, when `http.request` resolves the domain, it resolves to `127.0.0.1`.
- **Implemented Mitigation:**
  - `safeFetch` creates an HTTP/HTTPS agent with a custom `lookup` function that forces the TCP socket to connect *only* to the pre-validated IP address.
  - TLS Server Name Indication (SNI) and certificate validation continue to use the logical `hostname`, preventing man-in-the-middle attacks while eliminating rebinding.
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Sections 4 & 5).

### 2.7 Threat Vector 7: Multi-Hop Redirect Pivoting & Credential Exfiltration
- **Attack Description:** An attacker hosts a public endpoint that immediately issues a `302 Found` with `Location: http://169.254.169.254/latest/meta-data/` or `Location: http://127.0.0.1/admin`. If redirects are followed automatically, the SSRF check on the initial URL is bypassed. Furthermore, headers like `Authorization` or `Cookie` may leak to untrusted third parties.
- **Implemented Mitigation:**
  - Automatic redirects are disabled in the client (`maxRedirects: 0` for AI providers, bounded manual loop with max 5 hops for public sources).
  - Each redirect URL is validated independently from scratch.
  - Sensitive headers (`Authorization`, `Cookie`) are stripped upon redirect.
  - Visited URLs are tracked in a `Set` to prevent circular redirect loops.
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Tests: `rejects redirect to a private or loopback IP`, `rejects redirect loops before exceeding call stack`, `rejects when redirect count exceeds safety limit`, `strips Authorization and Cookie headers across redirects`, `strictly disables automatic redirects for trusted provider requests`).

### 2.8 Threat Vector 8: Protocol Downgrade & Non-Standard Port Scanning
- **Attack Description:** Attackers use unusual ports (e.g., `:22`, `:25`, `:8080`) to conduct port scanning across the network, or downgrade secure HTTPS connections to plaintext HTTP.
- **Implemented Mitigation:**
  - For `PUBLIC_RESEARCH_SOURCE_POLICY`, only standard ports `80` and `443` are permitted.
  - For `TRUSTED_PROVIDER_POLICY`, only port `443` and scheme `https:` are permitted; HTTP downgrade is strictly prohibited.
- **Test Evidence:** `tests/unit/safe-url-validator.test.ts` (Tests: `rejects nonstandard ports for public research sources`, `strictly prohibits HTTP downgrade for AI providers`, `strictly prohibits non-443 ports for AI providers`).

---

## 3. Automated Test Verification Summary

The test suite in `tests/unit/safe-url-validator.test.ts` executes **51 automated unit tests** verifying each defense layer in isolation and in concert:

| Test Group | Test Count | Key Invariants Verified |
|---|---|---|
| **1. IPv4 Address Classification** | 9 | Loopback, RFC 1918, CGNAT, link-local, doc, multicast, broadcast, malformed. |
| **2. IPv6 Address Classification** | 10 | Loopback, unspecified, ULA, link-local, multicast, doc, zones, IPv4-mapped, 6to4, NAT64. |
| **3. URL Parsing & Canonicalization** | 10 | WHATWG compliance, scheme whitelist, userinfo rejection, IDN Punycode, port limits, IP literals. |
| **4. AI Provider Policy Separation** | 5 | OpenAI, OpenRouter, NVIDIA NIM origins, https-only, port 443, suffix attack prevention. |
| **5. DNS Resolution & Mixed Answers** | 5 | All-record verification, fail-closed mixed-answer protection, empty answers, resolution failures. |
| **6. Controlled Redirect Handling** | 6 | Loopback redirects, direct IP redirects, redirect loops, max redirect ceiling, credential stripping, provider zero-redirect enforcement. |
| **7. Transport Limits & Security** | 6 | Allowed methods, caller cancellation, streaming size abort (>5MB), timeout enforcement, error normalization. |
| **Total** | **51** | **All 51 tests pass with zero network calls and synthetic execution.** |

