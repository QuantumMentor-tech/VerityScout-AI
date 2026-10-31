import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Badge } from './Badge';

describe('Badge Component', () => {
  it('renders default neutral badge', () => {
    render(<Badge>Planned</Badge>);

    const badge = screen.getByText('Planned');
    expect(badge).toBeInTheDocument();
  });

  it('renders semantic variants', () => {
    const { rerender } = render(<Badge variant="success">Verified</Badge>);
    expect(screen.getByText('Verified')).toBeInTheDocument();

    rerender(<Badge variant="warning">Stale</Badge>);
    expect(screen.getByText('Stale')).toBeInTheDocument();

    rerender(<Badge variant="danger">Failed</Badge>);
    expect(screen.getByText('Failed')).toBeInTheDocument();

    rerender(<Badge variant="info">In Progress</Badge>);
    expect(screen.getByText('In Progress')).toBeInTheDocument();

    rerender(<Badge variant="brand">Engine Active</Badge>);
    expect(screen.getByText('Engine Active')).toBeInTheDocument();
  });

  it('renders dot indicator when dot is true', () => {
    const { container } = render(<Badge dot>Active</Badge>);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });
});
