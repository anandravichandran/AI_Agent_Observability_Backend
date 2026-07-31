import type { Request, Response } from 'express'
import type { CookieConfig, DeviceFingerprintConfig } from '@/config/config.types'
import {
  clearAuthCookies,
  issueCsrfCookie,
  readRefreshToken,
  setAuthCookies,
} from '@/core/http/cookies'
import { computeRequestFingerprint, requireActor, toRequestContext } from '@/core/http/request-context'
import { UnauthorizedError } from '@/core/errors/app-error'
import { ErrorCode } from '@/core/constants/error-codes'
import type { AuthenticationResult, OtpPurposeValue, RequestContext } from './auth.types'
import type { IAuthService } from './auth.service.interface'
import type {
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResendOtpBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from './auth.validation'

export interface AuthControllerDependencies {
  readonly authService: IAuthService
  readonly cookieConfig: CookieConfig
  readonly deviceFingerprintConfig: DeviceFingerprintConfig
}

/**
 * HTTP adapter for {@link IAuthService}.
 *
 * Controllers do three things and nothing else: translate the request into a
 * service call, manage cookies, and shape the response. There is no branching
 * business logic here — if a rule needs testing, it belongs in the service.
 *
 * Every method is an arrow-function property so it can be passed directly to a
 * route without `.bind(this)`; a method reference detached from its receiver is
 * a classic source of `undefined is not a function` at runtime.
 */
export class AuthController {
  private readonly authService: IAuthService
  private readonly cookieConfig: CookieConfig
  private readonly deviceFingerprintConfig: DeviceFingerprintConfig

  constructor(dependencies: AuthControllerDependencies) {
    this.authService = dependencies.authService
    this.cookieConfig = dependencies.cookieConfig
    this.deviceFingerprintConfig = dependencies.deviceFingerprintConfig
  }

  /**
   * Builds the service-layer {@link RequestContext}, folding in the coarse
   * device fingerprint alongside the ambient IP/user-agent/request-id that
   * `toRequestContext` already captures.
   */
  private buildContext(req: Request): RequestContext {
    return {
      ...toRequestContext(req),
      fingerprint: computeRequestFingerprint(req, this.deviceFingerprintConfig),
    }
  }

  /**
   * Issues the double-submit CSRF cookie. Public, side-effect-free beyond
   * setting a non-`httpOnly` cookie the client must echo back in a header
   * on subsequent cookie-authenticated mutations.
   */
  public csrfToken = async (req: Request, res: Response): Promise<void> => {
    const token = issueCsrfCookie(res, this.cookieConfig)
    res.success({ csrfToken: token }, 'CSRF token issued.')
  }

  public register = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as RegisterBody
    const result = await this.authService.register(body, this.buildContext(req))

    res.created(result, result.message)
  }

  public verifyEmail = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as VerifyEmailBody
    const result = await this.authService.verifyEmail(body, this.buildContext(req))

    this.sendAuthenticated(res, result, 'Email verified. You are now signed in.')
  }

  public resendOtp = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as ResendOtpBody

    const result = await this.authService.resendOtp(
      { email: body.email, purpose: body.purpose as OtpPurposeValue },
      this.buildContext(req),
    )

    res.success(result, 'If the account exists, a new code has been sent.')
  }

  public login = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as LoginBody
    const result = await this.authService.login(body, this.buildContext(req))

    this.sendAuthenticated(res, result, 'Signed in successfully.')
  }

  public refresh = async (req: Request, res: Response): Promise<void> => {
    const token = readRefreshToken(
      req.cookies as Record<string, unknown> | undefined,
      req.body as Record<string, unknown> | undefined,
      this.cookieConfig,
    )

    if (!token) {
      throw new UnauthorizedError('A refresh token is required.', {
        code: ErrorCode.TOKEN_MISSING,
      })
    }

    const result = await this.authService.refresh(token, this.buildContext(req))

    this.sendAuthenticated(res, result, 'Session refreshed.')
  }

  public logout = async (req: Request, res: Response): Promise<void> => {
    const token = readRefreshToken(
      req.cookies as Record<string, unknown> | undefined,
      req.body as Record<string, unknown> | undefined,
      this.cookieConfig,
    )

    await this.authService.logout(token, this.buildContext(req))

    // Cookies are cleared unconditionally, even when no valid token was
    // presented. Logout must always leave the client in a signed-out state.
    clearAuthCookies(res, this.cookieConfig)

    res.success({ signedOut: true }, 'Signed out successfully.')
  }

  public logoutAll = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const revoked = await this.authService.logoutAll(actor.id, this.buildContext(req))

    clearAuthCookies(res, this.cookieConfig)

    res.success(
      { signedOut: true, revokedSessions: revoked },
      'Signed out of all devices.',
    )
  }

  public forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as ForgotPasswordBody
    const result = await this.authService.forgotPassword(body, this.buildContext(req))

    // Wording is intentionally conditional. The endpoint responds identically
    // whether or not the address is registered.
    res.success(result, 'If an account exists for that address, a reset code has been sent.')
  }

  public resetPassword = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as ResetPasswordBody
    await this.authService.resetPassword(body, this.buildContext(req))

    // Every session was revoked server-side; clear this client's cookies too
    // so its now-dead tokens are not sent on the next request.
    clearAuthCookies(res, this.cookieConfig)

    res.success(
      { passwordReset: true },
      'Password updated. Sign in with your new password.',
    )
  }

  public me = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const user = await this.authService.getProfile(actor.id)

    res.success({ user }, 'Profile retrieved.')
  }

  public listSessions = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const sessions = await this.authService.listSessions(actor.id, actor.sessionId)

    res.success({ sessions, count: sessions.length }, 'Active sessions retrieved.')
  }

  /**
   * Sets the auth cookies and returns the envelope.
   *
   * The token pair is included in the body as well as in cookies. Browser
   * clients should ignore it and rely on the `HttpOnly` cookies; the body copy
   * exists for CLI and CI clients that have no cookie jar.
   */
  private sendAuthenticated(
    res: Response,
    result: AuthenticationResult,
    message: string,
  ): void {
    setAuthCookies(res, result.tokens, this.cookieConfig)
    issueCsrfCookie(res, this.cookieConfig)

    res.success(
      {
        user: result.user,
        tokens: {
          accessToken: result.tokens.accessToken.token,
          accessTokenExpiresAt: result.tokens.accessToken.expiresAt.toISOString(),
          refreshToken: result.tokens.refreshToken.token,
          refreshTokenExpiresAt: result.tokens.refreshToken.expiresAt.toISOString(),
          tokenType: 'Bearer',
        },
      },
      message,
    )
  }
}
