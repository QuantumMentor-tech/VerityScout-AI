import type { Metadata } from 'next';
import styles from './page.module.css';
import { Alert, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { ScheduleCreator, ScheduleManager } from '@/features/schedules';
import { SCHEDULES_FIXTURE } from '@/fixtures';

export const metadata: Metadata = {
  title: 'Scheduled Monitors — VerityScout AI',
  description: 'Recurring automated research schedules, periodic change monitoring, and timezone-aware execution.',
};

export default function SchedulesPage(): React.JSX.Element {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h1 className={styles.title}>Scheduled Monitors</h1>
          <Badge variant="brand">Phase 10 Research Scheduling</Badge>
        </div>
        <p className={styles.subtitle}>
          Durable background research schedules, IANA timezone-aware recurrence, and persistent worker dispatch.
        </p>
      </header>

      {/* Interactive Schedule Creator */}
      <ScheduleCreator />

      {/* Active Schedules Lifecycle & Occurrence Management */}
      <ScheduleManager />

      <Alert variant="info" title="Sample Monitoring Preview">
        The scheduled monitor records below are illustrative fixtures. 
        Use the form above to activate a live, persistent recurring schedule with your chosen IANA timezone.
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
