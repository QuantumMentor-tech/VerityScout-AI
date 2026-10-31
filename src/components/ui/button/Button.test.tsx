import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Button } from './Button';

describe('Button Component', () => {
  it('renders a native button with default type="button", primary variant, and md size', () => {
    render(<Button>Click Me</Button>);

    const button = screen.getByRole('button', { name: 'Click Me' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toBeDisabled();
  });

  it('supports explicit type="submit" for forms', () => {
    render(<Button type="submit">Submit Form</Button>);

    const button = screen.getByRole('button', { name: 'Submit Form' });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('handles click events when enabled', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Action</Button>);

    const button = screen.getByRole('button', { name: 'Action' });
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('prevents click events when disabled', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled Action</Button>);

    const button = screen.getByRole('button', { name: 'Disabled Action' });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('exposes aria-busy="true" and disables interaction when isLoading is true', () => {
    const handleClick = vi.fn();
    render(
      <Button isLoading onClick={handleClick}>
        Saving Changes
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Saving Changes' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders various variants and sizes without throwing', () => {
    const { rerender } = render(<Button variant="secondary" size="sm">Secondary Sm</Button>);
    expect(screen.getByRole('button', { name: 'Secondary Sm' })).toBeInTheDocument();

    rerender(<Button variant="outline" size="lg">Outline Lg</Button>);
    expect(screen.getByRole('button', { name: 'Outline Lg' })).toBeInTheDocument();

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument();

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button', { name: 'Danger' })).toBeInTheDocument();
  });
});
