import { describe, it, expect, vi, afterEach } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import {
  classifyIpAddress,
  classifyIpv4Address,
  classifyIpv6Address,
} from '@/server/security/ip-classifier';
import {
  validateUrl,
} from '@/server/security/url-validator';
import {
  resolveAndValidateDns,
} from '@/server/security/dns-resolver';
import {
  safeFetch,
  SafeHttpError,
} from '@/server/security/safe-http-client';
import {
  PUBLIC_RESEARCH_SOURCE_POLICY,
  TRUSTED_PROVIDER_POLICY,
} from '@/server/security/destination-policy';

describe('Step 32: Safe URL Validation, SSRF Prevention & Network Destination Controls', () => {
  describe('1. Comprehensive IP Address Classification (RFC Standards)', () => {
    describe('IPv4 Address Classification', () => {
      it('classifies public IPv4 addresses as public', () => {
        expect(classifyIpAddress('93.184.216.34').isPublic).toBe(true);
        expect(classifyIpAddress('8.8.8.8').isPublic).toBe(true);
        expect(classifyIpAddress('1.1.1.1').isPublic).toBe(true);
        expect(classifyIpAddress('142.250.190.46').isPublic).toBe(true);
      });

      it('blocks IPv4 Loopback addresses (127.0.0.0/8, RFC 1122)', () => {
        const loopbacks = ['127.0.0.1', '127.0.0.2', '127.1.2.3', '127.255.255.255'];
        for (const ip of loopbacks) {
          const res = classifyIpAddress(ip);
          expect(res.isPublic).toBe(false);
          expect(res.category).toContain('Loopback');
        }
      });

      it('blocks IPv4 Current/This Network (0.0.0.0/8, RFC 1122)', () => {
        expect(classifyIpAddress('0.0.0.0').isPublic).toBe(false);
        expect(classifyIpAddress('0.1.2.3').isPublic).toBe(false);
      });

      it('blocks IPv4 Private-Use Networks (RFC 1918)', () => {
        // 10.0.0.0/8
        expect(classifyIpAddress('10.0.0.1').isPublic).toBe(false);
        expect(classifyIpAddress('10.255.255.255').isPublic).toBe(false);

        // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
        expect(classifyIpAddress('172.16.0.1').isPublic).toBe(false);
        expect(classifyIpAddress('172.20.10.5').isPublic).toBe(false);
        expect(classifyIpAddress('172.31.255.255').isPublic).toBe(false);
        // 172.32.0.1 is public
        expect(classifyIpAddress('172.32.0.1').isPublic).toBe(true);

        // 192.168.0.0/16
        expect(classifyIpAddress('192.168.0.1').isPublic).toBe(false);
        expect(classifyIpAddress('192.168.1.1').isPublic).toBe(false);
        expect(classifyIpAddress('192.168.254.254').isPublic).toBe(false);
      });

      it('blocks IPv4 Link-Local & Cloud Metadata Services (169.254.0.0/16, RFC 3927)', () => {
        expect(classifyIpAddress('169.254.169.254').isPublic).toBe(false);
        expect(classifyIpAddress('169.254.1.1').isPublic).toBe(false);
        expect(classifyIpAddress('169.254.254.254').isPublic).toBe(false);
      });

      it('blocks IPv4 Shared Address Space / CGNAT (100.64.0.0/10, RFC 6598)', () => {
        expect(classifyIpAddress('100.64.0.1').isPublic).toBe(false);
        expect(classifyIpAddress('100.127.255.255').isPublic).toBe(false);
        // 100.128.0.1 is public
        expect(classifyIpAddress('100.128.0.1').isPublic).toBe(true);
      });

      it('blocks Documentation & Benchmarking ranges (RFC 5737 & RFC 2544)', () => {
        expect(classifyIpAddress('192.0.2.1').isPublic).toBe(false); // TEST-NET-1
        expect(classifyIpAddress('198.51.100.1').isPublic).toBe(false); // TEST-NET-2
        expect(classifyIpAddress('203.0.113.1').isPublic).toBe(false); // TEST-NET-3
        expect(classifyIpAddress('198.18.0.1').isPublic).toBe(false); // Benchmarking
        expect(classifyIpAddress('198.19.255.255').isPublic).toBe(false);
      });

      it('blocks Multicast, Reserved, and Broadcast (RFC 5771, 1112, 919)', () => {
        expect(classifyIpAddress('224.0.0.1').isPublic).toBe(false); // Multicast
        expect(classifyIpAddress('239.255.255.255').isPublic).toBe(false);
        expect(classifyIpAddress('240.0.0.1').isPublic).toBe(false); // Reserved
        expect(classifyIpAddress('255.255.255.255').isPublic).toBe(false); // Broadcast
      });

      it('rejects malformed IPv4 strings safely', () => {
        expect(classifyIpv4Address('256.1.1.1').isPublic).toBe(false);
        expect(classifyIpv4Address('1.2.3').isPublic).toBe(false);
        expect(classifyIpv4Address('abc.def.ghi.jkl').isPublic).toBe(false);
      });
    });

    describe('IPv6 Address Classification', () => {
      it('classifies public IPv6 addresses as public', () => {
        expect(classifyIpAddress('2606:4700:4700::1111').isPublic).toBe(true);
        expect(classifyIpAddress('2001:4860:4860::8888').isPublic).toBe(true);
      });

      it('blocks IPv6 Loopback (::1/128) and Unspecified (::/128)', () => {
        expect(classifyIpAddress('::1').isPublic).toBe(false);
        expect(classifyIpAddress('0:0:0:0:0:0:0:1').isPublic).toBe(false);
        expect(classifyIpAddress('::').isPublic).toBe(false);
        expect(classifyIpAddress('0:0:0:0:0:0:0:0').isPublic).toBe(false);
      });

      it('blocks IPv6 Unique Local Addresses (fc00::/7, RFC 4193)', () => {
        expect(classifyIpAddress('fc00::1').isPublic).toBe(false);
        expect(classifyIpAddress('fd12:3456:789a:1::1').isPublic).toBe(false);
      });

      it('blocks IPv6 Link-Local Unicast (fe80::/10, RFC 4291)', () => {
        expect(classifyIpAddress('fe80::1').isPublic).toBe(false);
        expect(classifyIpAddress('febf:ffff:ffff:ffff::1').isPublic).toBe(false);
      });

      it('blocks IPv6 Multicast (ff00::/8, RFC 4291)', () => {
        expect(classifyIpAddress('ff02::1').isPublic).toBe(false);
        expect(classifyIpAddress('ff01::1').isPublic).toBe(false);
      });

      it('blocks IPv6 Documentation (2001:db8::/32, RFC 3849)', () => {
        expect(classifyIpAddress('2001:db8::1').isPublic).toBe(false);
        expect(classifyIpAddress('2001:0db8:85a3::8a2e:370:7334').isPublic).toBe(false);
      });

      it('blocks Scoped IPv6 addresses with zone identifiers', () => {
        const res = classifyIpv6Address('fe80::1%eth0');
        expect(res.isPublic).toBe(false);
        expect(res.category).toBe('SCOPED_IPV6');
      });

      it('detects and blocks IPv4-mapped IPv6 embedding private/prohibited addresses (::ffff:0:0/96)', () => {
        // Embedded 127.0.0.1
        const loopbackMapped = classifyIpAddress('::ffff:127.0.0.1');
        expect(loopbackMapped.isPublic).toBe(false);
        expect(loopbackMapped.embeddedIpv4).toBe('127.0.0.1');
        expect(loopbackMapped.category).toContain('Loopback');

        // Embedded 169.254.169.254 (Cloud metadata)
        const metadataMapped = classifyIpAddress('::ffff:169.254.169.254');
        expect(metadataMapped.isPublic).toBe(false);
        expect(metadataMapped.embeddedIpv4).toBe('169.254.169.254');

        // Embedded 192.168.1.1 (Private RFC 1918)
        const privateMapped = classifyIpAddress('::ffff:192.168.1.1');
        expect(privateMapped.isPublic).toBe(false);
        expect(privateMapped.embeddedIpv4).toBe('192.168.1.1');

        // Embedded public IPv4 (93.184.216.34)
        const publicMapped = classifyIpAddress('::ffff:93.184.216.34');
        expect(publicMapped.isPublic).toBe(true);
        expect(publicMapped.embeddedIpv4).toBe('93.184.216.34');
      });

      it('detects and blocks 6to4 encapsulation embedding private IPv4 (2002::/16)', () => {
        // 2002:7f00:0001:: encodes 127.0.0.1 (0x7f000001)
        const res = classifyIpAddress('2002:7f00:0001::');
        expect(res.isPublic).toBe(false);
        expect(res.embeddedIpv4).toBe('127.0.0.1');
      });

      it('detects and blocks NAT64 embedding private IPv4 (64:ff9b::/96)', () => {
        // 64:ff9b::7f00:0001 encodes 127.0.0.1
        const res = classifyIpAddress('64:ff9b::7f00:0001');
        expect(res.isPublic).toBe(false);
        expect(res.embeddedIpv4).toBe('127.0.0.1');
      });
    });
  });

  describe('2. Standards-Compliant URL Parsing & Canonicalization', () => {
    it('accepts valid absolute HTTP and HTTPS URLs for public research sources', () => {
      const httpRes = validateUrl('http://example.com/research?q=test');
      expect(httpRes.isValid).toBe(true);
      if (httpRes.isValid) {
        expect(httpRes.protocol).toBe('http:');
        expect(httpRes.port).toBe(80);
        expect(httpRes.hostname).toBe('example.com');
      }

      const httpsRes = validateUrl('https://example.com:443/article');
      expect(httpsRes.isValid).toBe(true);
      if (httpsRes.isValid) {
        expect(httpsRes.protocol).toBe('https:');
        expect(httpsRes.port).toBe(443);
      }
    });

    it('rejects empty, null, or whitespace-only inputs', () => {
      expect(validateUrl(null).isValid).toBe(false);
      expect(validateUrl(undefined).isValid).toBe(false);
      expect(validateUrl('').isValid).toBe(false);
      expect(validateUrl('   ').isValid).toBe(false);
    });

    it('rejects protocol-relative URLs (e.g. //example.com)', () => {
      const res = validateUrl('//example.com/path');
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('PROTOCOL_RELATIVE_URL');
      }
    });

    it('rejects relative URLs without an absolute base', () => {
      expect(validateUrl('/relative/path').isValid).toBe(false);
      expect(validateUrl('article.html').isValid).toBe(false);
    });

    it('rejects prohibited or dangerous URL schemes', () => {
      const dangerousSchemes = [
        'file:///etc/passwd',
        'file://localhost/C:/Windows/win.ini',
        'data:text/html,<html>alert(1)</html>',
        'javascript:alert(1)',
        'ftp://ftp.example.com/file.txt',
        'gopher://gopher.floodgap.com/',
        'ws://chat.example.com/',
        'wss://secure.example.com/',
        'blob:https://example.com/1234-5678',
      ];

      for (const url of dangerousSchemes) {
        const res = validateUrl(url);
        expect(res.isValid).toBe(false);
        if (!res.isValid) {
          expect(res.code).toBe('UNSUPPORTED_PROTOCOL');
        }
      }
    });

    it('rejects URLs containing embedded user credentials', () => {
      const credentialUrls = [
        'https://user:password@example.com/resource',
        'http://admin@example.com/',
        'https://token:@example.com/api',
      ];

      for (const url of credentialUrls) {
        const res = validateUrl(url);
        expect(res.isValid).toBe(false);
        if (!res.isValid) {
          expect(res.code).toBe('URL_CONTAINS_CREDENTIALS');
        }
      }
    });

    it('normalizes internationalized domain names (IDN / Punycode)', () => {
      // WHATWG URL parser normalizes München to Punycode
      const res = validateUrl('https://münchen.de/news');
      expect(res.isValid).toBe(true);
      if (res.isValid) {
        expect(res.canonicalUrl).toContain('xn--mnchen-3ya.de');
      }
    });

    it('normalizes trailing-dot hostnames canonically', () => {
      const res = validateUrl('https://example.com./path');
      expect(res.isValid).toBe(true);
      if (res.isValid) {
        expect(res.hostname).toBe('example.com');
      }
    });

    it('rejects nonstandard ports for public research sources (standard ports 80/443 only)', () => {
      const badPorts = [22, 25, 8080, 8443, 3000, 5432, 6379, 2375];
      for (const port of badPorts) {
        const res = validateUrl(`https://example.com:${port}/resource`);
        expect(res.isValid).toBe(false);
        if (!res.isValid) {
          expect(res.code).toBe('PROHIBITED_PORT');
        }
      }
    });

    it('rejects public URLs that use private IP literals directly', () => {
      const privateUrls = [
        'http://127.0.0.1/admin',
        'http://10.0.0.5/api',
        'http://192.168.1.1/router',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/status',
        'http://[fc00::1]/internal',
        'http://[::ffff:127.0.0.1]/test',
      ];

      for (const url of privateUrls) {
        const res = validateUrl(url);
        expect(res.isValid).toBe(false);
        if (!res.isValid) {
          expect(res.code).toBe('PROHIBITED_IP_DESTINATION');
        }
      }
    });
  });

  describe('3. Trusted AI Provider Policy Separation', () => {
    it('approves exact hosted origins for OpenAI, OpenRouter, and NVIDIA NIM', () => {
      const openai = validateUrl('https://api.openai.com/v1/chat/completions', 'TRUSTED_PROVIDER');
      expect(openai.isValid).toBe(true);

      const openrouter = validateUrl('https://openrouter.ai/api/v1/auth/key', 'TRUSTED_PROVIDER');
      expect(openrouter.isValid).toBe(true);

      const nim = validateUrl('https://integrate.api.nvidia.com/v1/chat/completions', 'TRUSTED_PROVIDER');
      expect(nim.isValid).toBe(true);
    });

    it('strictly prohibits HTTP downgrade for AI providers (HTTPS required)', () => {
      const res = validateUrl('http://api.openai.com/v1/models', 'TRUSTED_PROVIDER');
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('HTTP_DOWNGRADE_PROHIBITED');
      }
    });

    it('rejects unapproved hostnames for AI providers', () => {
      const res = validateUrl('https://evil-ai.example.com/v1', 'TRUSTED_PROVIDER');
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('UNAPPROVED_PROVIDER_HOST');
      }
    });

    it('rejects hostname suffix attacks disguised as approved providers', () => {
      const attacks = [
        'https://api.openai.com.attacker.com/v1',
        'https://openrouter.ai.phishing.org/key',
        'https://integrate.api.nvidia.com.fake.net/v1',
      ];

      for (const url of attacks) {
        const res = validateUrl(url, 'TRUSTED_PROVIDER');
        expect(res.isValid).toBe(false);
        if (!res.isValid) {
          expect(res.code).toBe('UNAPPROVED_PROVIDER_HOST');
        }
      }
    });

    it('strictly prohibits non-443 ports for AI providers', () => {
      const res = validateUrl('https://api.openai.com:8443/v1', 'TRUSTED_PROVIDER');
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('PROHIBITED_PORT');
      }
    });
  });

  describe('4. DNS Resolution & Mixed-Answer Protection', () => {
    it('accepts hostname resolving to eligible public IP addresses', async () => {
      const mockLookup = vi.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ]);

      const res = await resolveAndValidateDns('example.com', { lookupFn: mockLookup });
      expect(res.isValid).toBe(true);
      if (res.isValid) {
        expect(res.selectedIp).toBe('93.184.216.34');
        expect(res.addresses).toHaveLength(2);
      }
    });

    it('fails closed when DNS answer contains ANY private or loopback IP (mixed-answer attack)', async () => {
      const mixedLookup = vi.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 }, // public
        { address: '127.0.0.1', family: 4 }, // private loopback!
      ]);

      const res = await resolveAndValidateDns('attacker.example.com', { lookupFn: mixedLookup });
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('DNS_ANSWER_PROHIBITED');
        expect(res.prohibitedAddress).toBe('127.0.0.1');
      }
    });

    it('fails closed when DNS answer resolves to cloud metadata IP (169.254.169.254)', async () => {
      const metadataLookup = vi.fn().mockResolvedValue([
        { address: '169.254.169.254', family: 4 },
      ]);

      const res = await resolveAndValidateDns('metadata.local', { lookupFn: metadataLookup });
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('DNS_ANSWER_PROHIBITED');
      }
    });

    it('handles empty DNS response safely', async () => {
      const emptyLookup = vi.fn().mockResolvedValue([]);
      const res = await resolveAndValidateDns('nonexistent.example.com', { lookupFn: emptyLookup });
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('DNS_RESOLUTION_EMPTY');
      }
    });

    it('handles DNS resolution failure safely without leaking internal diagnostics', async () => {
      const errorLookup = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
      const res = await resolveAndValidateDns('broken.example.com', { lookupFn: errorLookup });
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('DNS_RESOLUTION_FAILED');
        expect(res.error).toContain('broken.example.com');
      }
    });
  });

  describe('5. Controlled Redirect Handling & Loop Protection', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function mockHttpsRequest(
      handler: (options: any) => { statusCode: number; headers: Record<string, string>; body?: string }
    ) {
      return vi.spyOn(https, 'request').mockImplementation((options: any, callback?: any) => {
        const resData = handler(options);
        const reqEmitter = new EventEmitter() as any;
        reqEmitter.write = vi.fn();
        reqEmitter.end = vi.fn();
        reqEmitter.destroy = vi.fn();

        const resEmitter = new EventEmitter() as any;
        resEmitter.statusCode = resData.statusCode;
        resEmitter.statusMessage = 'Redirect';
        resEmitter.headers = resData.headers;

        setImmediate(() => {
          if (callback) callback(resEmitter);
          if (resData.body) {
            resEmitter.emit('data', Buffer.from(resData.body));
          }
          resEmitter.emit('end');
        });

        return reqEmitter;
      });
    }

    it('rejects redirect to a private or loopback IP', async () => {
      // Mock DNS: public.example.com -> 93.184.216.34; internal.corp -> 127.0.0.1
      const mockDns = vi.fn().mockImplementation(async (host: string) => {
        if (host === 'public.example.com') {
          return [{ address: '93.184.216.34', family: 4 }];
        }
        return [{ address: '127.0.0.1', family: 4 }];
      });

      mockHttpsRequest(() => ({
        statusCode: 302,
        headers: { location: 'https://internal.corp/admin' },
      }));

      await expect(
        safeFetch('https://public.example.com/login', {
          dnsLookupFn: mockDns,
        })
      ).rejects.toThrow(/PROHIBITED_DESTINATION|Destination DNS validation failed/);
    });

    it('rejects direct redirect to an IP literal loopback', async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      mockHttpsRequest(() => ({
        statusCode: 302,
        headers: { location: 'http://127.0.0.1:80/status' },
      }));

      await expect(
        safeFetch('https://public.example.com/redirect-to-ip', {
          dnsLookupFn: mockDns,
        })
      ).rejects.toThrow(/INVALID_URL|Loopback/);
    });

    it('rejects redirect loops before exceeding call stack', async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      mockHttpsRequest((options) => {
        if (options.path === '/loop-a') {
          return { statusCode: 302, headers: { location: '/loop-b' } };
        }
        return { statusCode: 302, headers: { location: '/loop-a' } };
      });

      await expect(
        safeFetch('https://public.example.com/loop-a', {
          dnsLookupFn: mockDns,
        })
      ).rejects.toThrow(/REDIRECT_LOOP|Detected redirect loop/);
    });

    it('rejects when redirect count exceeds safety limit (>5)', async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
      let hopCounter = 0;

      mockHttpsRequest(() => {
        hopCounter++;
        return {
          statusCode: 302,
          headers: { location: `https://public.example.com/step-${hopCounter}` },
        };
      });

      await expect(
        safeFetch('https://public.example.com/step-0', {
          dnsLookupFn: mockDns,
          maxRedirects: 5,
        })
      ).rejects.toThrow(/EXCESSIVE_REDIRECTS|Exceeded maximum allowed redirect hops/);
    });

    it('strips Authorization and Cookie headers across redirects', async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
      const interceptedHeaders: Record<string, string>[] = [];

      mockHttpsRequest((options) => {
        interceptedHeaders.push({ ...options.headers });
        if (options.path === '/login') {
          return { statusCode: 302, headers: { location: 'https://public.example.com/dashboard' } };
        }
        return { statusCode: 200, headers: { 'content-type': 'text/plain' }, body: 'Welcome' };
      });

      const response = await safeFetch('https://public.example.com/login', {
        dnsLookupFn: mockDns,
        headers: {
          Authorization: 'Bearer sensitive-token-123',
          Cookie: 'session=secret-session-abc',
        },
      });

      expect(response.status).toBe(200);
      expect(interceptedHeaders).toHaveLength(2);
      // Hop 1 should contain credentials
      expect(interceptedHeaders[0]?.Authorization || interceptedHeaders[0]?.authorization).toBeDefined();
      // Hop 2 must NOT contain credentials
      expect(interceptedHeaders[1]?.Authorization).toBeUndefined();
      expect(interceptedHeaders[1]?.authorization).toBeUndefined();
      expect(interceptedHeaders[1]?.Cookie).toBeUndefined();
      expect(interceptedHeaders[1]?.cookie).toBeUndefined();
    });

    it('strictly disables automatic redirects for trusted provider requests (maxRedirects: 0)', async () => {
      expect(TRUSTED_PROVIDER_POLICY.maxRedirects).toBe(0);

      const mockDns = vi.fn().mockResolvedValue([{ address: '104.18.7.192', family: 4 }]);

      mockHttpsRequest(() => ({
        statusCode: 308,
        headers: { location: 'https://attacker.com/steal-key' },
      }));

      // When trusted provider returns a redirect, safeFetch must return the 308 response without following
      const res = await safeFetch('https://api.openai.com/v1/chat/completions', {
        policy: 'TRUSTED_PROVIDER',
        method: 'POST',
        dnsLookupFn: mockDns,
      });

      expect(res.status).toBe(308);
      expect(res.redirectChain).toHaveLength(0);
    });
  });

  describe('6. Safe HTTP Client Limits & Transport Security', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('rejects unsupported HTTP methods for public research sources', async () => {
      await expect(
        safeFetch('https://example.com', {
          method: 'POST',
        })
      ).rejects.toThrow(/HTTP method "POST" is prohibited/);
    });

    it('aborts immediately when caller signal is already cancelled', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        safeFetch('https://example.com', {
          signal: controller.signal,
        })
      ).rejects.toThrow(/cancelled by caller/);
    });

    it('aborts during response transmission when maxResponseBytes is exceeded', async () => {
      const mockDns = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      vi.spyOn(https, 'request').mockImplementation((_options: any, callback?: any) => {
        const reqEmitter = new EventEmitter() as any;
        reqEmitter.write = vi.fn();
        reqEmitter.end = vi.fn();
        reqEmitter.destroy = vi.fn();

        const resEmitter = new EventEmitter() as any;
        resEmitter.statusCode = 200;
        resEmitter.headers = { 'content-length': '10000000' }; // 10MB declared
        resEmitter.destroy = vi.fn();

        setImmediate(() => {
          if (callback) callback(resEmitter);
        });

        return reqEmitter;
      });

      await expect(
        safeFetch('https://public.example.com/large-file', {
          dnsLookupFn: mockDns,
          maxResponseBytes: 1024, // 1KB ceiling
        })
      ).rejects.toThrow(/RESPONSE_SIZE_EXCEEDED|Declared response size/);
    });

    it('normalizes transport error without leaking internal credentials', () => {
      const err = new SafeHttpError('TRANSPORT_ERROR', 'Connection failed cleanly');
      expect(err.name).toBe('SafeHttpError');
      expect(err.code).toBe('TRANSPORT_ERROR');
    });

    it('enforces 5MB ceiling on public research sources', () => {
      expect(PUBLIC_RESEARCH_SOURCE_POLICY.maxResponseBytes).toBe(5 * 1024 * 1024);
    });

    it('enforces 5s connection and 15s response timeouts on public research sources', () => {
      expect(PUBLIC_RESEARCH_SOURCE_POLICY.connectTimeoutMs).toBe(5000);
      expect(PUBLIC_RESEARCH_SOURCE_POLICY.responseTimeoutMs).toBe(15000);
    });
  });
});
