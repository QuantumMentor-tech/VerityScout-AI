import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ChangeDetectorService } from '@/server/changes';
import { AppError } from '@/lib/errors/app-error';

const CompareRunsSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  currentRunId: z.string().uuid('Invalid current run ID'),
  scheduleId: z.string().uuid('Invalid schedule ID').optional().nullable(),
  forcedBaselineRunId: z.string().uuid('Invalid forced baseline run ID').optional(),
  includeUnchanged: z.boolean().optional().default(false),
});

const changeDetectorService = new ChangeDetectorService();

/**
 * POST /api/research/comparisons
 * Explicitly triggers deterministic change detection comparison between research runs.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = CompareRunsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const comparisonResult = await changeDetectorService.compareRuns({
      taskId: parsed.data.taskId,
      currentRunId: parsed.data.currentRunId,
      userId,
      scheduleId: parsed.data.scheduleId ?? null,
      forcedBaselineRunId: parsed.data.forcedBaselineRunId,
      includeUnchanged: parsed.data.includeUnchanged,
    });

    return NextResponse.json(comparisonResult);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Change detection failed' },
      { status: 500 }
    );
  }
}

