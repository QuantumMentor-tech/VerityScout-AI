'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input, FormField, Alert, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

interface ScheduleCreatorProps {
  readonly onScheduleCreated?: (() => void) | undefined;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function ScheduleCreator({ onScheduleCreated }: ScheduleCreatorProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [time, setTime] = useState('09:00');
  const [timezone, setTimezone] = useState('UTC');
  const [weekdays, setWeekdays] = useState<number[]>([1]); // Monday default
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        setTimezone(detected);
      }
    } catch {
      // Fallback remains UTC
    }
  }, []);

  const handleWeekdayToggle = (day: number) => {
    if (weekdays.includes(day)) {
      if (weekdays.length > 1) {
        setWeekdays(weekdays.filter((d) => d !== day));
      }
    } else {
      setWeekdays([...weekdays, day].sort());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (query.trim().length < 3) {
      setError('Research query must be at least 3 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        query: query.trim(),
        name: name.trim() || undefined,
        timezone,
        recurrence: {
          frequency,
          time,
          interval: 1,
          ...(frequency === 'WEEKLY' ? { weekdays } : {}),
          ...(frequency === 'MONTHLY' ? { dayOfMonth, monthBoundaryPolicy: 'CLAMP_TO_LAST_DAY' } : {}),
        },
      };

      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create research schedule');
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg(`Schedule created successfully! Next run: ${new Date(data.nextRun.nextRunAt).toLocaleString()}`);
      setQuery('');
      setName('');
      setIsSubmitting(false);

      if (onScheduleCreated) {
        onScheduleCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error creating schedule');
      setIsSubmitting(false);
    }
  };

  const weekdayLabels = [
    { day: 1, label: 'Mon' },
    { day: 2, label: 'Tue' },
    { day: 3, label: 'Wed' },
    { day: 4, label: 'Thu' },
    { day: 5, label: 'Fri' },
    { day: 6, label: 'Sat' },
    { day: 7, label: 'Sun' },
  ];

  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      {!isOpen ? (
        <Button variant="primary" onClick={() => setIsOpen(true)}>
          + Create Recurring Schedule
        </Button>
      ) : (
        <Card variant="default">
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <CardTitle as="h2">Create Recurring Research Schedule</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <Alert variant="danger" title="Validation Error">
                  {error}
                </Alert>
              </div>
            )}

            {successMsg && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <Alert variant="success" title="Success">
                  {successMsg}
                </Alert>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <FormField label="Schedule Name (Optional)" htmlFor="sched-name">
                <Input
                  id="sched-name"
                  placeholder="e.g. Weekly RTX 5090 Price & Spec Tracker"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>

              <FormField label="Research Query *" htmlFor="sched-query">
                <Input
                  id="sched-query"
                  placeholder="e.g. NVIDIA RTX 5090 MSRP availability and pricing under $2500"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                <FormField label="Recurrence Frequency *" htmlFor="sched-freq">
                  <select
                    id="sched-freq"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY')}
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </FormField>

                <FormField label="Local Scheduled Time (24h) *" htmlFor="sched-time">
                  <Input
                    id="sched-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </FormField>

                <FormField label="IANA Timezone *" htmlFor="sched-tz">
                  <select
                    id="sched-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {!COMMON_TIMEZONES.includes(timezone) && (
                      <option value={timezone}>{timezone} (Detected)</option>
                    )}
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              {frequency === 'WEEKLY' && (
                <FormField label="Days of Week" htmlFor="sched-weekdays">
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {weekdayLabels.map(({ day, label }) => {
                      const isSelected = weekdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => handleWeekdayToggle(day)}
                          style={{
                            padding: 'var(--space-2) var(--space-3)',
                            borderRadius: 'var(--radius-md)',
                            border: `1px solid ${isSelected ? 'var(--color-brand)' : 'var(--color-border)'}`,
                            backgroundColor: isSelected ? 'var(--color-brand-subtle)' : 'var(--color-surface)',
                            color: isSelected ? 'var(--color-brand)' : 'var(--color-text-primary)',
                            cursor: 'pointer',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
              )}

              {frequency === 'MONTHLY' && (
                <FormField label="Day of Month (1-31) *" htmlFor="sched-day-month">
                  <Input
                    id="sched-day-month"
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Months with fewer days will automatically clamp to the last valid calendar day.
                  </span>
                </FormField>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating Schedule...' : 'Save & Activate Schedule'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
