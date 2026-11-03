import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ExtractedDocument } from '@/server/extraction/contracts';
import {
  type ExtractedClaim,
  type ClaimType,
  type ClaimPolarity,
  type RejectedClaimRecord,
} from '../contracts';
import { verifyEvidenceGrounding } from '../evidence-grounder';
import { VerificationState } from '@/server/persistence/types';

interface RegexPatternRule {
  readonly claimKey: string;
  readonly claimType: ClaimType;
  readonly pattern: RegExp;
  readonly polarity?: ClaimPolarity;
  readonly extractValue: (match: RegExpExecArray) => string;
}

const DETERMINISTIC_RULES: readonly RegexPatternRule[] = [
  // 1. Price statements
  {
    claimKey: 'price',
    claimType: 'PRICE',
    pattern: /(?:(?:price|sale|starting\s+at|from|msrp|cost)[:\s]*)?(\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP)\b)/i,
    extractValue: (match) => match[1] ?? match[0],
  },
  // 2. Weight statements
  {
    claimKey: 'weight',
    claimType: 'SPECIFICATION',
    pattern: /(?:weight[:\s]*)?(\b\d+(?:\.\d+)?\s*(?:kg|g|lbs?|pounds?|ounces?|oz)\b)/i,
    extractValue: (match) => match[1] ?? match[0],
  },
  // 3. RAM / Memory
  {
    claimKey: 'ram_capacity',
    claimType: 'SPECIFICATION',
    pattern: /(\b\d+\s*(?:GB|MB)\s*(?:LPDDR\d[xX]?|DDR\d|RAM|memory)\b)/i,
    extractValue: (match) => match[1] ?? match[0],
  },
  // 4. Storage / SSD
  {
    claimKey: 'storage_capacity',
    claimType: 'SPECIFICATION',
    pattern: /(\b\d+\s*(?:GB|TB)\s*(?:PCIe|NVMe|SSD|storage|hard\s+drive)\b)/i,
    extractValue: (match) => match[1] ?? match[0],
  },
  // 5. Battery life
  {
    claimKey: 'battery_life',
    claimType: 'SPECIFICATION',
    pattern: /(?:battery\s+life[:\s]*)?((?:up\s+to\s+)?\d+(?:\.\d+)?\s*hours?(?:\s+of\s+battery(?:\s+life)?)?)/i,
    extractValue: (match) => match[1] ?? match[0],
  },
  // 6. Availability statements
  {
    claimKey: 'availability',
    claimType: 'AVAILABILITY',
    pattern: /\b(in\s+stock|out\s+of\s+stock|available\s+now|backorder|pre-order)\b/i,
    extractValue: (match) => match[1] ?? match[0],
  },
  // 7. Negative compatibility / unsupported feature
  {
    claimKey: 'compatibility',
    claimType: 'COMPATIBILITY',
    polarity: 'NEGATIVE',
    pattern: /\b(not\s+compatible\s+with\s+[^.,;\n]+|does\s+not\s+support\s+[^.,;\n]+|no\s+support\s+for\s+[^.,;\n]+)/i,
    extractValue: (match) => match[1] ?? match[0],
  },
];

export interface RuleBasedExtractionOptions {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly userId: string;
  readonly document: ExtractedDocument;
}

export function extractClaimsViaRules(
  options: RuleBasedExtractionOptions
): { acceptedClaims: ExtractedClaim[]; rejectedClaims: RejectedClaimRecord[] } {
  const { runId, sourceDocumentId, userId, document } = options;
  const sourceText = document.markdownContent || document.textExcerpt || '';

  if (!sourceText.trim()) {
    return { acceptedClaims: [], rejectedClaims: [] };
  }

  const acceptedClaims: ExtractedClaim[] = [];
  const rejectedClaims: RejectedClaimRecord[] = [];
  const now = new Date().toISOString();

  // Split text into lines / sentences to provide sentence-level context for verbatim quote
  const lines = sourceText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  for (const line of lines) {
    for (const rule of DETERMINISTIC_RULES) {
      const match = rule.pattern.exec(line);
      if (!match) continue;

      const rawVal = rule.extractValue(match).trim();
      const quote = match[0].trim();

      // Ground quote against original document text
      const grounding = verifyEvidenceGrounding(sourceText, quote, null, null, 'Document Body');

      if (!grounding.isGrounded || !grounding.span) {
        rejectedClaims.push({
          rawClaim: { claimKey: rule.claimKey, rawVal, quote },
          reason: grounding.reason ?? 'Quote grounding failed',
          code: 'UNVERIFIED_QUOTE',
        });
        continue;
      }

      // Check for qualifiers in the surrounding line
      const qualifiers: string[] = [];
      if (/base\s+model/i.test(line)) qualifiers.push('base model only');
      if (/starting\s+at/i.test(line)) qualifiers.push('starting price');
      if (/up\s+to/i.test(line)) qualifiers.push('maximum/up-to range');

      const claim: ExtractedClaim = {
        id: randomUUID(),
        runId,
        sourceDocumentId,
        userId,
        subject: document.title,
        claimKey: rule.claimKey,
        extractedRawValue: rawVal,
        claimType: rule.claimType,
        polarity: rule.polarity ?? 'POSITIVE',
        qualifiers,
        evidence: grounding.span,
        extractionStatus: 'EXPLICIT',
        extractionMethod: 'REGEX_DETERMINISTIC',
        verificationState: VerificationState.SUPPORTED,
        extractedAt: now,
      };

      acceptedClaims.push(claim);
    }
  }

  return { acceptedClaims, rejectedClaims };
}

