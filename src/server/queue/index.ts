import 'server-only';
import { IResearchJobQueue } from './queue.types';
import { PostgresJobQueueAdapter } from './postgres-job-queue';

export * from './queue.types';
export * from './postgres-job-queue';
export * from './in-memory-job-queue';

let currentQueue: IResearchJobQueue | null = null;

/**
 * Returns the active research job queue adapter.
 * Defaults to PostgreSQL-backed persistent queue.
 */
export function getResearchJobQueue(): IResearchJobQueue {
  if (!currentQueue) {
    currentQueue = new PostgresJobQueueAdapter();
  }
  return currentQueue;
}

/**
 * Overrides or resets the active research job queue adapter.
 * Useful for deterministic testing with InMemoryJobQueueAdapter.
 */
export function setResearchJobQueue(queue: IResearchJobQueue | null): void {
  currentQueue = queue;
}

