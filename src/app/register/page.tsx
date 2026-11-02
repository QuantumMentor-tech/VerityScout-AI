'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardDescription, CardContent, Button, Input, FormField, Alert, LoadingSpinner } from '@/components/ui';

import styles from './register.module.css';

function getSafeRedirect(redirectParam: string | null): string {
  if (!redirectParam) return '/';
  if (
    redirectParam.startsWith('/') &&
    !redirectParam.startsWith('//') &&
    !redirectParam.includes('\\')
  ) {
    return redirectParam;
  }
  return '/';
}

function RegisterForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = getSafeRedirect(searchParams?.get('redirect') ?? null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          displayName: displayName.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || 'Registration failed. Please try again.');
        return;
      }

      // Success: navigate to safe redirect target
      router.push(redirectTarget);
      router.refresh();
    } catch {
      setErrorMessage('Network connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <Card variant="elevated" className={styles.authCard}>
        <CardHeader>
          <div className={styles.headerBadge}>Local-First Security</div>
          <h1 className={styles.title}>
            Create Private Account
          </h1>
          <CardDescription>
            Your account and data are stored 100% locally on your machine.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMessage && (
            <div className={styles.alertWrapper}>
              <Alert variant="danger" title="Registration Error">

                {errorMessage}
              </Alert>
            </div>
          )}


          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <FormField
              htmlFor="register-name"
              label="Display Name (Optional)"
              description="How you would like to be addressed"
            >
              <Input
                id="register-name"
                type="text"
                name="displayName"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Dr. Researcher"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              htmlFor="register-email"
              label="Email Address"
              required
              description="Will be used as your private sign-in identifier"
            >
              <Input
                id="register-email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="researcher@local.pc"
                disabled={isSubmitting}
                required
              />
            </FormField>

            <FormField
              htmlFor="register-password"
              label="Password"
              required
              description="Minimum 8 characters (scrypt encrypted)"
            >
              <div className={styles.passwordWrapper}>
                <Input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  className={styles.togglePasswordButton}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </FormField>

            <FormField
              htmlFor="register-confirm-password"
              label="Confirm Password"
              required
              description="Must match your password exactly"
            >
              <Input
                id="register-confirm-password"
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting}
                required
              />
            </FormField>


            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting}
                className={styles.submitButton}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  'Create Private Account'
                )}
              </Button>
            </div>
          </form>

          <div className={styles.footerLinks}>
            <span>Already have an account?</span>{' '}
            <Link
              href={redirectTarget !== '/' ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : '/login'}
              className={styles.link}
            >
              Sign in here
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className={styles.loadingContainer}><LoadingSpinner size="lg" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
