import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ResearchJobQueueRow } from '@/server/persistence/types';
import {
  IResearchJobQueue,
  ResearchJobPayload,
  ClaimedResearchJob,
  EnqueueJobOptions,
  QueueMetrics,
  JobStatus,
  QueueError,
} from './queue.types';

interface InternalJobItem {
  id: string;
  runId: string;
  taskId: string;
  userId: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  claimedBy: string | null;
  claimedAt: string | null;
  lastError?: string;
  payload: ResearchJobPayload;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryJobQueueAdapter implements IResearchJobQueue {
  private readonly jobs = new Map<string, InternalJobItem>();

  async enqueue(payload: ResearchJobPayload, options?: EnqueueJobOptions): Promise<string> {
    // Check uniqueness constraint on run_id
    for (const job of this.jobs.values()) {
      if (job.runId === payload.runId) {
        throw new QueueError(`Job for run ${payload.runId} is already enqueued`);
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const item: InternalJobItem = {
      id,
      runId: payload.runId,
      taskId: payload.taskId,
      userId: payload.userId,
      status: 'QUEUED',
      priority: options?.priority ?? 0,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      claimedBy: null,
      claimedAt: null,
      payload,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(id, item);
    return id;
  }

  async claimNextJob(workerId: string): Promise<ClaimedResearchJob | null> {
    const queuedJobs = Array.from(this.jobs.values())
      .filter((j) => j.status === 'QUEUED')
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    const candidate = queuedJobs[0];
    if (!candidate) {
      return null;
    }

    const now = new Date().toISOString();
    candidate.status = 'PROCESSING';
    candidate.claimedBy = workerId;
    candidate.claimedAt = now;
    candidate.attempts += 1;
    candidate.updatedAt = now;

    return {
      id: candidate.id,
      runId: candidate.runId,
      taskId: candidate.taskId,
      userId: candidate.userId,
      priority: candidate.priority,
      attempts: candidate.attempts,
      payload: candidate.payload,
    };
  }

  async ackJob(jobId: string, runId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.runId !== runId) {
      throw new QueueError(`Job ${jobId} not found`);
    }
    job.status = 'COMPLETED';
    job.updatedAt = new Date().toISOString();
  }

  async failJob(jobId: string, runId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.runId !== runId) {
      throw new QueueError(`Job ${jobId} not found`);
    }
    job.status = 'FAILED';
    job.lastError = error;
    job.updatedAt = new Date().toISOString();
  }

  async getMetrics(): Promise<QueueMetrics> {
    let queued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case 'QUEUED':
          queued++;
          break;
        case 'PROCESSING':
          processing++;
          break;
        case 'COMPLETED':
          completed++;
          break;
        case 'FAILED':
          failed++;
          break;
      }
    }

    return {
      queued,
      processing,
      completed,
      failed,
      total: this.jobs.size,
    };
  }

  async getJobByRunId(runId: string): Promise<ResearchJobQueueRow | null> {
    for (const job of this.jobs.values()) {
      if (job.runId === runId) {
        return {
          id: job.id,
          run_id: job.runId,
          task_id: job.taskId,
          user_id: job.userId,
          status: job.status as unknown as import('@/server/persistence/types').JobStatus,
          priority: job.priority,
          attempts: job.attempts,
          max_attempts: job.maxAttempts,
          claimed_by: job.claimedBy,
          claimed_at: job.claimedAt,
          payload: job.payload as unknown as Record<string, unknown>,
          created_at: job.createdAt,
          updated_at: job.updatedAt,
        };
      }
    }
    return null;
  }

  clear(): void {
    this.jobs.clear();
  }
}
