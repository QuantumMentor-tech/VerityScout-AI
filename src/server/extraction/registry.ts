import 'server-only';
import {
  type ExtractionProviderId,
  ExtractionError,
  isExtractionProviderId,
} from './contracts';
import type { IExtractionProvider } from './adapters/extraction-adapter.interface';
import { DirectSafeFetchExtractor } from './adapters/direct/direct-safe-fetch-extractor';
import { FirecrawlExtractionAdapter } from './adapters/firecrawl/firecrawl-extraction-adapter';
import { MockExtractionAdapter } from './adapters/mock/mock-extraction-adapter';

/**
 * VerityScout AI — Extraction Provider Registry
 * Governed by: ADR-005, DEC-006, and Step 34.
 *
 * Manages extraction adapters with two-tier cost optimization and zero vendor lock-in.
 */
export class ExtractionProviderRegistry {
  private static instance: ExtractionProviderRegistry | null = null;
  private readonly adapters = new Map<ExtractionProviderId, IExtractionProvider>();

  private constructor() {
    this.registerDefaultAdapters();
  }

  public static getInstance(): ExtractionProviderRegistry {
    if (!ExtractionProviderRegistry.instance) {
      ExtractionProviderRegistry.instance = new ExtractionProviderRegistry();
    }
    return ExtractionProviderRegistry.instance;
  }

  private registerDefaultAdapters(): void {
    this.adapters.set('direct_safe_fetch', new DirectSafeFetchExtractor());
    this.adapters.set('firecrawl', new FirecrawlExtractionAdapter());
    this.adapters.set('mock_extract', new MockExtractionAdapter());
  }

  public getAdapter(providerId: ExtractionProviderId): IExtractionProvider {
    if (!isExtractionProviderId(providerId)) {
      throw new ExtractionError(
        'UNKNOWN_ERROR',
        `Unknown extraction provider identifier: "${String(providerId)}"`
      );
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new ExtractionError(
        'PROVIDER_UNAVAILABLE',
        `Extraction provider "${providerId}" is not registered in the system`,
        { providerId }
      );
    }

    return adapter;
  }

  public registerAdapter(providerId: ExtractionProviderId, adapter: IExtractionProvider): void {
    this.adapters.set(providerId, adapter);
  }

  public reset(): void {
    this.adapters.clear();
    this.registerDefaultAdapters();
  }
}

export function getExtractionProviderRegistry(): ExtractionProviderRegistry {
  return ExtractionProviderRegistry.getInstance();
}

