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
  leaseExpiresAt: string | null;
  scheduledAt: string;
  lastError?: string;
  failureCategory?: string;
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
      leaseExpiresAt: null,
      scheduledAt: now,
      payload,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(id, item);
    return id;
  }

  async claimNextJob(workerId: string): Promise<ClaimedResearchJob | null> {
    const nowTime = Date.now();
    const queuedJobs = Array.from(this.jobs.values())
      .filter((j) => j.status === 'QUEUED' && new Date(j.scheduledAt).getTime() <= nowTime)
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
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
    candidate.leaseExpiresAt = new Date(nowTime + 30000).toISOString();
    candidate.updatedAt = now;

    return {
      id: candidate.id,
      runId: candidate.runId,
      taskId: candidate.taskId,
      userId: candidate.userId,
      priority: candidate.priority,
      attempts: candidate.attempts,
      maxAttempts: candidate.maxAttempts,
      leaseExpiresAt: candidate.leaseExpiresAt,
      payload: candidate.payload,
    };
  }

  async ackJob(jobId: string, runId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.runId !== runId) {
      throw new QueueError(`Job ${jobId} not found`);
    }
    job.status = 'COMPLETED';
    job.leaseExpiresAt = null;
    job.updatedAt = new Date().toISOString();
  }

  async failJob(jobId: string, runId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.runId !== runId) {
      throw new QueueError(`Job ${jobId} not found`);
    }
    job.status = 'FAILED';
    job.lastError = error;
    job.leaseExpiresAt = null;
    job.updatedAt = new Date().toISOString();
  }

  async scheduleRetry(
    jobId: string,
    runId: string,
    error: string,
    delayMs: number,
    category?: string | undefined
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.runId !== runId) {
      throw new QueueError(`Job ${jobId} not found`);
    }
    job.status = 'QUEUED';
    job.claimedBy = null;
    job.claimedAt = null;
    job.leaseExpiresAt = null;
    job.scheduledAt = new Date(Date.now() + Math.max(0, delayMs)).toISOString();
    job.lastError = error;
    job.failureCategory = category ?? 'TRANSIENT';
    job.updatedAt = new Date().toISOString();
  }

  async renewLease(jobId: string, leaseDurationMs: number = 30000): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'PROCESSING') {
      return false;
    }
    job.leaseExpiresAt = new Date(Date.now() + Math.max(1000, leaseDurationMs)).toISOString();
    job.updatedAt = new Date().toISOString();
    return true;
  }

  async cancelJob(jobId: string, runId: string, reason?: string | undefined): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.runId !== runId) {
      throw new QueueError(`Job ${jobId} not found`);
    }
    job.status = 'FAILED';
    job.lastError = reason ?? 'Cancelled by user';
    job.failureCategory = 'CANCELLED';
    job.leaseExpiresAt = null;
    job.updatedAt = new Date().toISOString();
  }

  async getExpiredProcessingJobs(now: Date = new Date()): Promise<ClaimedResearchJob[]> {
    const nowTime = now.getTime();
    const expiredJobs: ClaimedResearchJob[] = [];

    for (const job of this.jobs.values()) {
      if (
        job.status === 'PROCESSING' &&
        job.leaseExpiresAt &&
        new Date(job.leaseExpiresAt).getTime() < nowTime
      ) {
        expiredJobs.push({
          id: job.id,
          runId: job.runId,
          taskId: job.taskId,
          userId: job.userId,
          priority: job.priority,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          leaseExpiresAt: job.leaseExpiresAt,
          payload: job.payload,
        });
      }
    }

    return expiredJobs;
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
          lease_expires_at: job.leaseExpiresAt,
          scheduled_at: job.scheduledAt,
          last_error: job.lastError ?? null,
          failure_category: job.failureCategory ?? null,
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
