import type { AppMetaConfig } from '@/config/config.types'
import { ErrorCode } from '@/core/constants/error-codes'
import { ConflictError, NotFoundError, UnauthorizedError } from '@/core/errors/app-error'
import type { ILogger } from '@/core/logger/logger.interface'
import type { IPasswordHasher } from '@/core/security/password-hasher.interface'
import type { IMailer } from '@/infrastructure/mail/mailer.interface'
import {
  buildAccountDeletedEmail,
  buildPasswordChangedEmail,
  type TemplateContext,
} from '@/infrastructure/mail/mail.templates'
import { SessionRevocationReason } from '@/modules/auth/auth.constants'
import type {
  NotificationSettings,
  UserEntity,
  UserPreferences,
} from '@/modules/auth/auth.entities'
import { toSessionDto } from '@/modules/auth/auth.mapper'
import type { RequestContext, SessionDto } from '@/modules/auth/auth.types'
import type { IUserRepository } from '@/modules/auth/repositories/user.repository.interface'
import type { ISessionRepository } from '@/modules/auth/repositories/session.repository.interface'
import {
  AuditAction,
  AuditCategory,
  type AuditActionValue,
  type AuditCategoryValue,
} from '@/modules/audit/audit.types'
import type { IAuditService } from '@/modules/audit/audit.service.interface'
import { toActivityDto, toLoginHistoryDto, toProfileDto } from './users.mapper'
import type { IUserService } from './users.service.interface'
import type {
  ActivityDto,
  ActivityQuery,
  ChangePasswordInput,
  DeleteAccountInput,
  LoginHistoryDto,
  LoginHistoryQuery,
  PagedResult,
  ProfileDto,
  SessionsRevokedResult,
  UpdateNotificationSettingsInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
  UploadAvatarInput,
} from './users.types'

export interface UserServiceDependencies {
  readonly users: IUserRepository
  readonly sessions: ISessionRepository
  readonly passwordHasher: IPasswordHasher
  readonly mailer: IMailer
  readonly auditService: IAuditService
  readonly logger: ILogger
  readonly appConfig: AppMetaConfig
}

/** The audit actions that make up a user's login history. */
const LOGIN_HISTORY_ACTIONS = [AuditAction.LOGIN, AuditAction.LOGIN_BLOCKED] as const

/**
 * Account self-service orchestration.
 *
 * Depends only on ports — the same discipline as {@link AuthService}. Two
 * cross-cutting rules run through it:
 *
 * - **Credential changes end every session.** Both change-password and
 *   delete-account revoke all sessions, so a compromised device cannot outlive
 *   the remediation. This is also required for consistency with the refresh
 *   guard, which invalidates any session older than `passwordChangedAt`.
 * - **Destructive actions re-authenticate.** Changing the password and closing
 *   the account both require the current password in the body, so a stolen
 *   access token alone cannot perform them.
 */
export class UserService implements IUserService {
  private readonly deps: UserServiceDependencies
  private readonly logger: ILogger
  private readonly mailContext: TemplateContext

  constructor(dependencies: UserServiceDependencies) {
    this.deps = dependencies
    this.logger = dependencies.logger.child({ component: 'UserService' })
    this.mailContext = {
      appName: dependencies.appConfig.title,
      webUrl: dependencies.appConfig.webUrl,
    }
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  public async getProfile(userId: string): Promise<ProfileDto> {
    return toProfileDto(await this.requireUser(userId))
  }

  public async updateProfile(
    userId: string,
    input: UpdateProfileInput,
    context: RequestContext,
  ): Promise<ProfileDto> {
    const updated = await this.deps.users.updateProfile(userId, {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
    })

    if (!updated) throw new NotFoundError('Account not found.')

    await this.record(AuditAction.PROFILE_UPDATE, AuditCategory.ACCOUNT, updated.id, context, {
      fields: Object.keys(input),
    })

    return toProfileDto(updated)
  }

  // -------------------------------------------------------------------------
  // Credentials & account lifecycle
  // -------------------------------------------------------------------------

  public async changePassword(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<SessionsRevokedResult> {
    const user = await this.deps.users.findByIdWithSecret(userId)
    if (!user) throw new NotFoundError('Account not found.')

    const matches = await this.deps.passwordHasher.compare(
      input.currentPassword,
      user.passwordHash,
    )

    if (!matches) {
      await this.record(
        AuditAction.PASSWORD_CHANGE,
        AuditCategory.SECURITY,
        user.id,
        context,
        { reason: 'current_password_mismatch' },
        'failure',
      )

      throw new UnauthorizedError('Your current password is incorrect.', {
        code: ErrorCode.INVALID_CREDENTIALS,
      })
    }

    // Guard against setting the same password again. The schema blocks the
    // trivial string-equality case; this catches it against the stored hash too.
    const reused = await this.deps.passwordHasher.compare(input.newPassword, user.passwordHash)
    if (reused) {
      throw new ConflictError('Choose a password you have not used before.', {
        code: ErrorCode.PASSWORD_REUSED,
      })
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.newPassword)
    await this.deps.users.updatePassword(user.id, passwordHash)

    const revokedSessions = await this.deps.sessions.revokeAllForUser(
      user.id,
      SessionRevocationReason.PASSWORD_CHANGED,
    )

    await this.record(AuditAction.PASSWORD_CHANGE, AuditCategory.SECURITY, user.id, context, {
      revokedSessions,
    })

    void this.deps.mailer.send({
      ...buildPasswordChangedEmail(this.mailContext, {
        firstName: user.firstName,
        ip: context.ip,
        at: new Date(),
      }),
      to: user.email,
    })

    return { revokedSessions }
  }

  public async deleteAccount(
    userId: string,
    input: DeleteAccountInput,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.deps.users.findByIdWithSecret(userId)
    if (!user) throw new NotFoundError('Account not found.')

    const matches = await this.deps.passwordHasher.compare(input.password, user.passwordHash)

    if (!matches) {
      await this.record(
        AuditAction.ACCOUNT_DELETE,
        AuditCategory.SECURITY,
        user.id,
        context,
        { reason: 'password_mismatch' },
        'failure',
      )

      throw new UnauthorizedError('Your password is incorrect.', {
        code: ErrorCode.INVALID_CREDENTIALS,
      })
    }

    await this.deps.users.softDelete(user.id)

    const revokedSessions = await this.deps.sessions.revokeAllForUser(
      user.id,
      SessionRevocationReason.ACCOUNT_DELETED,
    )

    await this.record(AuditAction.ACCOUNT_DELETE, AuditCategory.SECURITY, user.id, context, {
      revokedSessions,
    })

    void this.deps.mailer.send({
      ...buildAccountDeletedEmail(this.mailContext, {
        firstName: user.firstName,
        at: new Date(),
      }),
      to: user.email,
    })
  }

  // -------------------------------------------------------------------------
  // Avatar
  // -------------------------------------------------------------------------

  public async uploadAvatar(
    userId: string,
    input: UploadAvatarInput,
    context: RequestContext,
  ): Promise<ProfileDto> {
    const updated = await this.deps.users.updateAvatar(userId, input.image)
    if (!updated) throw new NotFoundError('Account not found.')

    // The image itself is deliberately kept out of the audit metadata: it is
    // large and adds no forensic value beyond "the avatar changed".
    await this.record(AuditAction.AVATAR_UPDATE, AuditCategory.ACCOUNT, updated.id, context, {
      removed: false,
    })

    return toProfileDto(updated)
  }

  public async removeAvatar(userId: string, context: RequestContext): Promise<ProfileDto> {
    const updated = await this.deps.users.updateAvatar(userId, null)
    if (!updated) throw new NotFoundError('Account not found.')

    await this.record(AuditAction.AVATAR_UPDATE, AuditCategory.ACCOUNT, updated.id, context, {
      removed: true,
    })

    return toProfileDto(updated)
  }

  // -------------------------------------------------------------------------
  // Preferences & notifications
  // -------------------------------------------------------------------------

  public async getPreferences(userId: string): Promise<UserPreferences> {
    return (await this.requireUser(userId)).preferences
  }

  public async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
    context: RequestContext,
  ): Promise<UserPreferences> {
    const current = await this.requireUser(userId)

    // Merge over the current value object so a partial update leaves untouched
    // fields intact.
    const merged: UserPreferences = {
      theme: input.theme ?? current.preferences.theme,
      language: input.language ?? current.preferences.language,
      timezone: input.timezone ?? current.preferences.timezone,
    }

    const updated = await this.deps.users.updatePreferences(userId, merged)
    if (!updated) throw new NotFoundError('Account not found.')

    await this.record(
      AuditAction.PREFERENCES_UPDATE,
      AuditCategory.ACCOUNT,
      updated.id,
      context,
      { fields: Object.keys(input) },
    )

    return updated.preferences
  }

  public async getNotificationSettings(userId: string): Promise<NotificationSettings> {
    return (await this.requireUser(userId)).notificationSettings
  }

  public async updateNotificationSettings(
    userId: string,
    input: UpdateNotificationSettingsInput,
    context: RequestContext,
  ): Promise<NotificationSettings> {
    const current = await this.requireUser(userId)

    const merged: NotificationSettings = {
      productUpdates: input.productUpdates ?? current.notificationSettings.productUpdates,
      // Security alerts cannot be disabled — a user must always be told when
      // their password changes or their account is closed.
      securityAlerts: true,
      benchmarkComplete:
        input.benchmarkComplete ?? current.notificationSettings.benchmarkComplete,
      weeklyReport: input.weeklyReport ?? current.notificationSettings.weeklyReport,
    }

    const updated = await this.deps.users.updateNotificationSettings(userId, merged)
    if (!updated) throw new NotFoundError('Account not found.')

    await this.record(
      AuditAction.NOTIFICATIONS_UPDATE,
      AuditCategory.ACCOUNT,
      updated.id,
      context,
      { fields: Object.keys(input) },
    )

    return updated.notificationSettings
  }

  // -------------------------------------------------------------------------
  // Activity & login history (read models over the audit trail)
  // -------------------------------------------------------------------------

  public async getActivity(
    userId: string,
    query: ActivityQuery,
  ): Promise<PagedResult<ActivityDto>> {
    const result = await this.deps.auditService.query({
      actorId: userId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    })

    return { items: result.items.map(toActivityDto), total: result.total }
  }

  public async getLoginHistory(
    userId: string,
    query: LoginHistoryQuery,
  ): Promise<PagedResult<LoginHistoryDto>> {
    const result = await this.deps.auditService.query({
      actorId: userId,
      actions: LOGIN_HISTORY_ACTIONS,
      ...(query.outcome ? { outcome: query.outcome } : {}),
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    })

    return { items: result.items.map(toLoginHistoryDto), total: result.total }
  }

  // -------------------------------------------------------------------------
  // Device sessions
  // -------------------------------------------------------------------------

  public async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionDto[]> {
    const sessions = await this.deps.sessions.findActiveByUser(userId)
    return sessions.map((session) => toSessionDto(session, currentSessionId))
  }

  public async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
    context: RequestContext,
  ): Promise<void> {
    const session = await this.deps.sessions.findById(sessionId)

    // Ownership check first: a user may only revoke their own sessions, and a
    // 404 (rather than 403) does not confirm the existence of someone else's.
    if (!session || session.userId !== userId) {
      throw new NotFoundError('Session not found.')
    }

    if (!session.revokedAt) {
      await this.deps.sessions.revoke(sessionId, SessionRevocationReason.REVOKED_BY_USER)
    }

    await this.record(AuditAction.SESSION_REVOKE, AuditCategory.SECURITY, userId, context, {
      sessionId,
      current: sessionId === currentSessionId,
    })
  }

  public async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
    context: RequestContext,
  ): Promise<SessionsRevokedResult> {
    const revokedSessions = await this.deps.sessions.revokeAllForUser(
      userId,
      SessionRevocationReason.REVOKED_BY_USER,
      currentSessionId,
    )

    await this.record(AuditAction.SESSION_REVOKE, AuditCategory.SECURITY, userId, context, {
      scope: 'others',
      revokedSessions,
    })

    return { revokedSessions }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.deps.users.findById(userId)
    if (!user) throw new NotFoundError('Account not found.')
    return user
  }

  /** Thin wrapper over the audit service so call sites stay a single line. */
  private async record(
    action: AuditActionValue,
    category: AuditCategoryValue,
    actorId: string,
    context: RequestContext,
    metadata: Record<string, unknown>,
    outcome: 'success' | 'failure' = 'success',
  ): Promise<void> {
    await this.deps.auditService.record({
      action,
      category,
      outcome,
      actorId,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata,
    })
  }
}
