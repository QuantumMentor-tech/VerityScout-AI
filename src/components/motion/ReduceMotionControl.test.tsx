import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReduceMotionControl, REDUCE_MOTION_STORAGE_KEY } from './ReduceMotionControl';

describe('ReduceMotionControl Component', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-reduce-motion');
    document.documentElement.removeAttribute('data-motion-allowed');

    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('renders the accessible checkbox with accessible name "Reduce motion"', () => {
    render(<ReduceMotionControl />);
    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('toggles user preference and synchronizes DOM attributes when clicked', () => {
    render(<ReduceMotionControl />);
    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i });

    // Enable reduced motion
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)).toBe('true');
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('true');
    expect(document.documentElement.getAttribute('data-motion-allowed')).toBeNull();

    // Disable reduced motion
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)).toBe('false');
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBeNull();
    expect(document.documentElement.getAttribute('data-motion-allowed')).toBe('true');
  });

  it('initializes from saved localStorage preference', () => {
    localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, 'true');
    render(<ReduceMotionControl />);

    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i });
    expect(checkbox).toBeChecked();
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('true');
  });

  it('respects system-level prefers-reduced-motion: reduce and disables the checkbox', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<ReduceMotionControl />);
    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i });

    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('true');

    // Clicking when disabled by OS must not change state
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('true');
  });

  it('handles localStorage exceptions gracefully without throwing or crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: LocalStorage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: LocalStorage blocked');
    });

    render(<ReduceMotionControl />);
    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i });
    expect(checkbox).toBeInTheDocument();

    // Toggling in-memory works without error
    expect(() => fireEvent.click(checkbox)).not.toThrow();
  });
});
