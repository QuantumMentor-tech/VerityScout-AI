/**
 * ==============================================================================
 * VerityScout AI — Shared UI Component Primitives
 * ==============================================================================
 * Governed by: Step 14 (Reusable UI Components)
 * Phase: 3 of 12 (Core Application Shell & Design Foundations)
 *
 * Export boundaries: Only presentation-safe, typed, reusable UI primitives.
 * ==============================================================================
 */

// Button
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './button/Button';

// Card
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
  type CardVariant,
  type CardHeaderProps,
  type CardTitleProps,
  type CardDescriptionProps,
  type CardContentProps,
  type CardFooterProps,
} from './card/Card';

// Form Controls
export { Input, type InputProps, type InputSize } from './form/Input';
export { Textarea, type TextareaProps } from './form/Textarea';
export { Checkbox, type CheckboxProps } from './form/Checkbox';
export { FormField, type FormFieldProps } from './form/FormField';

// Dialog
export { Dialog, type DialogProps, type DialogSize } from './dialog/Dialog';

// Tooltip
export { Tooltip, type TooltipProps, type TooltipPosition } from './tooltip/Tooltip';

// Badge
export { Badge, type BadgeProps, type BadgeVariant, type BadgeSize } from './badge/Badge';

// Alert
export { Alert, type AlertProps, type AlertVariant } from './alert/Alert';

// State Primitives
export { LoadingSpinner, type LoadingSpinnerProps, type SpinnerSize } from './state/LoadingSpinner';
export { EmptyState, type EmptyStateProps } from './state/EmptyState';
export { SafeErrorState, type SafeErrorStateProps } from './state/SafeErrorState';
