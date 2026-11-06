import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ExportService } from '@/server/export/export.service';
import { ExportFormat, CsvDatasetType } from '@/server/export/export.types';
import { AppError } from '@/lib/errors/app-error';

const exportService = new ExportService();

interface RouteContext {
  params: Promise<{
    runId: string;
  }>;
}

const VALID_FORMATS: readonly ExportFormat[] = ['json', 'csv', 'markdown'];
const VALID_DATASETS: readonly CsvDatasetType[] = ['candidates', 'evidence', 'changes'];

/**
 * GET /api/research/runs/[runId]/export
 * Exports an authorized research run in JSON, CSV, or Markdown.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { runId } = await context.params;
  const { searchParams } = new URL(req.url);
  const formatParam = (searchParams.get('format') ?? 'json').toLowerCase() as ExportFormat;
  const datasetParam = (searchParams.get('dataset') ?? 'candidates').toLowerCase() as CsvDatasetType;

  if (!VALID_FORMATS.includes(formatParam)) {
    return NextResponse.json(
      { error: `Invalid export format "${formatParam}". Allowed: json, csv, markdown` },
      { status: 400 }
    );
  }

  if (formatParam === 'csv' && !VALID_DATASETS.includes(datasetParam)) {
    return NextResponse.json(
      { error: `Invalid CSV dataset "${datasetParam}". Allowed: candidates, evidence, changes` },
      { status: 400 }
    );
  }

  try {
    const result = await exportService.exportRun(runId, userId, {
      format: formatParam,
      dataset: datasetParam,
    });

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export generation failed' },
      { status: 500 }
    );
  }
}

