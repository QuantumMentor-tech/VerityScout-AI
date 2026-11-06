import { describe, it, expect } from 'vitest';
import {
  canonicalizeUrl,
  evaluateCanonicalHint,
} from '@/server/search/canonicalizer';

describe('URL Canonicalization Engine Unit Tests (Step 51 / Step 35)', () => {
  describe('Tracking Parameter Stripping Contract', () => {
    it('strips all standard UTM marketing tracking parameters', () => {
      const input = 'https://www.example.com/product/laptop?utm_source=google&utm_medium=cpc&utm_campaign=fall_sale&utm_term=laptop&utm_content=banner';
      const result = canonicalizeUrl(input);

      expect(result.isSuccess).toBe(true);
      expect(result.canonicalUrl).toBe('https://www.example.com/product/laptop');
      expect(result.removedParams).toContain('utm_source');
      expect(result.removedParams).toContain('utm_medium');
      expect(result.removedParams).toContain('utm_campaign');
      expect(result.removedParams).toContain('utm_term');
      expect(result.removedParams).toContain('utm_content');
    });

    it('strips ad network and click identifiers (gclid, fbclid, msclkid, twclid)', () => {
      const input = 'https://store.example.com/item/123?gclid=xyz123&fbclid=abc456&msclkid=ms789&twclid=tw101';
      const result = canonicalizeUrl(input);

      expect(result.isSuccess).toBe(true);
      expect(result.canonicalUrl).toBe('https://store.example.com/item/123');
      expect(result.removedParams).toEqual(['gclid', 'fbclid', 'msclkid', 'twclid']);
    });

    it('preserves content-affecting query parameters while stripping tracking params', () => {
      const input = 'https://shop.example.com/catalog?sku=PROD-9981&utm_source=newsletter&variant=dark-gray&gclid=test1234&page=2';
      const result = canonicalizeUrl(input);

      expect(result.isSuccess).toBe(true);
      expect(result.removedParams).toEqual(['utm_source', 'gclid']);
      expect(result.preservedParams).toEqual(['page', 'sku', 'variant']); // Sorted
      expect(result.canonicalUrl).toBe('https://shop.example.com/catalog?page=2&sku=PROD-9981&variant=dark-gray');
    });

    it('sorts preserved query parameters lexicographically for deterministic deduplication', () => {
      const url1 = 'https://example.com/search?z=3&a=1&m=2';
      const url2 = 'https://example.com/search?a=1&m=2&z=3';

      const res1 = canonicalizeUrl(url1);
      const res2 = canonicalizeUrl(url2);

      expect(res1.canonicalUrl).toBe(res2.canonicalUrl);
      expect(res1.canonicalUrl).toBe('https://example.com/search?a=1&m=2&z=3');
    });
  });

  describe('Hostname, Port, and Scheme Normalization', () => {
    it('folds hostname to lowercase while preserving path case', () => {
      const input = 'https://WWW.EXAMPLE.COM/Category/SpecialProduct';
      const result = canonicalizeUrl(input);

      expect(result.isSuccess).toBe(true);
      expect(result.domain).toBe('www.example.com');
      expect(result.canonicalUrl).toBe('https://www.example.com/Category/SpecialProduct');
    });

    it('removes trailing dot from DNS FQDN hostname', () => {
      const input = 'https://example.com./product/view';
      const result = canonicalizeUrl(input);

      expect(result.isSuccess).toBe(true);
      expect(result.domain).toBe('example.com');
      expect(result.canonicalUrl).toBe('https://example.com/product/view');
    });

    it('strips default port 80 for HTTP and default port 443 for HTTPS', () => {
      const httpInput = 'http://example.com:80/page';
      const httpsInput = 'https://example.com:443/page';

      expect(canonicalizeUrl(httpInput).canonicalUrl).toBe('http://example.com/page');
      expect(canonicalizeUrl(httpsInput).canonicalUrl).toBe('https://example.com/page');
    });

    it('preserves non-default ports (8080, 8443, 3000)', () => {
      const devUrl = 'http://example.com:8080/api/v1';
      const secUrl = 'https://example.com:8443/secure';

      const devRes = canonicalizeUrl(devUrl);
      const secRes = canonicalizeUrl(secUrl);

      expect(devRes.port).toBe(8080);
      expect(devRes.canonicalUrl).toBe('http://example.com:8080/api/v1');

      expect(secRes.port).toBe(8443);
      expect(secRes.canonicalUrl).toBe('https://example.com:8443/secure');
    });
  });

  describe('Fragment and Anchor Handling', () => {
    it('strips fragment hash from canonicalUrl but captures originalFragment for provenance', () => {
      const input = 'https://example.com/docs/architecture#section-2-1';
      const result = canonicalizeUrl(input);

      expect(result.isSuccess).toBe(true);
      expect(result.canonicalUrl).toBe('https://example.com/docs/architecture');
      expect(result.hasFragment).toBe(true);
      expect(result.originalFragment).toBe('section-2-1');
    });

    it('handles URLs without fragments correctly', () => {
      const input = 'https://example.com/specs';
      const result = canonicalizeUrl(input);

      expect(result.hasFragment).toBe(false);
      expect(result.originalFragment).toBeNull();
    });
  });

  describe('Invalid and Edge Cases', () => {
    it('returns isSuccess=false for empty or non-string inputs', () => {
      expect(canonicalizeUrl('').isSuccess).toBe(false);
      expect(canonicalizeUrl('   ').isSuccess).toBe(false);
      expect(canonicalizeUrl(null as unknown as string).isSuccess).toBe(false);
    });

    it('returns isSuccess=false for non-http/https protocols', () => {
      const ftpResult = canonicalizeUrl('ftp://files.example.com/spec.pdf');
      expect(ftpResult.isSuccess).toBe(false);
      expect(ftpResult.error).toContain('Unsupported scheme "ftp:"');

      const fileResult = canonicalizeUrl('file:///etc/passwd');
      expect(fileResult.isSuccess).toBe(false);
      expect(fileResult.error).toContain('Unsupported scheme "file:"');
    });

    it('returns isSuccess=false for completely malformed URLs', () => {
      const result = canonicalizeUrl('not a valid url:8080');
      expect(result.isSuccess).toBe(false);
      expect(result.error).toContain('Malformed URL');
    });
  });

  describe('Canonical Hint Evaluation Contract', () => {
    it('evaluates exact same-origin match when canonical hint equals base canonical URL', () => {
      const source = 'https://example.com/products/headphones?utm_source=promo';
      const hint = 'https://example.com/products/headphones';

      const evalResult = evaluateCanonicalHint(hint, source);
      expect(evalResult.status).toBe('SAME_ORIGIN_MATCH');
      expect(evalResult.isSameOrigin).toBe(true);
    });

    it('evaluates SAME_ORIGIN_DIFFERENT when hint points to an alternate page on same domain', () => {
      const source = 'https://example.com/products/headphones-black';
      const hint = 'https://example.com/products/headphones';

      const evalResult = evaluateCanonicalHint(hint, source);
      expect(evalResult.status).toBe('SAME_ORIGIN_DIFFERENT');
      expect(evalResult.isSameOrigin).toBe(true);
      expect(evalResult.resolvedUrl).toBe('https://example.com/products/headphones');
    });

    it('evaluates CROSS_ORIGIN when hint points to an external third-party domain', () => {
      const source = 'https://syndicate.example.com/article';
      const hint = 'https://original-publisher.com/article';

      const evalResult = evaluateCanonicalHint(hint, source);
      expect(evalResult.status).toBe('CROSS_ORIGIN');
      expect(evalResult.isSameOrigin).toBe(false);
    });

    it('evaluates NO_HINT when hint is null or blank', () => {
      expect(evaluateCanonicalHint(null, 'https://example.com').status).toBe('NO_HINT');
      expect(evaluateCanonicalHint('   ', 'https://example.com').status).toBe('NO_HINT');
    });

    it('evaluates UNSAFE_DESTINATION when hint points to private IP or loopback address', () => {
      const source = 'https://example.com/product';
      const hint = 'http://169.254.169.254/latest/meta-data/';

      const evalResult = evaluateCanonicalHint(hint, source);
      expect(evalResult.status).toBe('UNSAFE_DESTINATION');
      expect(evalResult.notes).toContain('prohibited network destination');
    });
  });
});
