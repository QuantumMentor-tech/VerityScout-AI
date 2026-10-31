import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Tooltip } from './Tooltip';

describe('Tooltip Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders trigger without visible tooltip initially', () => {
    render(
      <Tooltip content="Deterministic verification count" id="tooltip-count">
        <button type="button">Evidence Count</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Evidence Count' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).not.toHaveAttribute('aria-describedby');

    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows tooltip immediately on keyboard focus and links aria-describedby', () => {
    render(
      <Tooltip content="Detailed model instructions" id="tooltip-info">
        <button type="button">Help</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Help' });
    fireEvent.focus(trigger);

    expect(trigger).toHaveAttribute('aria-describedby', 'tooltip-info');
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
    expect(tooltip).toHaveTextContent('Detailed model instructions');

    fireEvent.blur(trigger);
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('shows tooltip on mouseEnter after delayMs and hides on mouseLeave', () => {
    render(
      <Tooltip content="Hover info" delayMs={100} id="tooltip-hover">
        <button type="button">Hover Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Hover Trigger' });
    fireEvent.mouseEnter(trigger);

    // Before delay elapsed, not yet visible
    expect(trigger).not.toHaveAttribute('aria-describedby');

    // Fast-forward delay
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(trigger).toHaveAttribute('aria-describedby', 'tooltip-hover');

    fireEvent.mouseLeave(trigger);
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('dismisses tooltip on Escape key without losing trigger focus', () => {
    render(
      <Tooltip content="Escapable tooltip" id="tooltip-escape">
        <button type="button">Active Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Active Trigger' });
    fireEvent.focus(trigger);
    expect(trigger).toHaveAttribute('aria-describedby', 'tooltip-escape');

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });
});
