import { ResearchWorker } from './research-worker';
import { logger } from '@/lib/logging/logger';

/**
 * VerityScout AI — Persistent Research Worker CLI Daemon
 * Governed by Step 43 of 60.
 */
async function main(): Promise<void> {
  const worker = new ResearchWorker();

  logger.info('WORKER_BOOT', 'Starting VerityScout AI background research worker', {
    workerId: worker.workerId,
    pid: process.pid,
  });

  const shutdown = async (signal: string) => {
    logger.info('WORKER_SIGNAL_RECEIVED', `Received ${signal}, initiating graceful shutdown...`, {
      workerId: worker.workerId,
    });
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  worker.start();
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('WORKER_FATAL_ERROR', 'Fatal error during worker execution', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}

export { main };

