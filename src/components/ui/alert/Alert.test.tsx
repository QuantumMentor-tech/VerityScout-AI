import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Alert } from './Alert';

describe('Alert Component', () => {
  it('renders info alert with role="status" and title', () => {
    render(
      <Alert title="Extraction Update">
        Source document processed successfully.
      </Alert>
    );

    const alert = screen.getByRole('status');
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Extraction Update' })).toBeInTheDocument();
    expect(screen.getByText('Source document processed successfully.')).toBeInTheDocument();
  });

  it('renders danger alert with role="alert"', () => {
    render(
      <Alert variant="danger" title="Validation Failed">
        Constraint negated by source document.
      </Alert>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const handleDismiss = vi.fn();
    render(
      <Alert onDismiss={handleDismiss}>
        Dismissable notice
      </Alert>
    );

    const dismissButton = screen.getByRole('button', { name: 'Dismiss alert' });
    fireEvent.click(dismissButton);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});
