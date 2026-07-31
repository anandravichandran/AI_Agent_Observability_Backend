import type { ILogger } from '@/core/logger/logger.interface'
import { toPagedResult, type PagedResult } from '@/core/http/pagination'
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@/core/errors/app-error'
import { ErrorCode } from '@/core/constants/error-codes'
import type { IPasswordHasher } from '@/core/security/password-hasher.interface'
import type { IAvatarStorage } from '@/infrastructure/storage/avatar-storage.interface'
import type { IMailer } from '@/infrastructure/mail/mailer.interface'
import { buildPasswordChangedEmail, type TemplateContext } from '@/infrastructure/mail/mail.templates'
import type { AppMetaConfig } from '@/config/config.types'
import type { RequestContext } from '@/modules/auth/auth.types'
import type { UserEntity } from '@/modules/auth/auth.entities'
import { SessionRevocationReason } from '@/modules/auth/auth.constants'
import type { IUserRepository } from '@/modules/auth/repositories/user.repository.interface'
import type { ISessionRepository } from '@/modules/auth/repositories/session.repository.interface'
import type { IAuditService } from '@/modules/audit/audit.service.interface'
import { AuditAction, AuditCategory } from '@/modules/audit/audit.types'
import { AVATAR_EXTENSIONS, type AvatarMimeType } from './user.constants'
import {
  toActivityDto,
  toDeviceSessionDto,
  toLoginHistoryDto,
  toProfileDto,
} from './user.mapper'
import type {
  ActivityDto,
  ActivityQueryInput,
  ChangePasswordInput,
  DeleteAccountInput,
  DeviceSessionDto,
  LoginHistoryDto,
  NotificationSettingsDto,
  ProfileDto,
  UpdateNotificationsInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from './user.types'

/** File delivered by the upload middleware (buffered in memory). */
export interface UploadedAvatar {
  readonly buffer: Buffer
  readonly mimetype: string
}

/** Login-history feed filters: page/limit plus an optional outcome. */
export interface LoginHistoryQueryInput {
  readonly outcome?: 'success' | 'failure'
  readonly page: number
  readonly limit: number
}

export interface UserServiceDependencies {
  readonly userRepository: IUserRepository
  readonly sessionRepository: ISessionRepository
  readonly passwordHasher: IPasswordHasher
  readonly avatarStorage: IAvatarStorage
  readonly mailer: IMailer
  readonly auditService: IAuditService
  readonly logger: ILogger
  readonly appConfig: AppMetaConfig
}

/** Self-service account operations port. */
export interface IUserService {
  getProfile(userId: string): Promise<ProfileDto>
  updateProfile(
    userId: string,
    input: UpdateProfileInput,
    ctx: RequestContext,
  ): Promise<ProfileDto>
  changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<void>
  deleteAccount(userId: string, input: DeleteAccountInput, ctx: RequestContext): Promise<void>
  uploadAvatar(userId: string, file: UploadedAvatar, ctx: RequestContext): Promise<ProfileDto>
  removeAvatar(userId: string, ctx: RequestContext): Promise<ProfileDto>
  updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
    ctx: RequestContext,
  ): Promise<ProfileDto>
  updateNotifications(
    userId: string,
    input: UpdateNotificationsInput,
    ctx: RequestContext,
  ): Promise<NotificationSettingsDto>
  listDeviceSessions(userId: string, currentSessionId: string): Promise<DeviceSessionDto[]>
  revokeDeviceSession(
    userId: string,
    sessionId: string,
    ctx: RequestContext,
  ): Promise<void>
  getLoginHistory(
    userId: string,
    query: LoginHistoryQueryInput,
  ): Promise<PagedResult<LoginHistoryDto>>
  getActivity(userId: string, query: ActivityQueryInput): Promise<PagedResult<ActivityDto>>
}

/**
 * Account self-service.
 *
 * Everything here is scoped to the authenticated user: the id always comes from
 * the verified token claims, never from the URL or the body. That is the
 * invariant that makes IDOR (one user reading or editing another's account) a
 * non-issue by construction rather than by a check someone might forget.
 */
export class UserService implements IUserService {
  private readonly deps: UserServiceDependencies
  private readonly templateContext: TemplateContext

  constructor(deps: UserServiceDependencies) {
    this.deps = deps
    this.templateContext = {
      appName: deps.appConfig.title,
      webUrl: deps.appConfig.webUrl,
    }
  }

  public async getProfile(userId: string): Promise<ProfileDto> {
    return toProfileDto(await this.requireUser(userId))
  }

  public async updateProfile(
    userId: string,
    input: UpdateProfileInput,
    ctx: RequestContext,
  ): Promise<ProfileDto> {
    const updated = await this.deps.userRepository.updateProfile(userId, input)

    const user = updated ?? (await this.requireUser(userId))

    await this.deps.auditService.record({
      action: AuditAction.PROFILE_UPDATE,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      ...this.actor(user),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        changed: Object.keys(input).filter((key) => input[key as keyof UpdateProfileInput]),
      },
    })

    return toProfileDto(user)
  }

  public async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.deps.userRepository.findByIdWithSecret(userId)
    if (!user) throw new NotFoundError('Account not found.')

    const matches = await this.deps.passwordHasher.compare(
      input.currentPassword,
      user.passwordHash,
    )

    if (!matches) {
      await this.deps.auditService.record({
        action: AuditAction.PASSWORD_CHANGE,
        category: AuditCategory.SECURITY,
        outcome: 'failure',
        ...this.actor(user),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        message: 'Current password did not match',
      })

      // Deliberately vague: confirms nothing about which part was wrong.
      throw new UnauthorizedError('The current password is incorrect.', {
        code: ErrorCode.INVALID_CREDENTIALS,
      })
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.newPassword)
    await this.deps.userRepository.updatePassword(userId, passwordHash)

    // Sign out every other device but keep the session the user just
    // authenticated on, so a legitimate password change is not also a logout.
    await this.deps.sessionRepository.revokeAllForUser(
      userId,
      SessionRevocationReason.PASSWORD_CHANGED,
      sessionId,
    )

    void this.deps.mailer.send({
      ...buildPasswordChangedEmail(this.templateContext, {
        firstName: user.firstName,
        ip: ctx.ip,
        at: new Date(),
      }),
      to: user.email,
    })

    await this.deps.auditService.record({
      action: AuditAction.PASSWORD_CHANGE,
      category: AuditCategory.SECURITY,
      outcome: 'success',
      ...this.actor(user),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    })
  }

  public async deleteAccount(
    userId: string,
    input: DeleteAccountInput,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.deps.userRepository.findByIdWithSecret(userId)
    if (!user) throw new NotFoundError('Account not found.')

    const matches = await this.deps.passwordHasher.compare(input.password, user.passwordHash)

    if (!matches) {
      throw new UnauthorizedError('The password is incorrect.', {
        code: ErrorCode.INVALID_CREDENTIALS,
      })
    }

    // Capture identity before the row is anonymised, so the audit record stays
    // attributable even though the account itself is gone.
    const actor = this.actor(user)

    await this.deps.avatarStorage.remove(userId)
    await this.deps.userRepository.softDelete(userId)
    await this.deps.sessionRepository.revokeAllForUser(
      userId,
      SessionRevocationReason.LOGOUT_ALL,
    )

    await this.deps.auditService.record({
      action: AuditAction.ACCOUNT_DELETE,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      ...actor,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    })
  }

  public async uploadAvatar(
    userId: string,
    file: UploadedAvatar,
    ctx: RequestContext,
  ): Promise<ProfileDto> {
    const user = await this.requireUser(userId)

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestError('An avatar image is required.')
    }

    const extension = AVATAR_EXTENSIONS[file.mimetype as AvatarMimeType]
    if (!extension) {
      throw new BadRequestError('Unsupported avatar type. Use PNG, JPEG, or WebP.', {
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      })
    }

    const avatarUrl = await this.deps.avatarStorage.save(userId, file.buffer, extension)
    await this.deps.userRepository.setAvatar(userId, avatarUrl)

    await this.deps.auditService.record({
      action: AuditAction.AVATAR_UPDATE,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      ...this.actor(user),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    })

    return toProfileDto({ ...user, avatarUrl })
  }

  public async removeAvatar(userId: string, ctx: RequestContext): Promise<ProfileDto> {
    const user = await this.requireUser(userId)

    await this.deps.avatarStorage.remove(userId)
    await this.deps.userRepository.setAvatar(userId, null)

    await this.deps.auditService.record({
      action: AuditAction.AVATAR_UPDATE,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      ...this.actor(user),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      message: 'Avatar removed',
    })

    return toProfileDto({ ...user, avatarUrl: null })
  }

  public async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
    ctx: RequestContext,
  ): Promise<ProfileDto> {
    const user = await this.requireUser(userId)

    const updated = await this.deps.userRepository.updatePreferences(userId, {
      theme: input.theme,
    })

    await this.deps.auditService.record({
      action: AuditAction.PREFERENCES_UPDATE,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      ...this.actor(user),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { theme: input.theme },
    })

    return toProfileDto(updated ?? { ...user, preferences: { theme: input.theme } })
  }

  public async updateNotifications(
    userId: string,
    input: UpdateNotificationsInput,
    ctx: RequestContext,
  ): Promise<NotificationSettingsDto> {
    const user = await this.requireUser(userId)

    // Merge the partial patch over the current settings, then pin
    // `securityAlerts` back to true regardless of what was requested. This is
    // the belt-and-braces enforcement of the rule the schema only gestures at.
    const next = {
      ...user.notifications,
      ...input,
      securityAlerts: true,
    }

    const updated = await this.deps.userRepository.updateNotifications(userId, next)

    await this.deps.auditService.record({
      action: AuditAction.NOTIFICATIONS_UPDATE,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      ...this.actor(user),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        changed: Object.keys(input).filter(
          (key) => input[key as keyof UpdateNotificationsInput] !== undefined,
        ),
      },
    })

    return (updated?.notifications ?? next) as NotificationSettingsDto
  }

  public async listDeviceSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<DeviceSessionDto[]> {
    const sessions = await this.deps.sessionRepository.findActiveByUser(userId)
    return sessions.map((session) => toDeviceSessionDto(session, currentSessionId))
  }

  public async revokeDeviceSession(
    userId: string,
    sessionId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const session = await this.deps.sessionRepository.findById(sessionId)

    if (!session) {
      throw new NotFoundError('Session not found.')
    }

    // Ownership is checked against the token's user id, not a URL parameter —
    // this is what stops one user revoking another's session.
    if (session.userId !== userId) {
      throw new ForbiddenError('You can only sign out your own sessions.')
    }

    await this.deps.sessionRepository.revoke(sessionId, SessionRevocationReason.LOGOUT)

    await this.deps.auditService.record({
      action: AuditAction.SESSION_REVOKE,
      category: AuditCategory.SECURITY,
      outcome: 'success',
      actorId: userId,
      actorEmail: null,
      actorRole: null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      targetType: 'session',
      targetId: sessionId,
    })
  }

  public async getLoginHistory(
    userId: string,
    query: LoginHistoryQueryInput,
  ): Promise<PagedResult<LoginHistoryDto>> {
    const result = await this.deps.auditService.query({
      actorId: userId,
      actions: [AuditAction.LOGIN, AuditAction.LOGIN_BLOCKED],
      ...(query.outcome ? { outcome: query.outcome } : {}),
      page: query.page,
      limit: query.limit,
    })

    return toPagedResult(
      result.items.map(toLoginHistoryDto),
      result.total,
      query.page,
      query.limit,
    )
  }

  public async getActivity(
    userId: string,
    query: ActivityQueryInput,
  ): Promise<PagedResult<ActivityDto>> {
    const result = await this.deps.auditService.query({
      actorId: userId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      page: query.page,
      limit: query.limit,
    })

    return toPagedResult(
      result.items.map(toActivityDto),
      result.total,
      query.page,
      query.limit,
    )
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.deps.userRepository.findById(userId)

    if (!user || user.deletedAt) {
      throw new NotFoundError('Account not found.')
    }

    return user
  }

  /** Identity fields shared by every audit record this service writes. */
  private actor(user: UserEntity): {
    actorId: string
    actorEmail: string
    actorRole: string
  } {
    return { actorId: user.id, actorEmail: user.email, actorRole: user.role }
  }
}
