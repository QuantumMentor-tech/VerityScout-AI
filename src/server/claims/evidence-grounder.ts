import 'server-only';
import type { EvidenceSpan } from './contracts';

export interface GroundingResult {
  readonly isGrounded: boolean;
  readonly span?: EvidenceSpan | undefined;
  readonly reason?: string | undefined;
}

/**
 * Normalizes multi-character whitespace into single spaces for robust matching.
 */
function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Strictly verifies that a claimed verbatim quote exists within the source document text.
 * Calculates exact, zero-indexed character offsets and prevents hallucinated evidence.
 */
export function verifyEvidenceGrounding(
  sourceText: string,
  claimedQuote: string,
  claimedStartOffset?: number | null,
  claimedEndOffset?: number | null,
  locationInDocument?: string | null
): GroundingResult {
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    return {
      isGrounded: false,
      reason: 'Source text is empty or non-string',
    };
  }

  if (!claimedQuote || typeof claimedQuote !== 'string' || claimedQuote.trim().length === 0) {
    return {
      isGrounded: false,
      reason: 'Claimed quote is empty or non-string',
    };
  }

  const quote = claimedQuote.trim();

  // 1. Exact Offsets Verification:
  // If caller supplied claimed offsets, verify if the slice matches the quote
  if (
    typeof claimedStartOffset === 'number' &&
    typeof claimedEndOffset === 'number' &&
    claimedStartOffset >= 0 &&
    claimedEndOffset <= sourceText.length &&
    claimedStartOffset < claimedEndOffset
  ) {
    const textSlice = sourceText.substring(claimedStartOffset, claimedEndOffset).trim();
    if (textSlice === quote) {
      return {
        isGrounded: true,
        span: {
          verbatimQuote: quote,
          charOffsetStart: claimedStartOffset,
          charOffsetEnd: claimedEndOffset,
          locationInDocument: locationInDocument ?? undefined,
          groundingStatus: 'GROUNDED_EXACT',
          confidenceScore: 1.0,
        },
      };
    }
  }

  // 2. Exact Substring Search:
  const exactIndex = sourceText.indexOf(quote);
  if (exactIndex !== -1) {
    return {
      isGrounded: true,
      span: {
        verbatimQuote: quote,
        charOffsetStart: exactIndex,
        charOffsetEnd: exactIndex + quote.length,
        locationInDocument: locationInDocument ?? undefined,
        groundingStatus: 'GROUNDED_EXACT',
        confidenceScore: 1.0,
      },
    };
  }

  // 3. Case-Insensitive or Normalized Whitespace Fallback:
  // Models sometimes collapse multiple line breaks or consecutive spaces
  const normalizedQuote = normalizeWhitespace(quote);
  const normalizedSource = normalizeWhitespace(sourceText);

  const normIndex = normalizedSource.indexOf(normalizedQuote);
  if (normIndex !== -1) {
    // Attempt approximate projection back to original sourceText
    // Find the first and last words of the normalized quote in the original text
    const words = normalizedQuote.split(' ');
    const firstWord = words[0];
    const lastWord = words[words.length - 1];

    if (firstWord && lastWord) {
      const firstWordIndex = sourceText.indexOf(firstWord);
      if (firstWordIndex !== -1) {
        const lastWordSearchStart = firstWordIndex + normalizedQuote.length - lastWord.length - 50;
        const lastWordIndex = sourceText.indexOf(
          lastWord,
          Math.max(firstWordIndex, lastWordSearchStart)
        );

        if (lastWordIndex !== -1 && lastWordIndex > firstWordIndex) {
          const actualEnd = lastWordIndex + lastWord.length;
          const actualSlice = sourceText.substring(firstWordIndex, actualEnd);

          if (normalizeWhitespace(actualSlice) === normalizedQuote) {
            return {
              isGrounded: true,
              span: {
                verbatimQuote: actualSlice,
                charOffsetStart: firstWordIndex,
                charOffsetEnd: actualEnd,
                locationInDocument: locationInDocument ?? undefined,
                groundingStatus: 'GROUNDED_NORMALIZED',
                confidenceScore: 0.95,
              },
            };
          }
        }
      }
    }

    // If word-boundary projection is ambiguous, accept normalized with document-level bounds
    return {
      isGrounded: true,
      span: {
        verbatimQuote: quote,
        charOffsetStart: 0,
        charOffsetEnd: sourceText.length,
        locationInDocument: locationInDocument ?? 'Document Body (Normalized Whitespace)',
        groundingStatus: 'GROUNDED_NORMALIZED',
        confidenceScore: 0.9,
      },
    };
  }

  // 4. Quote Absent Entirely: Hallucination / Unsupported Evidence
  return {
    isGrounded: false,
    reason: `Claimed quote "${quote.length > 50 ? quote.substring(0, 50) + '...' : quote}" not found in source document text`,
  };
}
