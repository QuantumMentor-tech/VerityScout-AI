import 'server-only';
import { CancellationRequestedError } from '@/server/research/retry/error-classifier';
import { ResearchRunRepository } from '@/server/persistence/repositories/research-run.repository';
import { RunStatus } from '@/server/persistence/types';

export class CancellationToken {
  private inMemoryCancelled: boolean = false;
  private readonly runId: string;
  private readonly runRepo: ResearchRunRepository;

  constructor(runId: string, runRepo?: ResearchRunRepository) {
    this.runId = runId;
    this.runRepo = runRepo ?? new ResearchRunRepository();
  }

  /**
   * Request cancellation in-memory (useful for direct worker aborts or tests).
   */
  cancel(): void {
    this.inMemoryCancelled = true;
  }

  /**
   * Queries both in-memory state and the persistent research_runs table
   * to determine whether cancellation was requested for this execution run.
   */
  async isCancellationRequested(): Promise<boolean> {
    if (this.inMemoryCancelled) {
      return true;
    }

    try {
      const run = await this.runRepo.findById(this.runId);
      if (!run) {
        return false;
      }
      return (
        run.status === RunStatus.CANCELLATION_REQUESTED ||
        run.status === RunStatus.CANCELLED
      );
    } catch {
      // In case of transient DB lookup failure during check, fallback to memory
      return this.inMemoryCancelled;
    }
  }

  /**
   * Throws a CancellationRequestedError if cancellation was requested.
   */
  async throwIfCancellationRequested(): Promise<void> {
    const cancelled = await this.isCancellationRequested();
    if (cancelled) {
      throw new CancellationRequestedError(
        `Research run ${this.runId} was cancelled by user request`
      );
    }
  }
}

