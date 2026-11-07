'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Badge, Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

export interface ProgressEventItem {
  readonly id: string;
  readonly stage: string;
  readonly eventType: string;
  readonly sequenceNumber: number;
  readonly message: string;
  readonly createdAt: string;
}

export interface RunProgressTrackerProps {
  readonly runId: string;
  readonly initialStatus: string;
  readonly initialStage: string;
  readonly initialProgressPercent?: number;
  readonly initialEvents?: ProgressEventItem[];
}

export function RunProgressTracker({
  runId,
  initialStatus,
  initialStage,
  initialProgressPercent = 0,
  initialEvents = [],
}: RunProgressTrackerProps): React.JSX.Element {
  const [status, setStatus] = useState<string>(initialStatus);
  const [stage, setStage] = useState<string>(initialStage);
  const [progressPercent, setProgressPercent] = useState<number>(initialProgressPercent);
  const [events, setEvents] = useState<ProgressEventItem[]>(initialEvents);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  const isTerminal = status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED';
  const isFetchingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchProgress = useCallback(async () => {
    if (isFetchingRef.current || isTerminal) return;
    isFetchingRef.current = true;

    // Create abort controller for in-flight fetch
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/research/runs/${runId}/progress`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        setStage(data.currentStage);
        setProgressPercent(data.progressPercent ?? 0);
        if (Array.isArray(data.events)) {
          setEvents(data.events);
        }
      }
    } catch {
      // Ignore network polling glitches and abort errors
    } finally {
      isFetchingRef.current = false;
    }
  }, [runId, isTerminal]);

  useEffect(() => {
    if (isTerminal) return;

    let timer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    // Adaptive polling loop: schedules next poll only after previous fetch completes
    const pollLoop = async () => {
      if (isCancelled || isTerminal) return;

      // Only poll when browser tab is visible (Page Visibility API - Step 57)
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        await fetchProgress();
      }

      if (!isCancelled && !isTerminal) {
        timer = setTimeout(pollLoop, 2500);
      }
    };

    // Immediate initial poll followed by scheduled loops
    timer = setTimeout(pollLoop, 2500);

    // Immediate wakeup poll when user switches back to tab
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !isTerminal) {
        void fetchProgress();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      abortControllerRef.current?.abort();
    };
  }, [isTerminal, fetchProgress]);

  const handleCancel = async () => {
    setIsCancelling(true);
    setCancelFeedback(null);

    try {
      const res = await fetch(`/api/research/runs/${runId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User requested cancellation from dashboard' }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus(data.status);
        setCancelFeedback('Cancellation successfully requested. The pipeline will stop at the nearest checkpoint.');
        fetchProgress();
      } else {
        setCancelFeedback(data.error || 'Failed to cancel research run');
      }
    } catch {
      setCancelFeedback('Network error while requesting cancellation');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Card variant="default" style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <CardTitle as="h2">Research Pipeline Lifecycle & Progress</CardTitle>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Badge
              variant={
                status === 'COMPLETED'
                  ? 'success'
                  : status === 'FAILED' || status === 'CANCELLED'
                  ? 'danger'
                  : 'brand'
              }
            >
              {status}
            </Badge>
            <Badge variant="neutral">{stage}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Bar */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-1)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>Progress: {stage}</span>
            <span>{progressPercent}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'var(--color-bg-secondary, #e2e8f0)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                height: '100%',
                backgroundColor:
                  status === 'FAILED' || status === 'CANCELLED'
                    ? 'var(--color-danger, #ef4444)'
                    : 'var(--color-brand, #3b82f6)',
                transition: 'width 0.3s ease-in-out',
              }}
            />
          </div>
        </div>

        {/* Cancellation Controls */}
        {!isTerminal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isCancelling || status === 'CANCELLATION_REQUESTED'}
              style={{
                color: 'var(--color-danger, #ef4444)',
                borderColor: 'var(--color-danger, #ef4444)',
              }}
            >
              {isCancelling
                ? 'Requesting Cancellation...'
                : status === 'CANCELLATION_REQUESTED'
                ? 'Cancellation In Progress...'
                : 'Cancel Research Run'}
            </Button>
            {status === 'CANCELLATION_REQUESTED' && (
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Waiting for active step to checkpoint...
              </span>
            )}
          </div>
        )}

        {cancelFeedback && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Alert variant="info" title="Cancellation Status">
              {cancelFeedback}
            </Alert>
          </div>
        )}

        {status === 'CANCELLED' && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Alert variant="warning" title="Run Cancelled">
              This research execution was cancelled. Discovered sources and partial results obtained before cancellation are preserved below.
            </Alert>
          </div>
        )}

        {/* Progress Events Audit Trail */}
        {events.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <h4
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Execution Activity Audit Trail ({events.length} events)
            </h4>
            <div
              style={{
                maxHeight: '220px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                backgroundColor: 'var(--color-bg-subtle, #f8fafc)',
                padding: 'var(--space-3)',
                borderRadius: '6px',
                border: '1px solid var(--color-border-subtle, #e2e8f0)',
              }}
            >
              {events.map((evt) => (
                <div
                  key={evt.id || `${evt.sequenceNumber}-${evt.createdAt}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    paddingBottom: '4px',
                    borderBottom: '1px solid var(--color-border-subtle, #f1f5f9)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <Badge variant="neutral" style={{ fontSize: '10px', padding: '1px 4px' }}>
                      {evt.stage}
                    </Badge>
                    <span style={{ color: 'var(--color-text-primary)' }}>{evt.message}</span>
                  </div>
                  <span style={{ whiteSpace: 'nowrap', marginLeft: 'var(--space-2)' }}>
                    {new Date(evt.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

