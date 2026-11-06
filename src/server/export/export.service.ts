import 'server-only';
import {
  ExportFormat,
  ExportScopeOptions,
} from './export.types';
import {
  serializeCandidatesCsv,
  serializeEvidenceCsv,
  serializeChangesCsv,
  serializeHistoryCsv,
} from './csv-serializer';
import { serializeRunToJson, serializeHistoryToJson } from './json-serializer';
import { serializeRunToMarkdown, serializeHistoryToMarkdown } from './markdown-serializer';
import { ResearchHistoryService } from '@/server/history/history.service';
import { HistoryFilterOptions } from '@/server/history/history.types';
import { AppError } from '@/lib/errors/app-error';

export interface ExportResult {
  readonly data: string;
  readonly contentType: string;
  readonly filename: string;
}

/**
 * Sanitizes a filename, stripping directory traversal characters, non-ASCII/control bytes,
 * and enforcing maximum length limits.
 */
export function sanitizeFilename(filename: string): string {
  // Extract only basename, stripping any directories or traversal prefixes
  const basename = filename.replace(/^.*[/\\]/, '');
  const parts = basename.split('.');
  const ext = parts.length > 1 ? `.${parts.pop()}` : '';
  const base = parts.join('.');

  const sanitizedBase = base
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

  return `${sanitizedBase || 'export'}${ext}`;
}

export class ExportService {
  constructor(
    private readonly historyService: ResearchHistoryService = new ResearchHistoryService()
  ) {}

  /**
   * Generates a single research run export in the requested format.
   */
  async exportRun(
    runId: string,
    userId: string,
    options: ExportScopeOptions
  ): Promise<ExportResult> {
    const { format, dataset = 'candidates' } = options;

    const snapshot = await this.historyService.getRunExportSnapshot(runId, userId);
    const shortId = runId.slice(0, 8);

    switch (format) {
      case 'json': {
        const data = serializeRunToJson(snapshot);
        return {
          data,
          contentType: 'application/json; charset=utf-8',
          filename: sanitizeFilename(`verityscout-run-${shortId}.json`),
        };
      }
      case 'csv': {
        let data: string;
        let fileTag = dataset;

        if (dataset === 'evidence') {
          data = serializeEvidenceCsv(snapshot.evidence, snapshot.sources, runId);
        } else if (dataset === 'changes') {
          data = serializeChangesCsv(snapshot.changes ?? [], runId);
        } else {
          // Default to candidates
          data = serializeCandidatesCsv(snapshot.candidates, runId);
          fileTag = 'candidates';
        }

        return {
          data,
          contentType: 'text/csv; charset=utf-8',
          filename: sanitizeFilename(`verityscout-run-${shortId}-${fileTag}.csv`),
        };
      }
      case 'markdown': {
        const data = serializeRunToMarkdown(snapshot);
        return {
          data,
          contentType: 'text/markdown; charset=utf-8',
          filename: sanitizeFilename(`verityscout-run-${shortId}.md`),
        };
      }
      default:
        throw new AppError({
          code: 'BAD_REQUEST',
          message: `Unsupported export format: ${format}`,
          statusCode: 400,
        });
    }
  }

  /**
   * Generates a filtered research history export in the requested format.
   */
  async exportHistory(
    userId: string,
    filters?: HistoryFilterOptions,
    format: ExportFormat = 'json'
  ): Promise<ExportResult> {
    const snapshot = await this.historyService.getHistoryExportSnapshot(userId, filters, 500);
    const dateStr = new Date().toISOString().slice(0, 10);

    switch (format) {
      case 'json': {
        const data = serializeHistoryToJson(snapshot);
        return {
          data,
          contentType: 'application/json; charset=utf-8',
          filename: sanitizeFilename(`verityscout-history-${dateStr}.json`),
        };
      }
      case 'csv': {
        const data = serializeHistoryCsv(snapshot.runs);
        return {
          data,
          contentType: 'text/csv; charset=utf-8',
          filename: sanitizeFilename(`verityscout-history-${dateStr}.csv`),
        };
      }
      case 'markdown': {
        const data = serializeHistoryToMarkdown(snapshot);
        return {
          data,
          contentType: 'text/markdown; charset=utf-8',
          filename: sanitizeFilename(`verityscout-history-${dateStr}.md`),
        };
      }
      default:
        throw new AppError({
          code: 'BAD_REQUEST',
          message: `Unsupported export format: ${format}`,
          statusCode: 400,
        });
    }
  }
}
