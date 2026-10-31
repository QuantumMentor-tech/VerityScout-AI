import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryComposer } from './components/QueryComposer';
import { MAX_QUERY_LENGTH, EMPTY_QUERY_ERROR, OVER_LIMIT_ERROR } from './constants';
import { validateQuery } from './validation';

describe('QueryComposer Component & Validation (Step 16)', () => {
  it('QUERY-UNIT-001: initializes with empty query and no error message displayed', () => {
    render(<QueryComposer />);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(`0 / ${MAX_QUERY_LENGTH.toLocaleString()} characters`)).toBeInTheDocument();
  });

  it('QUERY-UNIT-002: updates query value when text is typed or pasted', () => {
    render(<QueryComposer />);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: 'Best noise-cancelling headphones under $250' } });

    expect(textarea).toHaveValue('Best noise-cancelling headphones under $250');
    expect(screen.getByText(/43 \/ 1,000 characters/i)).toBeInTheDocument();
  });

  it('QUERY-UNIT-003: preserves multiline text and newlines', () => {
    render(<QueryComposer />);

    const multilineText = 'Product: ThinkPad T14\nProcessor: AMD Ryzen 7\nBudget: Under $700';
    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: multilineText } });

    expect(textarea).toHaveValue(multilineText);
  });

  it('QUERY-UNIT-004: blocks empty input submission with inline validation error', () => {
    render(<QueryComposer />);

    const submitButton = screen.getByRole('button', { name: /validate & stage query/i });
    fireEvent.click(submitButton);

    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(EMPTY_QUERY_ERROR);
  });

  it('QUERY-UNIT-005: blocks whitespace-only input submission with inline validation error', () => {
    render(<QueryComposer />);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: '     \n  \t   ' } });

    const submitButton = screen.getByRole('button', { name: /validate & stage query/i });
    fireEvent.click(submitButton);

    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(EMPTY_QUERY_ERROR);
  });

  it('QUERY-UNIT-006: passes local validation for valid query and invokes callback', () => {
    const onQueryValidated = vi.fn();
    render(<QueryComposer onQueryValidated={onQueryValidated} />);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: '  Lenovo ThinkPad T14 Gen 3 AMD 32GB RAM  ' } });

    const submitButton = screen.getByRole('button', { name: /validate & stage query/i });
    fireEvent.click(submitButton);

    expect(screen.queryByText(EMPTY_QUERY_ERROR)).not.toBeInTheDocument();
    expect(screen.getByText(/Query Passes Local Validation/i)).toBeInTheDocument();
    expect(onQueryValidated).toHaveBeenCalledWith('Lenovo ThinkPad T14 Gen 3 AMD 32GB RAM');
  });

  it('QUERY-UNIT-007: preserves user draft text upon validation failure without rewriting it', () => {
    render(<QueryComposer />);

    const rawWhitespace = '   ';
    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: rawWhitespace } });

    const submitButton = screen.getByRole('button', { name: /validate & stage query/i });
    fireEvent.click(submitButton);

    expect(textarea).toHaveValue(rawWhitespace);
  });

  it('QUERY-UNIT-008: clicking an example query populates textarea without auto-submitting', () => {
    render(<QueryComposer />);

    const exampleButton = screen.getByRole('button', { name: /Load example query: ThinkPad T14 Gen 3/i });
    fireEvent.click(exampleButton);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    expect(textarea).toHaveValue('Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700');

    // Does not auto-submit
    expect(screen.queryByText(/Query Passes Local Validation/i)).not.toBeInTheDocument();
  });

  it('QUERY-UNIT-009: clear button resets query and clears errors/success states', () => {
    render(<QueryComposer />);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: 'Draft query' } });

    const clearButton = screen.getByRole('button', { name: /clear/i });
    expect(clearButton).not.toBeDisabled();

    fireEvent.click(clearButton);
    expect(textarea).toHaveValue('');
    expect(clearButton).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Query Passes Local Validation/i)).not.toBeInTheDocument();
  });

  it('QUERY-UNIT-010: truthful submission boundary explicitly discloses disconnected live execution', () => {
    render(<QueryComposer />);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: 'RTX 4080 Super GPU under $950' } });

    const submitButton = screen.getByRole('button', { name: /validate & stage query/i });
    fireEvent.click(submitButton);

    const disclosureNotice = screen.getByText(/Live execution \(Step 18\+ telemetry & Step 43 worker pipeline\) is currently disconnected; no live API requests were made/i);
    expect(disclosureNotice).toBeInTheDocument();
  });

  it('QUERY-UNIT-011: blocks query exceeding 1,000 characters with length error', () => {
    render(<QueryComposer />);

    const overLimitText = 'A'.repeat(1005);
    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: overLimitText } });

    const submitButton = screen.getByRole('button', { name: /validate & stage query/i });
    fireEvent.click(submitButton);

    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(OVER_LIMIT_ERROR);
  });

  it('QUERY-UNIT-012: triggers validation via Ctrl+Enter keyboard shortcut', () => {
    const onQueryValidated = vi.fn();
    render(<QueryComposer onQueryValidated={onQueryValidated} />);

    const textarea = screen.getByLabelText(/Research Question or Topic/i);
    fireEvent.change(textarea, { target: { value: 'Sony WH-1000XM5 under $300' } });

    // Press Ctrl+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(screen.getByText(/Query Passes Local Validation/i)).toBeInTheDocument();
    expect(onQueryValidated).toHaveBeenCalledWith('Sony WH-1000XM5 under $300');
  });

  describe('Pure validation helper unit checks', () => {
    it('returns invalid for empty string', () => {
      const res = validateQuery('');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe(EMPTY_QUERY_ERROR);
    });

    it('returns invalid for whitespace-only string', () => {
      const res = validateQuery('   \n\t  ');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe(EMPTY_QUERY_ERROR);
    });

    it('returns invalid for string exceeding MAX_QUERY_LENGTH', () => {
      const res = validateQuery('X'.repeat(MAX_QUERY_LENGTH + 1));
      expect(res.isValid).toBe(false);
      expect(res.error).toBe(OVER_LIMIT_ERROR);
    });

    it('returns valid with normalized string for valid query', () => {
      const res = validateQuery('  Valid research question?  ');
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
      expect(res.normalizedQuery).toBe('Valid research question?');
    });
  });
});
