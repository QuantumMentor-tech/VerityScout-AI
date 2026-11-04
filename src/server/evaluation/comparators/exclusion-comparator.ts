import 'server-only';
import type { EvaluationReasonCode, EvaluationState } from '../contracts';
import type { ProductCondition } from '@/server/normalization/contracts';

export interface ExclusionComparisonInput {
  readonly constraintKey: string;
  readonly excludedTarget: string | readonly string[];
  readonly candidateTitle: string;
  readonly canonicalUrl: string;
  readonly sellerOrDomain: string;
  readonly candidateCondition?: ProductCondition | undefined;
  readonly specifications?: Readonly<Record<string, unknown>> | undefined;
}

export interface ExclusionComparisonResult {
  readonly state: EvaluationState;
  readonly reasonCode: EvaluationReasonCode;
  readonly explanation: string;
}

function normalize(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Evaluates negative / excluded constraints (keywords, domains, conditions).
 */
export function compareExclusion(input: ExclusionComparisonInput): ExclusionComparisonResult {
  const {
    constraintKey,
    excludedTarget,
    candidateTitle,
    canonicalUrl,
    sellerOrDomain,
    candidateCondition,
    specifications,
  } = input;

  const targets = Array.isArray(excludedTarget) ? excludedTarget : [excludedTarget];
  const normalizedTargets = targets.map((t) => normalize(String(t)));

  // 1. Condition Exclusion (e.g., "no refurbished", "exclude used")
  if (constraintKey.includes('condition') || normalizedTargets.some((t) => t.includes('refurbished') || t.includes('used'))) {
    if (!candidateCondition || candidateCondition === 'UNKNOWN') {
      return {
        state: 'UNKNOWN',
        reasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
        explanation: 'Product condition cannot be confirmed from available evidence to verify exclusion.',
      };
    }

    const isRefurbishedTarget = normalizedTargets.some((t) => t.includes('refurbished') || t === 'refurbished');
    const isUsedTarget = normalizedTargets.some((t) => t.includes('used') || t === 'used');

    if ((isRefurbishedTarget && candidateCondition === 'REFURBISHED') || (isUsedTarget && candidateCondition === 'USED')) {
      return {
        state: 'VIOLATED',
        reasonCode: 'EXPLICIT_EXCLUSION_VIOLATED',
        explanation: `Candidate violates exclusion: condition is confirmed as ${candidateCondition}.`,
      };
    }

    return {
      state: 'SATISFIED',
      reasonCode: 'EXCLUSION_SATISFIED',
      explanation: `Candidate condition is ${candidateCondition}, satisfying the exclusion rule.`,
    };
  }

  // 2. Domain Exclusion (e.g. "exclude ebay.com")
  if (constraintKey.includes('domain') || normalizedTargets.some((t) => t.includes('.') && !t.includes(' '))) {
    const urlLower = normalize(canonicalUrl);
    const domainLower = normalize(sellerOrDomain);

    for (const target of normalizedTargets) {
      if (domainLower.includes(target) || urlLower.includes(target)) {
        return {
          state: 'VIOLATED',
          reasonCode: 'EXPLICIT_EXCLUSION_VIOLATED',
          explanation: `Candidate violates domain exclusion: source domain or URL matches excluded domain "${target}".`,
        };
      }
    }

    return {
      state: 'SATISFIED',
      reasonCode: 'EXCLUSION_SATISFIED',
      explanation: `Candidate domain (${sellerOrDomain}) does not match any excluded domain.`,
    };
  }

  // 3. Keyword Exclusion (in title, specs, or metadata)
  const titleLower = normalize(candidateTitle);
  const specStrings: string[] = [];
  if (specifications) {
    for (const [k, v] of Object.entries(specifications)) {
      specStrings.push(`${k}: ${String(v)}`.toLowerCase());
    }
  }
  const specText = specStrings.join(' ');

  for (const target of normalizedTargets) {
    const wordRegex = new RegExp(`\\b${target}\\b`, 'i');
    if (wordRegex.test(titleLower) || wordRegex.test(specText)) {
      return {
        state: 'VIOLATED',
        reasonCode: 'EXPLICIT_EXCLUSION_VIOLATED',
        explanation: `Candidate violates keyword exclusion: found prohibited keyword "${target}" in title or specifications.`,
      };
    }
  }

  return {
    state: 'SATISFIED',
    reasonCode: 'EXCLUSION_SATISFIED',
    explanation: `Prohibited keyword(s) [${targets.join(', ')}] were not found in candidate metadata.`,
  };
}
