import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ResearchHistoryService } from '@/server/history/history.service';
import { AppError } from '@/lib/errors/app-error';

const historyService = new ResearchHistoryService();

/**
 * GET /api/research/history
 * Retrieves paginated, searchable research run history for the authenticated tenant.
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
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100);
  const query = searchParams.get('query') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const scheduleId = searchParams.get('scheduleId') ?? undefined;
  const taskType = searchParams.get('taskType') ?? undefined;
  const fromDate = searchParams.get('fromDate') ?? undefined;
  const toDate = searchParams.get('toDate') ?? undefined;

  try {
    const result = await historyService.listHistory(userId, {
      page,
      limit,
      query,
      status,
      scheduleId,
      taskType,
      fromDate,
      toDate,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

