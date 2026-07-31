import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ErrorCode } from '@/core/constants/error-codes'
import { ForbiddenError, UnauthorizedError } from '@/core/errors/app-error'
import { ROLE_RANK, type UserRoleValue } from '@/modules/auth/auth.constants'
import { AuditAction, AuditCategory } from '@/modules/audit/audit.types'
import type { IAuditService } from '@/modules/audit/audit.service.interface'

export interface AuthorizeOptions {
  /** Optional. When supplied, denials are written to the audit trail. */
  readonly auditService?: IAuditService
}

/**
 * Role gate. Must be mounted *after* `authenticate`.
 *
 * The 401/403 split is deliberate and load-bearing:
 * - **401** means “I do not know who you are” — retry with credentials.
 * - **403** means “I know exactly who you are, and the answer is still no” —
 *   retrying is pointless.
 *
 * Conflating them either invites useless retry loops or leaks that a resource
 * exists to callers who cannot access it.
 */
export const createAuthorize = (options: AuthorizeOptions = {}) => {
  const { auditService } = options

  const deny = (req: Request, required: string, actual?: string): ForbiddenError => {
    void auditService?.record({
      action: AuditAction.ACCESS_DENIED,
      category: AuditCategory.AUTHORIZATION,
      outcome: 'failure',
      actorId: req.user?.id ?? null,
      actorEmail: req.user?.email ?? null,
      actorRole: actual ?? null,
      ip: req.ip ?? 'unknown',
      userAgent: req.get('user-agent') ?? 'unknown',
      requestId: req.id,
      targetType: 'route',
      targetId: `${req.method} ${req.originalUrl}`,
      message: `Requires ${required}, actor holds ${actual ?? 'none'}`,
    })

    return new ForbiddenError(
      'Your role does not permit this action.',
      { code: ErrorCode.INSUFFICIENT_ROLE },
    )
  }

  /**
   * Requires membership of an explicit role set.
   * Use when permission is categorical rather than hierarchical.
   */
  const requireRoles = (...roles: UserRoleValue[]): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.user) {
        next(new UnauthorizedError('Authentication is required.'))
        return
      }

      if (!roles.includes(req.user.role)) {
        next(deny(req, roles.join(' | '), req.user.role))
        return
      }

      next()
    }
  }

  /**
   * Requires a role at or above the given privilege level.
   * Use when permission is a ladder — admin implicitly satisfies engineer.
   */
  const requireMinimumRole = (minimum: UserRoleValue): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.user) {
        next(new UnauthorizedError('Authentication is required.'))
        return
      }

      if (ROLE_RANK[req.user.role] < ROLE_RANK[minimum]) {
        next(deny(req, `at least ${minimum}`, req.user.role))
        return
      }

      next()
    }
  }

  /**
   * Allows the resource owner, or any role at or above `fallbackRole`.
   *
   * `getOwnerId` reads the owning user id from the request. Ownership is checked
   * first so a user always reaches their own resources regardless of role.
   */
  const requireSelfOrRole = (
    getOwnerId: (req: Request) => string | undefined,
    fallbackRole: UserRoleValue,
  ): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.user) {
        next(new UnauthorizedError('Authentication is required.'))
        return
      }

      if (getOwnerId(req) === req.user.id) {
        next()
        return
      }

      if (ROLE_RANK[req.user.role] >= ROLE_RANK[fallbackRole]) {
        next()
        return
      }

      next(deny(req, `owner or ${fallbackRole}`, req.user.role))
    }
  }

  return { requireRoles, requireMinimumRole, requireSelfOrRole }
}

export type Authorize = ReturnType<typeof createAuthorize>
