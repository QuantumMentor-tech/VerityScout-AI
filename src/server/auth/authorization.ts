import 'server-only';
import { getCurrentUser, SafeUser } from './session';
import { withUserContext, TransactionContext } from '../persistence/transaction';
import { logger } from '@/lib/logging/logger';

/**
 * Standard typed authorization errors enforcing safe, non-disclosing error messages.
 */
export class AuthenticationRequiredError extends Error {
  readonly code = 'UNAUTHENTICATED';
  readonly statusCode = 401;

  constructor(message: string = 'Authentication required to access this resource') {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}

export class AuthorizationForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;

  constructor(message: string = 'Access to this resource is forbidden') {
    super(message);
    this.name = 'AuthorizationForbiddenError';
  }
}

export class ResourceNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor(resourceName: string = 'Resource') {
    super(`${resourceName} not found`);
    this.name = 'ResourceNotFoundError';
  }
}

/**
 * Verified caller identity context required for protected operations.
 */
export interface AuthorizationContext {
  readonly user: SafeUser;
  readonly userId: string;
}

/**
 * Resolves the authenticated caller from the server-side session cookie.
 * Fails closed by throwing AuthenticationRequiredError if unauthenticated.
 */
export async function requireAuthenticatedCaller(): Promise<AuthorizationContext> {
  const user = await getCurrentUser();

  if (!user || !user.id) {
    throw new AuthenticationRequiredError();
  }

  return {
    user,
    userId: user.id,
  };
}

/**
 * Verifies that the caller's verified identity matches the resource's owner identifier.
 *
 * Security Policy (SEC-008, SEC-010):
 * - If resourceOwnerId !== callerUserId, we throw ResourceNotFoundError (404) by default
 *   rather than 403 Forbidden. This prevents unauthorized attackers from enumerating
 *   the existence of valid resource UUIDs belonging to other users.
 */
export function assertResourceOwnership(
  resourceOwnerId: string | null | undefined,
  callerUserId: string,
  resourceName: string = 'Resource',
  discloseForbidden: boolean = false
): void {
  if (!resourceOwnerId || resourceOwnerId !== callerUserId) {
    logger.warn('AUTHZ_CROSS_TENANT_VIOLATION_DENIED', 'Unauthorized cross-user access attempt blocked', {
      callerUserId,
      targetOwnerId: resourceOwnerId ?? 'null',
      resourceName,
    });

    if (discloseForbidden) {
      throw new AuthorizationForbiddenError(`You do not have permission to access this ${resourceName.toLowerCase()}`);
    }
    // Default safe denial: 404 Not Found prevents resource enumeration
    throw new ResourceNotFoundError(resourceName);
  }
}

/**
 * Validates parent-child integrity across linked records to prevent ID substitution attacks.
 * Verifies that both the parent entity and child entity are owned by the exact same user.
 */
export function assertParentChildOwnership(
  parentOwnerId: string,
  childOwnerId: string,
  associationName: string = 'Entity relationship'
): void {
  if (!parentOwnerId || !childOwnerId || parentOwnerId !== childOwnerId) {
    logger.warn('AUTHZ_PARENT_CHILD_SUBSTITUTION_ATTACK', 'Blocked forged parent-child association between different owners', {
      parentOwnerId,
      childOwnerId,
      associationName,
    });
    throw new AuthorizationForbiddenError(`Invalid ${associationName}: parent and child resources belong to different owners.`);
  }
}

/**
 * Executes an operation within a verified authenticated context.
 */
export async function withAuthorizedScope<T>(
  operation: (ctx: AuthorizationContext) => Promise<T>
): Promise<T> {
  const ctx = await requireAuthenticatedCaller();
  return operation(ctx);
}

/**
 * Executes an operation with dual-layer defense-in-depth:
 * 1. Establishes verified application-layer AuthorizationContext.
 * 2. Establishes transaction-scoped PostgreSQL Row-Level Security identity via withUserContext.
 */
export async function withAuthorizedDatabaseScope<T>(
  operation: (ctx: AuthorizationContext, tx: TransactionContext) => Promise<T>
): Promise<T> {
  const ctx = await requireAuthenticatedCaller();
  return withUserContext(ctx.userId, (tx) => operation(ctx, tx));
}
