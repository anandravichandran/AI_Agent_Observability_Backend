import type { ILogger } from '@/core/logger/logger.interface'
import {
  resolveSort,
  toPagedResult,
  type PagedResult,
} from '@/core/http/pagination'
import { ForbiddenError, NotFoundError } from '@/core/errors/app-error'
import type { RequestContext } from '@/modules/auth/auth.types'
import type { UserEntity } from '@/modules/auth/auth.entities'
import {
  SessionRevocationReason,
  UserRole,
  UserStatus,
  type UserRoleValue,
  type UserStatusValue,
} from '@/modules/auth/auth.constants'
import type { AuthenticatedActor } from '@/modules/auth/auth.types'
import type { IUserRepository } from '@/modules/auth/repositories/user.repository.interface'
import type { ISessionRepository } from '@/modules/auth/repositories/session.repository.interface'
import type { IAuditService } from '@/modules/audit/audit.service.interface'
import { AuditAction, AuditCategory } from '@/modules/audit/audit.types'
import { USER_SORT_FIELDS } from '@/modules/users/user.constants'
import { toDeviceSessionDto } from '@/modules/users/user.mapper'
import type { DeviceSessionDto } from '@/modules/users/user.types'
import type {
  AdminUserDetailDto,
  AdminUserDto,
  ListUsersQueryInput,
} from './admin.types'

export interface AdminServiceDependencies {
  readonly userRepository: IUserRepository
  readonly sessionRepository: ISessionRepository
  readonly auditService: IAuditService
  readonly logger: ILogger
}

/** Administrative account-management port. */
export interface IAdminService {
  listUsers(query: ListUsersQueryInput): Promise<PagedResult<AdminUserDto>>
  getUser(targetId: string): Promise<AdminUserDetailDto>
  updateRole(
    actor: AuthenticatedActor,
    targetId: string,
    role: UserRoleValue,
    ctx: RequestContext,
  ): Promise<AdminUserDto>
  updateStatus(
    actor: AuthenticatedActor,
    targetId: string,
    status: UserStatusValue,
    ctx: RequestContext,
  ): Promise<AdminUserDto>
  revokeUserSessions(
    actor: AuthenticatedActor,
    targetId: string,
    ctx: RequestContext,
  ): Promise<number>
  listUserSessions(targetId: string): Promise<DeviceSessionDto[]>
}

/**
 * Administrator account management.
 *
 * Two privilege rules are enforced here, above and beyond the role gate at the
 * route. They exist because a compromised or careless admin should not be able
 * to lock out every other administrator or escalate through self-service:
 *
 * 1. An admin cannot change their *own* role or status through this surface —
 *    that path leads to a workspace with zero administrators.
 * 2. An admin cannot modify *another* administrator at all. Peer admins are
 *    off-limits to each other; there is no super-admin tier.
 */
export class AdminService implements IAdminService {
  private readonly deps: AdminServiceDependencies

  constructor(deps: AdminServiceDependencies) {
    this.deps = deps
  }

  public async listUsers(query: ListUsersQueryInput): Promise<PagedResult<AdminUserDto>> {
    // The sort field is whitelisted before it ever reaches the database, so a
    // crafted `sortBy` cannot probe for or sort on fields that are not exposed.
    const sort = resolveSort(
      query.sortBy,
      USER_SORT_FIELDS,
      { field: 'createdAt', order: 'desc' },
      query.sortOrder,
    )

    const result = await this.deps.userRepository.findMany({
      ...(query.search ? { search: query.search } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      page: query.page,
      limit: query.limit,
      sort,
    })

    return toPagedResult(
      result.items.map((user) => this.toDto(user)),
      result.total,
      query.page,
      query.limit,
    )
  }

  public async getUser(targetId: string): Promise<AdminUserDetailDto> {
    const user = await this.requireUser(targetId)
    const activeSessions = await this.deps.sessionRepository.countActiveByUser(targetId)

    return this.toDetailDto(user, activeSessions)
  }

  public async updateRole(
    actor: AuthenticatedActor,
    targetId: string,
    role: UserRoleValue,
    ctx: RequestContext,
  ): Promise<AdminUserDto> {
    const target = await this.requireUser(targetId)
    this.guardMutableTarget(actor, target)

    const updated = await this.deps.userRepository.updateRole(targetId, role)

    // Force re-authentication: existing access tokens still carry the old role
    // claim, so the target's sessions are revoked to make the change immediate
    // rather than waiting up to one token TTL.
    await this.deps.sessionRepository.revokeAllForUser(
      targetId,
      SessionRevocationReason.ADMIN_REVOKED,
    )

    await this.deps.auditService.record({
      action: AuditAction.ADMIN_ROLE_CHANGE,
      category: AuditCategory.ADMINISTRATION,
      outcome: 'success',
      ...this.actorFields(actor),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      targetType: 'user',
      targetId,
      metadata: { from: target.role, to: role },
    })

    return this.toDto(updated ?? { ...target, role })
  }

  public async updateStatus(
    actor: AuthenticatedActor,
    targetId: string,
    status: UserStatusValue,
    ctx: RequestContext,
  ): Promise<AdminUserDto> {
    const target = await this.requireUser(targetId)
    this.guardMutableTarget(actor, target)

    const updated = await this.deps.userRepository.updateStatus(targetId, status)

    // Suspending an account must sign it out everywhere, or a suspension is a
    // delay rather than a revocation of access.
    if (status === UserStatus.SUSPENDED) {
      await this.deps.sessionRepository.revokeAllForUser(
        targetId,
        SessionRevocationReason.ADMIN_REVOKED,
      )
    }

    await this.deps.auditService.record({
      action: AuditAction.ADMIN_STATUS_CHANGE,
      category: AuditCategory.ADMINISTRATION,
      outcome: 'success',
      ...this.actorFields(actor),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      targetType: 'user',
      targetId,
      metadata: { from: target.status, to: status },
    })

    return this.toDto(updated ?? { ...target, status })
  }

  public async revokeUserSessions(
    actor: AuthenticatedActor,
    targetId: string,
    ctx: RequestContext,
  ): Promise<number> {
    const target = await this.requireUser(targetId)
    this.guardMutableTarget(actor, target)

    const revoked = await this.deps.sessionRepository.revokeAllForUser(
      targetId,
      SessionRevocationReason.ADMIN_REVOKED,
    )

    await this.deps.auditService.record({
      action: AuditAction.ADMIN_SESSION_REVOKE,
      category: AuditCategory.ADMINISTRATION,
      outcome: 'success',
      ...this.actorFields(actor),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      targetType: 'user',
      targetId,
      metadata: { revokedSessions: revoked },
    })

    return revoked
  }

  public async listUserSessions(targetId: string): Promise<DeviceSessionDto[]> {
    await this.requireUser(targetId)

    const sessions = await this.deps.sessionRepository.findActiveByUser(targetId)
    return sessions.map((session) => toDeviceSessionDto(session, ''))
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireUser(targetId: string): Promise<UserEntity> {
    const user = await this.deps.userRepository.findById(targetId)
    if (!user) throw new NotFoundError('User not found.')
    return user
  }

  /**
   * Enforces the two privilege rules against the acting admin.
   * Reading is unrestricted; mutation goes through here.
   */
  private guardMutableTarget(actor: AuthenticatedActor, target: UserEntity): void {
    if (target.id === actor.id) {
      throw new ForbiddenError(
        'Use the self-service endpoints to change your own account.',
      )
    }

    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenError('Administrators cannot modify one another.')
    }
  }

  private actorFields(actor: AuthenticatedActor): {
    actorId: string
    actorEmail: string
    actorRole: string
  } {
    return { actorId: actor.id, actorEmail: actor.email, actorRole: actor.role }
  }

  private toDto(user: UserEntity): AdminUserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role,
      status: user.status,
      isEmailVerified: user.isEmailVerified,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }
  }

  private toDetailDto(user: UserEntity, activeSessions: number): AdminUserDetailDto {
    return {
      ...this.toDto(user),
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil?.toISOString() ?? null,
      lastLoginIp: user.lastLoginIp,
      deletedAt: user.deletedAt?.toISOString() ?? null,
      activeSessions,
    }
  }
}
