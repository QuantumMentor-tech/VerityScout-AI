'use client';

import React, { useState, useCallback } from 'react';
import styles from './QueryComposer.module.css';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
  FormField,
  Textarea,
  Alert,
} from '@/components/ui';
import { MAX_QUERY_LENGTH, EXAMPLE_QUERIES } from '../constants';
import { validateQuery } from '../validation';
import type { QueryComposerProps } from '../types';

export function QueryComposer({
  initialQuery = '',
  onQueryValidated,
  className = '',
}: QueryComposerProps): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState<string | null>(null);
  const [isSuccessfullyValidated, setIsSuccessfullyValidated] = useState(false);

  const charCount = query.length;
  const isOverLimit = charCount > MAX_QUERY_LENGTH;
  const isNearLimit = charCount >= MAX_QUERY_LENGTH * 0.9 && !isOverLimit;

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setQuery(val);
      // Clear stale error and success status on edit
      if (error) {
        setError(null);
      }
      if (isSuccessfullyValidated) {
        setIsSuccessfullyValidated(false);
      }
    },
    [error, isSuccessfullyValidated]
  );

  const handleValidate = useCallback(
    (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
      }

      const result = validateQuery(query);
      if (!result.isValid) {
        setError(result.error ?? 'Invalid research query.');
        setIsSuccessfullyValidated(false);
        return;
      }

      setError(null);
      setIsSuccessfullyValidated(true);
      onQueryValidated?.(result.normalizedQuery);
    },
    [query, onQueryValidated]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Allow Ctrl+Enter or Cmd+Enter to validate the query
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleValidate();
      }
      // Standard Enter key preserves natural multiline newline behavior
    },
    [handleValidate]
  );

  const handleSelectExample = useCallback((exampleText: string) => {
    setQuery(exampleText);
    setError(null);
    setIsSuccessfullyValidated(false);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setError(null);
    setIsSuccessfullyValidated(false);
  }, []);

  const getCharCounterClass = (): string => {
    if (isOverLimit) return styles.charCounterError ?? '';
    if (isNearLimit) return styles.charCounterWarning ?? '';
    return styles.charCounter ?? '';
  };

  return (
    <Card variant="default" className={[styles.container, className].filter(Boolean).join(' ')}>
      <CardHeader>
        <div className={styles.header}>
          <div className={styles.titleWrapper}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <CardTitle as="h2" className={styles.title}>
                Research Query Composer
              </CardTitle>
              <Badge variant="brand" size="sm">
                Natural Language
              </Badge>
            </div>
            <p className={styles.subtitle}>
              Formulate your research topic, target product, hard constraints, and budget in free-form natural language.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form className={styles.form} onSubmit={handleValidate} noValidate>
          <FormField
            label="Research Question or Topic"
            htmlFor="research-query-textarea"
            required
            description="Accepts multiline text. Punctuation, newlines, and specific constraints are preserved."
            {...(error ? { error } : {})}
          >
            <Textarea
              id="research-query-textarea"
              name="researchQuery"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Find me a refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700 in excellent condition..."
              rows={4}
              className={styles.textarea}
              isInvalid={Boolean(error)}
              aria-describedby="research-query-textarea-description"
            />
          </FormField>

          <div className={styles.metaRow}>
            <span className={styles.shortcutHint}>
              Tip: Press <kbd className={styles.kbd}>Ctrl</kbd> + <kbd className={styles.kbd}>Enter</kbd> to validate
            </span>
            <span
              className={getCharCounterClass()}
              aria-live="polite"
              aria-atomic="true"
            >
              {charCount.toLocaleString()} / {MAX_QUERY_LENGTH.toLocaleString()} characters
            </span>
          </div>

          <div className={styles.exampleSection}>
            <span className={styles.exampleHeading}>Example research questions:</span>
            <div className={styles.exampleChips}>
              {EXAMPLE_QUERIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.exampleButton}
                  onClick={() => handleSelectExample(item.query)}
                  aria-label={`Load example query: ${item.label}`}
                >
                  <span style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--color-accent-cyan-text)' }}>
                    [{item.category}]
                  </span>{' '}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {isSuccessfullyValidated && (
            <div className={styles.statusCard}>
              <Alert variant="success" title="Query Passes Local Validation">
                Your research question contains valid content and fits within length constraints. 
                Constraint extraction and negative filter editing will connect in Step 17. 
                Live execution (Step 18+ telemetry & Step 43 worker pipeline) is currently disconnected; no live API requests were made.
              </Alert>
            </div>
          )}

          <div className={styles.actionsBar}>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleClear}
              disabled={query.length === 0}
            >
              Clear
            </Button>
            <Button type="submit" variant="primary" size="md">
              Validate &amp; Stage Query
            </Button>
          </div>
        </form>
      </CardContent>

      <CardFooter>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          Step 16 Feature • Deterministic Local Validation Only • No External Network Requests
        </span>
      </CardFooter>
    </Card>
  );
}
