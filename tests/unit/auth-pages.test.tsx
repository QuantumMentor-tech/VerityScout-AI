import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import LoginPage from '@/app/login/page';
import RegisterPage from '@/app/register/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
  usePathname: () => '/login',
}));

describe('Authentication Pages Interface (Step 23 UI Validation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Login Page (/login)', () => {
    it('renders the login card with accessible form controls', () => {
      render(<LoginPage />);

      expect(screen.getByRole('heading', { level: 1, name: /sign in to verityscout ai/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /create private account/i })).toBeInTheDocument();
    });

    it('toggles password visibility when show/hide button is clicked', () => {
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/^password/i);
      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleButton = screen.getByRole('button', { name: /show password/i });
      fireEvent.click(toggleButton);

      expect(passwordInput).toHaveAttribute('type', 'text');
    });

    it('displays validation alert when submitting empty credentials', async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/please enter both your email address and password/i)).toBeInTheDocument();
      });
    });
  });

  describe('Register Page (/register)', () => {
    it('renders the register card with accessible inputs', () => {
      render(<RegisterPage />);

      expect(screen.getByRole('heading', { level: 1, name: /create private account/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create private account/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /sign in here/i })).toBeInTheDocument();
    });

    it('displays client validation alert when passwords do not match', async () => {
      render(<RegisterPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole('button', { name: /create private account/i });

      fireEvent.change(emailInput, { target: { value: 'test@local.pc' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.change(confirmInput, { target: { value: 'Mismatch999!' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });
  });
});
