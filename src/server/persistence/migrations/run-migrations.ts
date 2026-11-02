import { applyMigrations, getMigrationStatus } from './migrator';
import { closePool } from '../database';

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'status';

  try {
    if (command === 'status') {
      const status = await getMigrationStatus();
      console.info('\n=== VerityScout AI Database Migration Status ===');
      console.info(`Total migrations: ${status.totalMigrations}`);
      console.info(`Applied: ${status.appliedCount}`);
      console.info(`Pending: ${status.pendingCount}`);
      console.info(`Drift detected: ${status.hasDrift ? 'YES (ALERT)' : 'No'}\n`);

      for (const item of status.items) {
        const state = item.isApplied ? '[APPLIED]' : '[PENDING]';
        const appliedDate = item.appliedAt ? ` (at ${item.appliedAt.toISOString()})` : '';
        const drift = item.isDrifted ? ' [DRIFT DETECTED]' : '';
        console.info(`  ${state} ${item.name}${appliedDate}${drift}`);
      }
      console.info('');
    } else if (command === 'migrate') {
      console.info('\n=== Executing VerityScout AI Database Migrations ===');
      const result = await applyMigrations();
      console.info(`\nMigration completed in ${result.totalDurationMs}ms.`);
      console.info(`Migrations applied: ${result.appliedCount}`);
      for (const name of result.appliedMigrations) {
        console.info(`  + ${name}`);
      }
      console.info('');
    } else {
      console.error(`Unknown command: "${command}". Available commands: "migrate", "status"`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n[Database Migration Error]', (error as Error).message);
    console.error('\nEnsure PostgreSQL is running (e.g., "npm run services:up") and environment credentials are valid.\n');
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (require.main === module || process.argv[1]?.endsWith('run-migrations.ts')) {
  void main();
}
