import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ExportService } from '@/server/export/export.service';
import { ExportFormat } from '@/server/export/export.types';
import { AppError } from '@/lib/errors/app-error';

const exportService = new ExportService();

const VALID_FORMATS: readonly ExportFormat[] = ['json', 'csv', 'markdown'];

/**
 * GET /api/research/history/export
 * Exports filtered research history in JSON, CSV, or Markdown.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const formatParam = (searchParams.get('format') ?? 'json').toLowerCase() as ExportFormat;

  if (!VALID_FORMATS.includes(formatParam)) {
    return NextResponse.json(
      { error: `Invalid export format "${formatParam}". Allowed: json, csv, markdown` },
      { status: 400 }
    );
  }

  const query = searchParams.get('query') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const scheduleId = searchParams.get('scheduleId') ?? undefined;
  const taskType = searchParams.get('taskType') ?? undefined;
  const fromDate = searchParams.get('fromDate') ?? undefined;
  const toDate = searchParams.get('toDate') ?? undefined;

  try {
    const result = await exportService.exportHistory(
      userId,
      {
        query,
        status,
        scheduleId,
        taskType,
        fromDate,
        toDate,
      },
      formatParam
    );

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
      { error: err instanceof Error ? err.message : 'History export generation failed' },
      { status: 500 }
    );
  }
}

