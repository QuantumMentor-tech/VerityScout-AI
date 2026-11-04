'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryComposer } from './QueryComposer';
import { Alert, Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

export function ResearchWorkspaceClient(): React.JSX.Element {
  const router = useRouter();
  const [validatedQuery, setValidatedQuery] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmitRun = async () => {
    if (!validatedQuery) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/research/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: validatedQuery }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit research run');
      }

      if (data.runId) {
        router.push(`/research/runs/${data.runId}`);
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error submitting research run');
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <QueryComposer
        onQueryValidated={(q) => {
          setValidatedQuery(q);
          setSubmitError(null);
        }}
      />

      {validatedQuery && (
        <Card variant="default">
          <CardHeader>
            <CardTitle as="h3">Ready to Launch Asynchronous Research</CardTitle>
          </CardHeader>
          <CardContent>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              Query validated. Submitting will create a persistent task, durable run record, and enqueue a job for the persistent worker daemon.
            </p>

            {submitError && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Alert variant="danger" title="Submission Failed">
                  {submitError}
                </Alert>
              </div>
            )}

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSubmitRun}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enqueuing Run...' : 'Launch Asynchronous Research Run'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

