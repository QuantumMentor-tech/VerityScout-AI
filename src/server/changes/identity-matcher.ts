import 'server-only';
import { CandidateWithEvidence, CandidateMatchPair } from './change-detection.types';

export class IdentityMatcher {
  /**
   * Normalizes canonical URL for comparison by stripping tracking query params and trailing slashes.
   */
  public normalizeUrl(url: string | null | undefined): string {
    return IdentityMatcher.normalizeUrl(url);
  }

  public static normalizeUrl(url: string | null | undefined): string {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const cleanPath = parsed.pathname.replace(/\/+$/, '').toLowerCase();
      return `${hostname}${cleanPath}`;
    } catch {
      return url.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/+$/, '');
    }
  }

  /**
   * Cleans title/name for soft identity matching.
   */
  public cleanTitle(title: string | null | undefined): string {
    return IdentityMatcher.cleanTitle(title);
  }

  public static cleanTitle(title: string | null | undefined): string {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Matches candidate results from baseline run against candidate results from current run.
   * Produces matched pairs, newly observed items, and items no longer observed.
   */
  public matchCandidates(
    baselineCandidates: readonly CandidateWithEvidence[],
    currentCandidates: readonly CandidateWithEvidence[]
  ): CandidateMatchPair[] {
    return IdentityMatcher.matchCandidates(baselineCandidates, currentCandidates);
  }

  public static matchCandidates(
    baselineCandidates: readonly CandidateWithEvidence[],
    currentCandidates: readonly CandidateWithEvidence[]
  ): CandidateMatchPair[] {
    const pairs: CandidateMatchPair[] = [];
    const matchedBaselineIds = new Set<string>();
    const matchedCurrentIds = new Set<string>();

    // 1. Primary Pass: Match by stable product_identifier (SKU, MPN, Model ID)
    for (const b of baselineCandidates) {
      const bIdent = b.candidate.product_identifier?.trim().toLowerCase();
      if (!bIdent) continue;

      for (const c of currentCandidates) {
        if (matchedCurrentIds.has(c.candidate.id)) continue;
        const cIdent = c.candidate.product_identifier?.trim().toLowerCase();
        if (cIdent && cIdent === bIdent) {
          // Variant check: condition must match (NEW vs REFURBISHED vs USED)
          if (b.candidate.condition === c.candidate.condition) {
            pairs.push({
              baseline: b,
              current: c,
              matchType: 'STABLE_IDENTIFIER',
              matchKey: bIdent,
            });
            matchedBaselineIds.add(b.candidate.id);
            matchedCurrentIds.add(c.candidate.id);
            break;
          }
        }
      }
    }

    // 2. Secondary Pass: Match by canonical URL
    for (const b of baselineCandidates) {
      if (matchedBaselineIds.has(b.candidate.id)) continue;
      const bUrl = this.normalizeUrl(b.candidate.canonical_url);
      if (!bUrl) continue;

      for (const c of currentCandidates) {
        if (matchedCurrentIds.has(c.candidate.id)) continue;
        const cUrl = this.normalizeUrl(c.candidate.canonical_url);
        if (cUrl && cUrl === bUrl) {
          // Variant check: condition must match
          if (b.candidate.condition === c.candidate.condition) {
            pairs.push({
              baseline: b,
              current: c,
              matchType: 'CANONICAL_URL',
              matchKey: bUrl,
            });
            matchedBaselineIds.add(b.candidate.id);
            matchedCurrentIds.add(c.candidate.id);
            break;
          }
        }
      }
    }

    // 3. Tertiary Pass: Match by title and seller/domain
    for (const b of baselineCandidates) {
      if (matchedBaselineIds.has(b.candidate.id)) continue;
      const bTitle = this.cleanTitle(b.candidate.title);
      const bSeller = b.candidate.seller_or_domain.toLowerCase();
      if (!bTitle) continue;

      for (const c of currentCandidates) {
        if (matchedCurrentIds.has(c.candidate.id)) continue;
        const cTitle = this.cleanTitle(c.candidate.title);
        const cSeller = c.candidate.seller_or_domain.toLowerCase();

        if (bTitle === cTitle && (bSeller === cSeller || !bSeller || !cSeller)) {
          if (b.candidate.condition === c.candidate.condition) {
            pairs.push({
              baseline: b,
              current: c,
              matchType: 'CLEAN_TITLE',
              matchKey: bTitle,
            });
            matchedBaselineIds.add(b.candidate.id);
            matchedCurrentIds.add(c.candidate.id);
            break;
          }
        }
      }
    }

    // 4. Candidates newly observed in current run
    for (const c of currentCandidates) {
      if (!matchedCurrentIds.has(c.candidate.id)) {
        pairs.push({
          baseline: null,
          current: c,
          matchType: 'NEWLY_OBSERVED',
          matchKey: c.candidate.id,
        });
      }
    }

    // 5. Candidates in baseline no longer observed in current run
    for (const b of baselineCandidates) {
      if (!matchedBaselineIds.has(b.candidate.id)) {
        pairs.push({
          baseline: b,
          current: null,
          matchType: 'NO_LONGER_OBSERVED',
          matchKey: b.candidate.id,
        });
      }
    }

    return pairs;
  }
}
