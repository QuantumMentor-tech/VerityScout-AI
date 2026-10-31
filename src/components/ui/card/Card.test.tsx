import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './Card';

describe('Card Component Family', () => {
  it('renders a composed card structure with header, title, description, content, and footer', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
          <CardDescription>Status and health indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div>Main card metrics</div>
        </CardContent>
        <CardFooter>
          <span>Footer action</span>
        </CardFooter>
      </Card>
    );

    expect(screen.getByRole('heading', { level: 3, name: 'System Overview' })).toBeInTheDocument();
    expect(screen.getByText('Status and health indicators')).toBeInTheDocument();
    expect(screen.getByText('Main card metrics')).toBeInTheDocument();
    expect(screen.getByText('Footer action')).toBeInTheDocument();
  });

  it('supports polymorphic rendering as <article> or <section>', () => {
    render(
      <Card as="article" data-testid="card-article">
        <CardContent>Article Content</CardContent>
      </Card>
    );

    const article = screen.getByTestId('card-article');
    expect(article.tagName.toLowerCase()).toBe('article');
  });

  it('supports heading levels on CardTitle (e.g. h2)', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle as="h2">Section Title</CardTitle>
        </CardHeader>
      </Card>
    );

    const heading = screen.getByRole('heading', { level: 2, name: 'Section Title' });
    expect(heading).toBeInTheDocument();
  });

  it('applies variant classes correctly', () => {
    const { rerender } = render(<Card variant="elevated" data-testid="card-variant">Content</Card>);
    expect(screen.getByTestId('card-variant')).toBeInTheDocument();

    rerender(<Card variant="subtle" data-testid="card-variant">Content</Card>);
    expect(screen.getByTestId('card-variant')).toBeInTheDocument();
  });
});
