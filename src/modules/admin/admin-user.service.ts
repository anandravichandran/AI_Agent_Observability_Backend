import { ForbiddenError, NotFoundError } from '@/core/errors/app-error'
import { ErrorCode } from '@/core/constants/error-codes'
import { SessionRevocationReason, UserStatus } from '@/modules/auth/auth.constants'
import type { RequestContext } from '@/modules/auth/auth.types'
import type { IUserRepository } from '@/modules/auth/repositories/user.repository.interface'
import type { ISessionRepository } from '@/modules/auth/repositories/session.repository.interface'
import {
  AuditAction,
  AuditCategory,
  type AuditActionValue,
} from '@/modules/audit/audit.types'
import type { IAuditService } from '@/modules/audit/audit.service.interface'
import { toAdminUserDto } from './admin.mapper'
import type { IAdminUserService } from './admin-user.service.interface'
import type {
  AdminUpdateUserInput,
  AdminUserDto,
  AdminUserListQuery,
  AdminUsersResult,
  SessionsRevokedResult,
} from './admin.types'

export interface AdminUserServiceDependencies {
  readonly users: IUserRepository
  readonly sessions: ISessionRepository
  readonly auditService: IAuditService
}

/**
 * Administrator user-management orchestration.
 *
 * A single safety rule shapes every mutating method: **an administrator cannot
 * act on their own account here.** Demoting or suspending yourself through the
 * admin API is almost always a mistake (and a way to strand a workspace with no
 * administrators), so those operations are pushed to the self-service surface,
 * where the intent is unambiguous.
 */
export class AdminUserService implements IAdminUserService {
  private readonly deps: AdminUserServiceDependencies

  constructor(dependencies: AdminUserServiceDependencies) {
    this.deps = dependencies
  }

  public async listUsers(query: AdminUserListQuery): Promise<AdminUsersResult> {
    const result = await this.deps.users.list(query)
    return { items: result.items.map(toAdminUserDto), total: result.total }
  }

  public async getUser(userId: string): Promise<AdminUserDto> {
    const user = await this.deps.users.findById(userId)
    if (!user) throw new NotFoundError('User not found.')
    return toAdminUserDto(user)
  }

  public async updateUser(
    actorId: string,
    userId: string,
    input: AdminUpdateUserInput,
    context: RequestContext,
  ): Promise<AdminUserDto> {
    this.refuseSelfTarget(actorId, userId)

    const updated = await this.deps.users.updateAdminFields(userId, {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })

    if (!updated) throw new NotFoundError('User not found.')

    // Suspending an account should also end its live sessions; leaving them
    // active would let a suspended user keep working until their tokens expire.
    let revokedSessions = 0
    if (input.status === UserStatus.SUSPENDED) {
      revokedSessions = await this.deps.sessions.revokeAllForUser(
        userId,
        SessionRevocationReason.ADMIN_REVOKED,
      )
    }

    await this.record(AuditAction.ADMIN_USER_UPDATE, actorId, userId, context, {
      changes: input,
      revokedSessions,
    })

    return toAdminUserDto(updated)
  }

  public async deleteUser(
    actorId: string,
    userId: string,
    context: RequestContext,
  ): Promise<void> {
    this.refuseSelfTarget(actorId, userId)

    const deleted = await this.deps.users.softDelete(userId)
    if (!deleted) throw new NotFoundError('User not found.')

    const revokedSessions = await this.deps.sessions.revokeAllForUser(
      userId,
      SessionRevocationReason.ACCOUNT_DELETED,
    )

    await this.record(AuditAction.ADMIN_USER_DELETE, actorId, userId, context, {
      revokedSessions,
    })
  }

  public async revokeUserSessions(
    actorId: string,
    userId: string,
    context: RequestContext,
  ): Promise<SessionsRevokedResult> {
    const user = await this.deps.users.findById(userId)
    if (!user) throw new NotFoundError('User not found.')

    const revokedSessions = await this.deps.sessions.revokeAllForUser(
      userId,
      SessionRevocationReason.ADMIN_REVOKED,
    )

    await this.record(AuditAction.ADMIN_USER_SESSIONS_REVOKE, actorId, userId, context, {
      revokedSessions,
    })

    return { revokedSessions }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private refuseSelfTarget(actorId: string, userId: string): void {
    if (actorId === userId) {
      throw new ForbiddenError(
        'Manage your own account from account settings, not the admin API.',
        { code: ErrorCode.FORBIDDEN },
      )
    }
  }

  private async record(
    action: AuditActionValue,
    actorId: string,
    targetId: string,
    context: RequestContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.auditService.record({
      action,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      actorId,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      targetType: 'user',
      targetId,
      metadata,
    })
  }
}
