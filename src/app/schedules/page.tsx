import type { Metadata } from 'next';
import styles from './page.module.css';
import { Alert, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { SCHEDULES_FIXTURE } from '@/fixtures';

export const metadata: Metadata = {
  title: 'Scheduled Monitors — VerityScout AI',
  description: 'Recurring automated research tasks, periodic change monitoring, and price-drop alerts.',
};

export default function SchedulesPage(): React.JSX.Element {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h1 className={styles.title}>Scheduled Monitors</h1>
          <Badge variant="brand">Step 15 Shell</Badge>
        </div>
        <p className={styles.subtitle}>
          Automated background monitoring jobs, recurrence cadences, and continuous verification.
        </p>
      </header>

      <Alert variant="info" title="Sample Monitoring Preview">
        The scheduled monitor records below are illustrative fixtures. 
        Background worker queues (BullMQ + Redis) and real periodic execution are scheduled for Phase 6 (Step 40) and Phase 7 (Step 46).
      </Alert>

      <div className={styles.scheduleGrid}>
        {SCHEDULES_FIXTURE.map((schedule) => (
          <Card key={schedule.id} variant="default">
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <CardTitle as="h2">{schedule.taskName}</CardTitle>
                {schedule.priceDropAlert && <Badge variant="warning" size="sm">Alert Active</Badge>}
              </div>
              <span className={styles.cadence}>{schedule.cadence}</span>
            </CardHeader>
            <CardContent>
              <div className={styles.scheduleMeta}>
                <div><strong>Target:</strong> {schedule.targetDomain}</div>
                <div><strong>Last Run:</strong> {schedule.lastRunTimestamp}</div>
                <div><strong>Next Run:</strong> {schedule.nextRunTimestamp}</div>
                <div><strong>Task ID:</strong> <code>{schedule.id}</code></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
