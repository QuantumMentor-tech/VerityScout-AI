import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ResearchTaskRepository, ResearchRunRepository } from '@/server/persistence/repositories';
import { withTransaction } from '@/server/persistence/transaction';
import { TaskType, RunStatus, RunStage } from '@/server/persistence/types';
import { getResearchJobQueue } from '@/server/queue';
import { logger } from '@/lib/logging/logger';

const CreateResearchRunSchema = z.object({
  query: z.string().trim().min(3, 'Query must be at least 3 characters').max(2000, 'Query exceeds 2,000 character limit'),
  taskType: z.enum(['PRODUCT_RESEARCH', 'GENERAL_RESEARCH', 'PRICE_MONITOR', 'SPEC_VERIFICATION']).optional().default('PRODUCT_RESEARCH'),
  title: z.string().trim().max(255).optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
  limits: z.record(z.string(), z.unknown()).optional(),
  modelPolicy: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().min(-10).max(10).optional().default(0),
});

const taskRepo = new ResearchTaskRepository();
const runRepo = new ResearchRunRepository();

/**
 * POST /api/research/runs
 * Submits and durably enqueues a new asynchronous research run.
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

  const parsed = CreateResearchRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { query, taskType, title, constraints, limits, modelPolicy, priority } = parsed.data;
  const queue = getResearchJobQueue();

  try {
    const result = await withTransaction(async (tx) => {
      // 1. Create parent research task
      const task = await taskRepo.create(
        {
          user_id: userId,
          title: title ?? query.slice(0, 100),
          original_query: query,
          task_type: taskType as TaskType,
          constraints,
          limits,
          model_policy: modelPolicy,
        },
        tx
      );

      // 2. Create child research run in QUEUED status
      const run = await runRepo.create(
        {
          task_id: task.id,
          user_id: userId,
          status: RunStatus.QUEUED,
          current_stage: RunStage.INITIATED,
        },
        tx
      );

      // 3. Atomically enqueue job into persistent queue
      const jobId = await queue.enqueue(
        {
          runId: run.id,
          taskId: task.id,
          userId,
          query,
          taskType,
          constraints,
          limits,
          modelPolicy,
        },
        { priority, tx }
      );

      return { run, task, jobId };
    });

    logger.info('RESEARCH_RUN_SUBMITTED', 'Research run accepted and enqueued', {
      runId: result.run.id,
      taskId: result.task.id,
      userId,
      jobId: result.jobId,
    });

    return NextResponse.json(
      {
        runId: result.run.id,
        taskId: result.task.id,
        status: RunStatus.QUEUED,
        message: 'Research run submitted and durably queued for execution.',
        createdAt: result.run.started_at,
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    logger.error('RESEARCH_RUN_SUBMIT_FAILED', 'Failed to create research run', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to initiate asynchronous research run' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/research/runs
 * Lists paginated research runs owned by the authenticated caller.
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
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10) || 10));

  try {
    const runs = await runRepo.listByOwner(userId, { page, limit });
    return NextResponse.json(runs, { status: 200 });
  } catch (err: unknown) {
    logger.error('RESEARCH_RUNS_LIST_FAILED', 'Failed to list research runs', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to retrieve research runs' }, { status: 500 });
  }
}
