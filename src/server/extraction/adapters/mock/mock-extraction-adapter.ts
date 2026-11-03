import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import {
  type ExtractionRequest,
  type ExtractedDocument,
  SourceAccessState,
  ExtractionState,
  ExtractionError,
} from '../../contracts';
import type { IExtractionProvider } from '../extraction-adapter.interface';

export interface MockExtractionBehavior {
  readonly shouldFailWithCode?: string | undefined;
  readonly accessState?: SourceAccessState | undefined;
  readonly extractionState?: ExtractionState | undefined;
  readonly title?: string | null | undefined;
  readonly markdownContent?: string | undefined;
  readonly textExcerpt?: string | null | undefined;
  readonly author?: string | null | undefined;
  readonly publishedDate?: string | null | undefined;
  readonly simulateDelayMs?: number | undefined;
  readonly httpStatusCode?: number | undefined;
}

/**
 * VerityScout AI — Mock Extraction Adapter
 * Governed by: ADR-005, DEC-006, and Step 34.
 *
 * Dedicated test double for offline unit, integration, and CI testing.
 * Guarantees zero live external HTTP requests and zero external API spend.
 */
export class MockExtractionAdapter implements IExtractionProvider {
  public readonly providerId = 'mock_extract' as const;
  private behavior: MockExtractionBehavior;

  constructor(initialBehavior?: MockExtractionBehavior) {
    this.behavior = initialBehavior ?? {};
  }

  setBehavior(behavior: MockExtractionBehavior): void {
    this.behavior = behavior;
  }

  async extract(request: ExtractionRequest): Promise<ExtractedDocument> {
    if (request.signal?.aborted) {
      throw new ExtractionError('CANCELLED', 'Extraction cancelled by caller', {
        providerId: this.providerId,
      });
    }

    if (this.behavior.simulateDelayMs && this.behavior.simulateDelayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.behavior.simulateDelayMs);
        if (request.signal) {
          request.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(
              new ExtractionError('CANCELLED', 'Extraction cancelled during delay', {
                providerId: this.providerId,
              })
            );
          });
        }
      });
    }

    const requestedUrl = request.url;
    let domain = 'example.com';
    try {
      domain = new URL(requestedUrl).hostname;
    } catch {
      //
    }

    const accessState = this.behavior.accessState ?? SourceAccessState.ACCESSIBLE;
    const extractionState = this.behavior.extractionState ?? ExtractionState.SUCCESS;
    const markdownContent = this.behavior.markdownContent !== undefined
      ? this.behavior.markdownContent
      : `# Product Specifications & Benchmark Review\n\n- GPU Model: RTX 4070 Super\n- VRAM: 12GB GDDR6X\n- Price: $599 USD\n- Ports: 3x DisplayPort 1.4a, 1x HDMI 2.1a`;

    const contentHash = markdownContent.length > 0
      ? createHash('sha256').update(markdownContent).digest('hex')
      : null;

    const textExcerpt = this.behavior.textExcerpt !== undefined
      ? this.behavior.textExcerpt
      : (markdownContent.length > 0 ? markdownContent.slice(0, 500) : null);

    return {
      id: randomUUID(),
      provider: this.providerId,
      requestedUrl,
      finalUrl: requestedUrl,
      domain,
      title: this.behavior.title !== undefined ? this.behavior.title : 'GeForce RTX 4070 Super Lab Benchmark',
      markdownContent,
      textExcerpt,
      contentHash,
      author: this.behavior.author !== undefined ? this.behavior.author : 'Hardware Specialist',
      publisher: 'Hardware Benchmark Labs',
      publishedDate: this.behavior.publishedDate !== undefined ? this.behavior.publishedDate : '2024-01-18T12:00:00Z',
      language: 'en',
      contentType: 'text/html',
      httpStatusCode: this.behavior.httpStatusCode ?? (accessState === SourceAccessState.ACCESSIBLE ? 200 : 403),
      accessState,
      extractionState,
      warnings: [],
      retrievedAt: new Date().toISOString(),
      usage: {
        bytesReceived: markdownContent.length,
        latencyMs: 10,
      },
    };
  }
}

