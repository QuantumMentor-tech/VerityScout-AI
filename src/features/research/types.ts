/**
 * ==============================================================================
 * VerityScout AI — Query Composer Feature Types
 * ==============================================================================
 * Governed by: Step 16 (Natural-Language Query Composer)
 * Requirements: UR-001, AC-001
 * ==============================================================================
 */

export interface ValidationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly normalizedQuery: string;
}

export interface ExampleQuery {
  readonly id: string;
  readonly label: string;
  readonly query: string;
  readonly category: string;
}

export interface QueryComposerProps {
  readonly initialQuery?: string;
  readonly onQueryValidated?: (query: string) => void;
  readonly className?: string;
}
