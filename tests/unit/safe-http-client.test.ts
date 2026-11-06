import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  classifyIpAddress,
  resolveAndValidateDns,
  safeFetch,
  SafeHttpError,
  APPROVED_PROVIDER_HOSTS,
} from '@/server/security';

describe('Safe HTTP Transport & SSRF Boundary Unit Tests (Step 51 / Step 32)', () => {
  describe('URL Policy Validation Contract (validateUrl)', () => {
    it('accepts valid public HTTPS and HTTP URLs for public research sources', () => {
      const httpsResult = validateUrl('https://www.example.com/articles/research', 'PUBLIC_RESEARCH_SOURCE');
      expect(httpsResult.isValid).toBe(true);
      if (httpsResult.isValid) {
        expect(httpsResult.hostname).toBe('www.example.com');
        expect(httpsResult.port).toBe(443);
      }

      const httpResult = validateUrl('http://www.example.com/news', 'PUBLIC_RESEARCH_SOURCE');
      expect(httpResult.isValid).toBe(true);
      if (httpResult.isValid) {
        expect(httpResult.port).toBe(80);
      }
    });

    it('rejects protocol-relative URLs with PROTOCOL_RELATIVE_URL', () => {
      const result = validateUrl('//example.com/steal-token', 'PUBLIC_RESEARCH_SOURCE');
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.code).toBe('PROTOCOL_RELATIVE_URL');
      }
    });

    it('rejects unsupported protocols (ftp, file, javascript, data)', () => {
      const protocols = [
        'ftp://files.internal/secret.doc',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<h1>Hello</h1>',
      ];

      for (const url of protocols) {
        const result = validateUrl(url, 'PUBLIC_RESEARCH_SOURCE');
        expect(result.isValid).toBe(false);
        if (!result.isValid) {
          expect(result.code).toBe('UNSUPPORTED_PROTOCOL');
        }
      }
    });

    it('prohibits embedded credentials in URLs (URL_CONTAINS_CREDENTIALS)', () => {
      const result = validateUrl('https://admin:secretPassword123@example.com/dashboard', 'PUBLIC_RESEARCH_SOURCE');
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.code).toBe('URL_CONTAINS_CREDENTIALS');
      }
    });

    it('prohibits non-standard ports (8080, 8443, 3000) for research sources', () => {
      const ports = [8080, 8443, 3000, 22, 6379];
      for (const port of ports) {
        const result = validateUrl(`https://example.com:${port}/page`, 'PUBLIC_RESEARCH_SOURCE');
        expect(result.isValid).toBe(false);
        if (!result.isValid) {
          expect(result.code).toBe('PROHIBITED_PORT');
        }
      }
    });

    it('prohibits scoped IPv6 with zone identifiers', () => {
      const result = validateUrl('https://[fe80::1%eth0]/status', 'PUBLIC_RESEARCH_SOURCE');
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(['SCOPED_IPV6_PROHIBITED', 'MALFORMED_URL']).toContain(result.code);
      }
    });

    describe('TRUSTED_PROVIDER Policy Enforcement', () => {
      it('prohibits HTTP downgrade for trusted provider endpoints', () => {
        const result = validateUrl('http://api.openai.com/v1/responses', 'TRUSTED_PROVIDER');
        expect(result.isValid).toBe(false);
        if (!result.isValid) {
          expect(result.code).toBe('HTTP_DOWNGRADE_PROHIBITED');
        }
      });

      it('rejects unapproved provider hostnames', () => {
        const result = validateUrl('https://evil-proxy.attacker.com/v1/chat', 'TRUSTED_PROVIDER');
        expect(result.isValid).toBe(false);
        if (!result.isValid) {
          expect(result.code).toBe('UNAPPROVED_PROVIDER_HOST');
        }
      });

      it('approves legitimate configured provider hostnames', () => {
        for (const host of APPROVED_PROVIDER_HOSTS) {
          const result = validateUrl(`https://${host}/v1/test`, 'TRUSTED_PROVIDER');
          expect(result.isValid).toBe(true);
        }
      });
    });
  });

  describe('IP Classification & SSRF Defense (classifyIpAddress)', () => {
    it('classifies RFC 1122 loopback addresses as non-public', () => {
      const loopbacks = ['127.0.0.1', '127.0.0.2', '127.255.255.254'];
      for (const ip of loopbacks) {
        const classification = classifyIpAddress(ip);
        expect(classification.isPublic).toBe(false);
        expect(classification.category).toContain('Loopback');
      }
    });

    it('classifies RFC 1918 private network addresses as non-public', () => {
      const privateIps = [
        '10.0.0.1',
        '10.255.255.255',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.0.1',
        '192.168.1.254',
      ];
      for (const ip of privateIps) {
        const classification = classifyIpAddress(ip);
        expect(classification.isPublic).toBe(false);
        expect(classification.category).toContain('Private-Use');
      }
    });

    it('classifies RFC 3927 link-local cloud metadata (169.254.169.254) as non-public', () => {
      const metaIp = '169.254.169.254';
      const classification = classifyIpAddress(metaIp);
      expect(classification.isPublic).toBe(false);
      expect(classification.category).toContain('Link-Local / Cloud Metadata');
    });

    it('classifies IPv6 loopback (::1) and unspecified (::) as non-public', () => {
      expect(classifyIpAddress('::1').isPublic).toBe(false);
      expect(classifyIpAddress('::').isPublic).toBe(false);
    });

    it('classifies IPv4-mapped IPv6 private/loopback addresses as non-public', () => {
      const mappedLoopback = classifyIpAddress('::ffff:127.0.0.1');
      expect(mappedLoopback.isPublic).toBe(false);
      expect(mappedLoopback.embeddedIpv4).toBe('127.0.0.1');

      const mappedPrivate = classifyIpAddress('::ffff:10.0.0.1');
      expect(mappedPrivate.isPublic).toBe(false);
      expect(mappedPrivate.embeddedIpv4).toBe('10.0.0.1');
    });

    it('classifies legitimate routable public IP addresses as public', () => {
      const publicIps = [
        '93.184.216.34',  // example.com
        '1.1.1.1',        // Cloudflare DNS
        '8.8.8.8',        // Google DNS
        '2606:4700:4700::1111', // Cloudflare IPv6
      ];
      for (const ip of publicIps) {
        const classification = classifyIpAddress(ip);
        expect(classification.isPublic).toBe(true);
      }
    });
  });

  describe('DNS Resolution & Anti-Rebinding Mitigation (resolveAndValidateDns)', () => {
    it('accepts hostname when all resolved addresses are public', async () => {
      const mockLookup = async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ];

      const result = await resolveAndValidateDns('example.com', { lookupFn: mockLookup });
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.hostname).toBe('example.com');
        expect(result.addresses).toHaveLength(2);
      }
    });

    it('fails-closed with DNS_ANSWER_PROHIBITED when DNS returns mixed public and private IPs', async () => {
      const mockMixedLookup = async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 }, // Attacker trying DNS rebinding
      ];

      const result = await resolveAndValidateDns('rebind-attack.com', { lookupFn: mockMixedLookup });
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.code).toBe('DNS_ANSWER_PROHIBITED');
        expect(result.prohibitedAddress).toBe('127.0.0.1');
      }
    });

    it('fails with DNS_RESOLUTION_EMPTY when no A or AAAA records exist', async () => {
      const mockEmptyLookup = async () => [];

      const result = await resolveAndValidateDns('empty.example.com', { lookupFn: mockEmptyLookup });
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.code).toBe('DNS_RESOLUTION_EMPTY');
      }
    });
  });

  describe('safeFetch Client Security Policy Invariants', () => {
    it('rejects POST requests under PUBLIC_RESEARCH_SOURCE policy', async () => {
      await expect(
        safeFetch('https://example.com/form', {
          method: 'POST',
          policy: 'PUBLIC_RESEARCH_SOURCE',
        })
      ).rejects.toThrow(SafeHttpError);
    });

    it('rejects destination immediately when URL fails policy validation', async () => {
      await expect(
        safeFetch('http://127.0.0.1:8080/admin', {
          policy: 'PUBLIC_RESEARCH_SOURCE',
        })
      ).rejects.toThrow(SafeHttpError);
    });

    it('aborts immediately when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        safeFetch('https://example.com', {
          signal: controller.signal,
        })
      ).rejects.toThrow(/cancelled by caller/);
    });
  });
});
