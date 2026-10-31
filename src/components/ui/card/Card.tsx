import React from 'react';
import styles from './Card.module.css';

export type CardVariant = 'default' | 'elevated' | 'subtle';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly variant?: CardVariant;
  readonly as?: 'div' | 'article' | 'section';
}

export function Card({
  variant = 'default',
  as: Component = 'div',
  className = '',
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const cardClasses = [styles.card, styles[variant], className].filter(Boolean).join(' ');

  return (
    <Component className={cardClasses} {...rest}>
      {children}
    </Component>
  );
}

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export function CardHeader({
  className = '',
  children,
  ...rest
}: CardHeaderProps): React.JSX.Element {
  return (
    <div className={[styles.header, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  readonly as?: 'h2' | 'h3' | 'h4';
}

export function CardTitle({
  as: Heading = 'h3',
  className = '',
  children,
  ...rest
}: CardTitleProps): React.JSX.Element {
  return (
    <Heading className={[styles.title, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Heading>
  );
}

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export function CardDescription({
  className = '',
  children,
  ...rest
}: CardDescriptionProps): React.JSX.Element {
  return (
    <p className={[styles.description, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </p>
  );
}

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export function CardContent({
  className = '',
  children,
  ...rest
}: CardContentProps): React.JSX.Element {
  return (
    <div className={[styles.content, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export function CardFooter({
  className = '',
  children,
  ...rest
}: CardFooterProps): React.JSX.Element {
  return (
    <div className={[styles.footer, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
