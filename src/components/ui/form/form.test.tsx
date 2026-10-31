import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { Checkbox } from './Checkbox';
import { FormField } from './FormField';

describe('Form Controls & FormField', () => {
  describe('Input', () => {
    it('renders native input and handles value changes', () => {
      const handleChange = vi.fn();
      render(<Input id="test-input" placeholder="Enter text" onChange={handleChange} />);

      const input = screen.getByPlaceholderText('Enter text');
      expect(input).toBeInTheDocument();
      expect(input).not.toHaveAttribute('aria-invalid');

      fireEvent.change(input, { target: { value: 'Query string' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('sets aria-invalid="true" when isInvalid prop is true', () => {
      render(<Input id="error-input" isInvalid placeholder="Invalid input" />);
      const input = screen.getByPlaceholderText('Invalid input');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('supports disabled and readOnly states', () => {
      render(<Input id="disabled-input" disabled readOnly placeholder="Locked input" />);
      const input = screen.getByPlaceholderText('Locked input');
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute('readonly');
    });
  });

  describe('Textarea', () => {
    it('renders native textarea and handles multiline text', () => {
      const handleChange = vi.fn();
      render(<Textarea placeholder="Enter research notes" onChange={handleChange} />);

      const textarea = screen.getByPlaceholderText('Enter research notes');
      expect(textarea.tagName.toLowerCase()).toBe('textarea');

      fireEvent.change(textarea, { target: { value: 'Line 1\nLine 2' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('sets aria-invalid="true" when isInvalid is true', () => {
      render(<Textarea isInvalid placeholder="Bad input" />);
      expect(screen.getByPlaceholderText('Bad input')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Checkbox', () => {
    it('renders real checkbox and updates checked state', () => {
      function CheckboxTestWrapper() {
        const [checked, setChecked] = useState(false);
        return (
          <Checkbox
            id="terms"
            label="Accept terms"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
        );
      }

      render(<CheckboxTestWrapper />);

      const checkbox = screen.getByRole('checkbox', { name: 'Accept terms' });
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it('disables input when disabled prop is passed', () => {
      render(<Checkbox id="locked-checkbox" label="Locked" disabled />);
      const checkbox = screen.getByRole('checkbox', { name: 'Locked' });
      expect(checkbox).toBeDisabled();
    });
  });

  describe('FormField', () => {
    it('associates label with control, renders description and error alert', () => {
      render(
        <FormField
          label="Research Target URL"
          htmlFor="target-url"
          required
          description="Must be a valid HTTPS web address"
          error="Invalid URL format"
        >
          <Input id="target-url" isInvalid aria-describedby="target-url-description target-url-error" />
        </FormField>
      );

      const label = screen.getByText('Research Target URL');
      expect(label).toBeInTheDocument();
      expect(label).toHaveAttribute('for', 'target-url');

      const description = screen.getByText('Must be a valid HTTPS web address');
      expect(description).toHaveAttribute('id', 'target-url-description');

      const error = screen.getByRole('alert');
      expect(error).toHaveAttribute('id', 'target-url-error');
      expect(error).toHaveTextContent('Invalid URL format');
    });
  });
});
