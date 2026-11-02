'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardDescription, CardContent, Button, Input, FormField, Alert, LoadingSpinner } from '@/components/ui';

import styles from './login.module.css';

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

function LoginForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = getSafeRedirect(searchParams?.get('redirect') ?? null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setRetryAfter(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || 'Authentication failed. Please check your credentials.');
        if (data.retryAfter) {
          setRetryAfter(data.retryAfter);
        }
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
          <div className={styles.headerBadge}>Secure Authentication</div>
          <h1 className={styles.title}>
            Sign In to VerityScout AI
          </h1>
          <CardDescription>
            Enter your credentials to access your local-first private research workspace.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMessage && (
            <div className={styles.alertWrapper}>
              <Alert variant="danger" title="Sign In Error">

                {errorMessage}
                {retryAfter && ` (Locked out: please wait ${retryAfter} seconds)`}
              </Alert>
            </div>
          )}


          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <FormField
              htmlFor="login-email"
              label="Email Address"
              required
              description="Your registered account email"
            >
              <Input
                id="login-email"
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
              htmlFor="login-password"
              label="Password"
              required
              description="Your private password"
            >
              <div className={styles.passwordWrapper}>
                <Input
                  id="login-password"

                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
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
                    <span>Verifying...</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </div>
          </form>

          <div className={styles.footerLinks}>
            <span>Don&apos;t have an account yet?</span>{' '}
            <Link
              href={redirectTarget !== '/' ? `/register?redirect=${encodeURIComponent(redirectTarget)}` : '/register'}
              className={styles.link}
            >
              Create private account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className={styles.loadingContainer}><LoadingSpinner size="lg" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
