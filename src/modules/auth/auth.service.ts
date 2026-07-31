import crypto from 'node:crypto'
import type { AppMetaConfig, AuthConfig, OtpConfig } from '@/config/config.types'
import { ErrorCode } from '@/core/constants/error-codes'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '@/core/errors/app-error'
import type { ILogger } from '@/core/logger/logger.interface'
import type { IPasswordHasher } from '@/core/security/password-hasher.interface'
import type { IOtpService } from '@/core/security/otp-service.interface'
import type { ITokenService } from '@/core/security/token-service.interface'
import { dateFromNow } from '@/core/utils/time'
import type { IMailer } from '@/infrastructure/mail/mailer.interface'
import {
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  buildWelcomeEmail,
  type TemplateContext,
} from '@/infrastructure/mail/mail.templates'
import type { IAuditService } from '@/modules/audit/audit.service.interface'
import { AuditAction, AuditCategory } from '@/modules/audit/audit.types'
import {
  DEFAULT_USER_ROLE,
  OtpPurpose,
  SessionRevocationReason,
  TokenType,
  UserStatus,
  type OtpPurposeValue,
} from './auth.constants'
import type { UserEntity } from './auth.entities'
import { toSessionDto, toUserDto } from './auth.mapper'
import type { IAuthService } from './auth.service.interface'
import type {
  AuthenticationResult,
  ForgotPasswordInput,
  LoginInput,
  OtpDispatchResult,
  RegisterInput,
  RegistrationResult,
  RequestContext,
  ResendOtpInput,
  ResetPasswordInput,
  SessionDto,
  TokenPair,
  UserDto,
  VerifyOtpInput,
} from './auth.types'
import type { IOtpRepository } from './repositories/otp.repository.interface'
import type { ISessionRepository } from './repositories/session.repository.interface'
import type { IUserRepository } from './repositories/user.repository.interface'

export interface AuthServiceDependencies {
  readonly users: IUserRepository
  readonly otps: IOtpRepository
  readonly sessions: ISessionRepository
  readonly passwordHasher: IPasswordHasher
  readonly tokenService: ITokenService
  readonly otpService: IOtpService
  readonly mailer: IMailer
  readonly auditService: IAuditService
  readonly logger: ILogger
  readonly authConfig: AuthConfig
  readonly otpConfig: OtpConfig
  readonly appConfig: AppMetaConfig
}

/**
 * Authentication orchestration.
 *
 * Depends only on ports — no Mongoose, no Express, no bcrypt, no Nodemailer.
 * Every collaborator arrives through the constructor, so the whole class can be
 * exercised with in-memory fakes.
 *
 * Two themes run through the implementation and explain most of its shape:
 *
 * - **No user enumeration.** Registration, login, and password recovery all
 *   behave identically whether or not an address exists, in both response body
 *   and response time. An endpoint that reveals which addresses are registered
 *   is a credential-stuffing accelerant.
 * - **Rotation with reuse detection.** Refresh tokens are single-use. Presenting
 *   one twice is treated as theft and revokes the whole token family.
 */
export class AuthService implements IAuthService {
  private readonly deps: AuthServiceDependencies
  private readonly logger: ILogger
  private readonly mailContext: TemplateContext

  constructor(dependencies: AuthServiceDependencies) {
    this.deps = dependencies
    this.logger = dependencies.logger.child({ component: 'AuthService' })
    this.mailContext = {
      appName: dependencies.appConfig.title,
      webUrl: dependencies.appConfig.webUrl,
    }
  }

  // -------------------------------------------------------------------------
  // Registration & verification
  // -------------------------------------------------------------------------

  public async register(
    input: RegisterInput,
    context: RequestContext,
  ): Promise<RegistrationResult> {
    const email = input.email.trim().toLowerCase()
    const existing = await this.deps.users.findByEmail(email)

    if (existing) {
      // A verified account is a genuine conflict and the client needs to know.
      // The address is already proven to belong to whoever owns it, so saying
      // so reveals nothing they could not learn from the login form.
      if (existing.isEmailVerified) {
        await this.deps.auditService.record({
          action: AuditAction.REGISTER,
          category: AuditCategory.ACCOUNT,
          outcome: 'failure',
          actorEmail: email,
          ip: context.ip,
          userAgent: context.userAgent,
          requestId: context.requestId,
          message: 'Registration attempted against an existing verified account',
        })

        throw new ConflictError('An account with this email already exists.', {
          code: ErrorCode.EMAIL_ALREADY_REGISTERED,
        })
      }

      // Unverified: someone started a signup and never finished. Re-send the
      // code rather than creating a duplicate or leaking the pending state.
      const dispatch = await this.issueOtp(existing, OtpPurpose.EMAIL_VERIFICATION, context)

      return {
        user: toUserDto(existing),
        otpExpiresAt: dispatch.expiresAt,
        message: 'Account already pending verification. A new code has been sent.',
      }
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.password)

    const user = await this.deps.users.create({
      email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      // Hardcoded, never taken from the request. Self-service registration must
      // not be able to mint an administrator, and the strict Zod schema rejects
      // an unexpected `role` field before it ever reaches this method.
      role: DEFAULT_USER_ROLE,
      status: UserStatus.PENDING,
    })

    const dispatch = await this.issueOtp(user, OtpPurpose.EMAIL_VERIFICATION, context)

    await this.deps.auditService.record({
      action: AuditAction.REGISTER,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
    })

    return {
      user: toUserDto(user),
      otpExpiresAt: dispatch.expiresAt,
      message: 'Account created. Check your email for a verification code.',
    }
  }

  public async verifyEmail(
    input: VerifyOtpInput,
    context: RequestContext,
  ): Promise<AuthenticationResult> {
    const user = await this.deps.users.findByEmail(input.email)

    if (!user) {
      throw new UnauthorizedError('Invalid or expired verification code.', {
        code: ErrorCode.OTP_INVALID,
      })
    }

    if (user.isEmailVerified) {
      throw new ConflictError('This email is already verified.', {
        code: ErrorCode.EMAIL_ALREADY_VERIFIED,
      })
    }

    await this.consumeOtp(user, OtpPurpose.EMAIL_VERIFICATION, input.code, context)

    const verified = await this.deps.users.markEmailVerified(user.id)

    if (!verified) {
      throw new NotFoundError('Account not found.')
    }

    await this.deps.auditService.record({
      action: AuditAction.EMAIL_VERIFY,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      actorId: verified.id,
      actorEmail: verified.email,
      actorRole: verified.role,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
    })

    void this.deps.mailer.send({
      ...buildWelcomeEmail(this.mailContext, { firstName: verified.firstName }),
      to: verified.email,
    })

    // Sign the user straight in. They have just proven control of the address
    // and typed a code; forcing an immediate login adds friction and no security.
    const tokens = await this.openSession(verified, context)

    return { user: toUserDto(verified), tokens }
  }

  public async resendOtp(
    input: ResendOtpInput,
    context: RequestContext,
  ): Promise<OtpDispatchResult> {
    const user = await this.deps.users.findByEmail(input.email)

    // Unknown address: return a plausible response without sending anything.
    // The shape must match the success case exactly.
    if (!user) {
      return this.silentDispatchResult()
    }

    if (input.purpose === OtpPurpose.EMAIL_VERIFICATION && user.isEmailVerified) {
      throw new ConflictError('This email is already verified.', {
        code: ErrorCode.EMAIL_ALREADY_VERIFIED,
      })
    }

    await this.enforceResendCooldown(user.id, input.purpose)

    const dispatch = await this.issueOtp(user, input.purpose, context)

    await this.deps.auditService.record({
      action: AuditAction.OTP_RESEND,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      actorId: user.id,
      actorEmail: user.email,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { purpose: input.purpose },
    })

    return dispatch
  }

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  public async login(
    input: LoginInput,
    context: RequestContext,
  ): Promise<AuthenticationResult> {
    const user = await this.deps.users.findByEmailWithSecret(input.email)

    if (!user) {
      // Burn comparable CPU before failing. Without this, a non-existent
      // address returns in microseconds while a real one takes the full bcrypt
      // cost, and that timing difference is a reliable enumeration oracle no
      // matter how carefully the response bodies are matched.
      await this.deps.passwordHasher.hash(input.password)

      await this.recordLoginFailure(null, input.email, context, 'unknown_account')
      throw this.invalidCredentials()
    }

    // Lockout is checked before the password comparison, so a locked account
    // costs an attacker a database read instead of a bcrypt verification.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordLoginFailure(user.id, user.email, context, 'account_locked')

      throw new ForbiddenError(
        'This account is temporarily locked after repeated failed sign-in attempts.',
        {
          code: ErrorCode.ACCOUNT_LOCKED,
          details: [{ message: `Try again after ${user.lockedUntil.toISOString()}.` }],
        },
      )
    }

    const passwordMatches = await this.deps.passwordHasher.compare(
      input.password,
      user.passwordHash,
    )

    if (!passwordMatches) {
      const state = await this.deps.users.registerFailedLogin(
        user.id,
        this.deps.authConfig.lockout.maxFailedAttempts,
        this.deps.authConfig.lockout.lockDurationMs,
      )

      await this.recordLoginFailure(
        user.id,
        user.email,
        context,
        state.isLocked ? 'locked_after_failures' : 'invalid_password',
      )

      throw this.invalidCredentials()
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.recordLoginFailure(user.id, user.email, context, 'account_suspended')

      throw new ForbiddenError('This account has been suspended.', {
        code: ErrorCode.ACCOUNT_SUSPENDED,
      })
    }

    // A soft-deleted account keeps its credentials on file, so the password
    // comparison above still succeeds. Block it explicitly, or a "deleted"
    // account would remain fully usable.
    if (user.status === UserStatus.DELETED) {
      await this.recordLoginFailure(user.id, user.email, context, 'account_closed')

      throw new ForbiddenError('This account has been closed.', {
        code: ErrorCode.ACCOUNT_CLOSED,
      })
    }

    // Checked *after* the password so an attacker cannot use the verification
    // state of an account to confirm the address exists.
    if (!user.isEmailVerified) {
      await this.issueOtp(user, OtpPurpose.EMAIL_VERIFICATION, context)

      throw new ForbiddenError('Verify your email address before signing in.', {
        code: ErrorCode.EMAIL_NOT_VERIFIED,
        details: [{ message: 'A new verification code has been sent.' }],
      })
    }

    await this.deps.users.recordSuccessfulLogin(user.id, context.ip)

    const tokens = await this.openSession(user, context)

    await this.deps.auditService.record({
      action: AuditAction.LOGIN,
      category: AuditCategory.AUTHENTICATION,
      outcome: 'success',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
    })

    return { user: toUserDto(user), tokens }
  }

  // -------------------------------------------------------------------------
  // Refresh token rotation
  // -------------------------------------------------------------------------

  /**
   * Rotates a refresh token.
   *
   * The security model, in order:
   *
   * 1. Verify the signature and the `type` claim.
   * 2. Look the token's hash up in the session store. An unknown hash means a
   *    forged or long-expired token.
   * 3. **If the session is already revoked, the token is being replayed.** A
   *    legitimate client never presents the same refresh token twice, so this
   *    means the token leaked and both the attacker and the real user now hold
   *    tokens in the same family. There is no way to tell which one is calling,
   *    so the whole family is revoked and both parties are forced to
   *    re-authenticate. Locking out the real user briefly is the correct trade
   *    against leaving an attacker with a valid session.
   * 4. Otherwise revoke the presented token and issue a successor in the same
   *    family, linked back for forensics.
   */
  public async refresh(
    refreshToken: string,
    context: RequestContext,
  ): Promise<AuthenticationResult> {
    const claims = this.deps.tokenService.verifyRefreshToken(refreshToken)
    const tokenHash = this.deps.tokenService.hashToken(refreshToken)
    const session = await this.deps.sessions.findByTokenHash(tokenHash)

    if (!session) {
      throw new UnauthorizedError('This session is no longer valid.', {
        code: ErrorCode.SESSION_NOT_FOUND,
      })
    }

    if (session.revokedAt) {
      const revokedCount = await this.deps.sessions.revokeFamily(
        session.familyId,
        SessionRevocationReason.REUSE_DETECTED,
      )

      this.logger.warn('Refresh token reuse detected — family revoked', {
        userId: session.userId,
        familyId: session.familyId,
        revokedCount,
        ip: context.ip,
      })

      await this.deps.auditService.record({
        action: AuditAction.TOKEN_REUSE_DETECTED,
        category: AuditCategory.SECURITY,
        outcome: 'failure',
        actorId: session.userId,
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        targetType: 'session_family',
        targetId: session.familyId,
        message: 'A revoked refresh token was presented; all sessions in the family were revoked',
        metadata: { revokedCount, originalReason: session.revokedReason },
      })

      throw new UnauthorizedError('Session revoked. Please sign in again.', {
        code: ErrorCode.TOKEN_REUSE_DETECTED,
      })
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('This session has expired.', {
        code: ErrorCode.TOKEN_EXPIRED,
      })
    }

    const user = await this.deps.users.findById(session.userId)

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.deps.sessions.revokeFamily(
        session.familyId,
        SessionRevocationReason.ADMIN_REVOKED,
      )

      throw new UnauthorizedError('This account can no longer be used.', {
        code: ErrorCode.ACCOUNT_SUSPENDED,
      })
    }

    // Password changes invalidate every token issued beforehand. Without this,
    // “change your password to lock out an intruder” would not actually work
    // until the stolen refresh token expired on its own.
    if (user.passwordChangedAt && session.createdAt < user.passwordChangedAt) {
      await this.deps.sessions.revokeFamily(
        session.familyId,
        SessionRevocationReason.PASSWORD_CHANGED,
      )

      throw new UnauthorizedError('Credentials changed. Please sign in again.', {
        code: ErrorCode.TOKEN_REVOKED,
      })
    }

    const rotated = await this.rotateSession(user, session.familyId, context)

    await this.deps.sessions.revoke(
      session.id,
      SessionRevocationReason.ROTATED,
      rotated.sessionId,
    )

    await this.deps.auditService.record({
      action: AuditAction.TOKEN_REFRESH,
      category: AuditCategory.AUTHENTICATION,
      outcome: 'success',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      targetType: 'session',
      targetId: rotated.sessionId,
      metadata: { familyId: session.familyId, previousSessionId: session.id },
    })

    return { user: toUserDto(user), tokens: rotated.tokens }
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  /**
   * Revokes the session behind a refresh token.
   *
   * Idempotent and never throws for a missing or invalid token. Logout must
   * always appear to succeed — the client clears its cookies regardless, and an
   * error here would leave the UI stuck in a signed-in state it cannot escape.
   */
  public async logout(
    refreshToken: string | undefined,
    context: RequestContext,
  ): Promise<void> {
    if (!refreshToken) return

    try {
      const tokenHash = this.deps.tokenService.hashToken(refreshToken)
      const session = await this.deps.sessions.findByTokenHash(tokenHash)

      if (!session || session.revokedAt) return

      await this.deps.sessions.revoke(session.id, SessionRevocationReason.LOGOUT)

      await this.deps.auditService.record({
        action: AuditAction.LOGOUT,
        category: AuditCategory.AUTHENTICATION,
        outcome: 'success',
        actorId: session.userId,
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        targetType: 'session',
        targetId: session.id,
      })
    } catch (error) {
      this.logger.debug('Logout called with an unusable refresh token', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  public async logoutAll(userId: string, context: RequestContext): Promise<number> {
    const revoked = await this.deps.sessions.revokeAllForUser(
      userId,
      SessionRevocationReason.LOGOUT_ALL,
    )

    await this.deps.auditService.record({
      action: AuditAction.LOGOUT_ALL,
      category: AuditCategory.AUTHENTICATION,
      outcome: 'success',
      actorId: userId,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { revokedCount: revoked },
    })

    return revoked
  }

  // -------------------------------------------------------------------------
  // Password recovery
  // -------------------------------------------------------------------------

  public async forgotPassword(
    input: ForgotPasswordInput,
    context: RequestContext,
  ): Promise<OtpDispatchResult> {
    const user = await this.deps.users.findByEmail(input.email)

    await this.deps.auditService.record({
      action: AuditAction.PASSWORD_FORGOT,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      actorId: user?.id ?? null,
      actorEmail: input.email,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { accountExists: Boolean(user) },
    })

    // Unknown or suspended: return the same shape without sending anything.
    // The caller cannot distinguish this from a successful dispatch, which is
    // the whole point.
    if (!user || user.status === UserStatus.SUSPENDED) {
      return this.silentDispatchResult()
    }

    // Cooldown violations are swallowed rather than surfaced. Reporting
    // “slow down” would confirm the address exists, undoing the protection above.
    try {
      await this.enforceResendCooldown(user.id, OtpPurpose.PASSWORD_RESET)
    } catch {
      return this.silentDispatchResult()
    }

    return this.issueOtp(user, OtpPurpose.PASSWORD_RESET, context)
  }

  public async resetPassword(
    input: ResetPasswordInput,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.deps.users.findByEmailWithSecret(input.email)

    if (!user) {
      throw new UnauthorizedError('Invalid or expired reset code.', {
        code: ErrorCode.OTP_INVALID,
      })
    }

    await this.consumeOtp(user, OtpPurpose.PASSWORD_RESET, input.code, context)

    // Blocking reuse of the current password means a reset always produces a
    // genuine credential change, so “reset your password” is a real remedy
    // after a compromise rather than a no-op.
    const isSamePassword = await this.deps.passwordHasher.compare(
      input.password,
      user.passwordHash,
    )

    if (isSamePassword) {
      throw new ConflictError('Choose a password you have not used before.', {
        code: ErrorCode.PASSWORD_REUSED,
      })
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.password)
    await this.deps.users.updatePassword(user.id, passwordHash)

    // Revoke everything. If the reset was prompted by a compromise, leaving
    // the attacker's session alive would defeat the entire exercise.
    const revoked = await this.deps.sessions.revokeAllForUser(
      user.id,
      SessionRevocationReason.PASSWORD_CHANGED,
    )

    await this.deps.auditService.record({
      action: AuditAction.PASSWORD_RESET,
      category: AuditCategory.SECURITY,
      outcome: 'success',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { revokedSessions: revoked },
    })

    // Out-of-band notification. If the reset was not the owner's doing, this
    // message is how they find out.
    void this.deps.mailer.send({
      ...buildPasswordChangedEmail(this.mailContext, {
        firstName: user.firstName,
        ip: context.ip,
        at: new Date(),
      }),
      to: user.email,
    })
  }

  // -------------------------------------------------------------------------
  // Profile & sessions
  // -------------------------------------------------------------------------

  public async getProfile(userId: string): Promise<UserDto> {
    const user = await this.deps.users.findById(userId)

    if (!user) {
      throw new NotFoundError('Account not found.')
    }

    return toUserDto(user)
  }

  public async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionDto[]> {
    const sessions = await this.deps.sessions.findActiveByUser(userId)
    return sessions.map((session) => toSessionDto(session, currentSessionId))
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Creates a new session family and issues the first token pair.
   * Called on login and on first verification.
   */
  private async openSession(user: UserEntity, context: RequestContext): Promise<TokenPair> {
    const familyId = crypto.randomUUID()
    const { tokens } = await this.rotateSession(user, familyId, context)

    // Cap concurrent sessions. Bounds the damage from a token that leaked
    // without anyone noticing, and keeps the collection from growing without
    // limit for a user who never signs out.
    await this.deps.sessions.revokeOldestBeyondLimit(
      user.id,
      this.deps.authConfig.lockout.maxActiveSessions,
      SessionRevocationReason.MAX_SESSIONS_EXCEEDED,
    )

    return tokens
  }

  /**
   * Issues a token pair and persists the session row.
   *
   * Ordering matters: the session row is created *before* the access token is
   * signed, because the access token carries the session id in its `sid` claim.
   *
   * The refresh token is signed in two passes. The first produces a token whose
   * hash identifies the row; the row is then created with that hash. A single
   * pass is impossible because the id and the token each need the other.
   */
  private async rotateSession(
    user: UserEntity,
    familyId: string,
    context: RequestContext,
  ): Promise<{ tokens: TokenPair; sessionId: string }> {
    const jti = crypto.randomUUID()
    const placeholderSessionId = new Date().getTime().toString(16) + jti.slice(0, 8)

    const refresh = this.deps.tokenService.signRefreshToken({
      sub: user.id,
      sid: placeholderSessionId,
      fid: familyId,
      jti,
      type: TokenType.REFRESH,
    })

    const session = await this.deps.sessions.create({
      userId: user.id,
      familyId,
      tokenHash: this.deps.tokenService.hashToken(refresh.token),
      ip: context.ip,
      userAgent: context.userAgent,
      expiresAt: refresh.expiresAt,
    })

    const access = this.deps.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: session.id,
      type: TokenType.ACCESS,
    })

    return {
      tokens: { accessToken: access, refreshToken: refresh },
      sessionId: session.id,
    }
  }

  /**
   * Generates, stores, and emails a one-time code.
   *
   * Any outstanding code for the same purpose is invalidated first, so a resend
   * supersedes its predecessor instead of leaving several valid codes in play
   * and multiplying an attacker's guessing surface.
   */
  private async issueOtp(
    user: UserEntity,
    purpose: OtpPurposeValue,
    context: RequestContext,
  ): Promise<OtpDispatchResult> {
    await this.deps.otps.invalidateAll(user.id, purpose)

    const { code, codeHash } = this.deps.otpService.generate()
    const expiresAt = dateFromNow(this.deps.otpConfig.ttlMs)

    await this.deps.otps.create({
      userId: user.id,
      email: user.email,
      purpose,
      codeHash,
      expiresAt,
      maxAttempts: this.deps.otpConfig.maxAttempts,
      ip: context.ip,
      userAgent: context.userAgent,
    })

    const expiresInMinutes = Math.max(1, Math.round(this.deps.otpConfig.ttlMs / 60_000))

    const message =
      purpose === OtpPurpose.PASSWORD_RESET
        ? buildPasswordResetEmail(this.mailContext, {
            firstName: user.firstName,
            code,
            expiresInMinutes,
          })
        : buildVerificationEmail(this.mailContext, {
            firstName: user.firstName,
            code,
            expiresInMinutes,
          })

    // Not awaited: delivery latency should not be added to the user's request,
    // and the mailer already swallows and logs its own failures.
    void this.deps.mailer.send({ ...message, to: user.email })

    await this.deps.auditService.record({
      action: AuditAction.OTP_ISSUED,
      category: AuditCategory.ACCOUNT,
      outcome: 'success',
      actorId: user.id,
      actorEmail: user.email,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { purpose },
    })

    return {
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: dateFromNow(this.deps.otpConfig.resendCooldownMs).toISOString(),
    }
  }

  /**
   * Verifies and consumes a one-time code.
   *
   * The attempt counter is incremented *before* the comparison, so a crash or a
   * dropped connection mid-verification cannot be used to retry for free. Once
   * the cap is hit the code is consumed outright rather than merely rejected —
   * otherwise an attacker could keep guessing against a code that is dead in
   * name only.
   */
  private async consumeOtp(
    user: UserEntity,
    purpose: OtpPurposeValue,
    code: string,
    context: RequestContext,
  ): Promise<void> {
    const otp = await this.deps.otps.findActive(user.id, purpose)

    if (!otp) {
      await this.recordOtpFailure(user, purpose, context, 'no_active_code')

      throw new UnauthorizedError('Invalid or expired verification code.', {
        code: ErrorCode.OTP_INVALID,
      })
    }

    if (otp.expiresAt.getTime() <= Date.now()) {
      await this.deps.otps.markConsumed(otp.id)
      await this.recordOtpFailure(user, purpose, context, 'expired')

      throw new UnauthorizedError('This verification code has expired.', {
        code: ErrorCode.OTP_EXPIRED,
      })
    }

    const attempts = await this.deps.otps.incrementAttempts(otp.id)

    if (attempts > otp.maxAttempts) {
      await this.deps.otps.markConsumed(otp.id)
      await this.recordOtpFailure(user, purpose, context, 'attempts_exceeded')

      throw new TooManyRequestsError('Too many incorrect attempts. Request a new code.', {
        code: ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      })
    }

    if (!this.deps.otpService.verify(code, otp.codeHash)) {
      await this.recordOtpFailure(user, purpose, context, 'mismatch')

      throw new UnauthorizedError('Invalid or expired verification code.', {
        code: ErrorCode.OTP_INVALID,
        details: [
          {
            message: `${String(Math.max(0, otp.maxAttempts - attempts))} attempts remaining.`,
          },
        ],
      })
    }

    await this.deps.otps.markConsumed(otp.id)
  }

  /** Rejects a resend issued inside the cooldown window. */
  private async enforceResendCooldown(
    userId: string,
    purpose: OtpPurposeValue,
  ): Promise<void> {
    const lastIssuedAt = await this.deps.otps.findLastIssuedAt(userId, purpose)

    if (!lastIssuedAt) return

    const elapsed = Date.now() - lastIssuedAt.getTime()
    const cooldown = this.deps.otpConfig.resendCooldownMs

    if (elapsed >= cooldown) return

    const retryInSeconds = Math.ceil((cooldown - elapsed) / 1000)

    throw new TooManyRequestsError('A code was sent recently. Please wait before requesting another.', {
      code: ErrorCode.OTP_RESEND_COOLDOWN,
      details: [{ message: `Try again in ${String(retryInSeconds)} seconds.` }],
    })
  }

  /**
   * The single failure response for every credential problem.
   *
   * Wrong password, unknown address, and malformed input all produce this exact
   * error. Any variation — in message, code, or status — would let a caller
   * distinguish “this address exists” from “it does not”.
   */
  private invalidCredentials(): UnauthorizedError {
    return new UnauthorizedError('Invalid email or password.', {
      code: ErrorCode.INVALID_CREDENTIALS,
    })
  }

  /** A dispatch response for a request that intentionally sent nothing. */
  private silentDispatchResult(): OtpDispatchResult {
    return {
      expiresAt: dateFromNow(this.deps.otpConfig.ttlMs).toISOString(),
      resendAvailableAt: dateFromNow(this.deps.otpConfig.resendCooldownMs).toISOString(),
    }
  }

  private async recordLoginFailure(
    userId: string | null,
    email: string,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    await this.deps.auditService.record({
      action: reason === 'invalid_password' ? AuditAction.LOGIN : AuditAction.LOGIN_BLOCKED,
      category: AuditCategory.AUTHENTICATION,
      outcome: 'failure',
      actorId: userId,
      actorEmail: email,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      message: reason,
    })
  }

  private async recordOtpFailure(
    user: UserEntity,
    purpose: OtpPurposeValue,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    await this.deps.auditService.record({
      action: AuditAction.OTP_FAILED,
      category: AuditCategory.SECURITY,
      outcome: 'failure',
      actorId: user.id,
      actorEmail: user.email,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      message: reason,
      metadata: { purpose },
    })
  }
}
