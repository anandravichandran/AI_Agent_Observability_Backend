import type { SessionDto, UserDto } from './auth.types'
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
  VerifyOtpInput,
} from './auth.types'

/**
 * Authentication service port.
 *
 * Every method takes an explicit `RequestContext` instead of reaching for an
 * ambient request object. That keeps the implementation free of Express types
 * and makes the IP and user agent recorded in the audit trail an explicit input
 * rather than a hidden dependency.
 */
export interface IAuthService {
  /**
   * Creates a pending account and dispatches a verification code.
   * Returns no tokens — the address is unproven until verified.
   */
  register(input: RegisterInput, context: RequestContext): Promise<RegistrationResult>

  /** Verifies the email OTP, activates the account, and signs the user in. */
  verifyEmail(input: VerifyOtpInput, context: RequestContext): Promise<AuthenticationResult>

  /** Re-issues an OTP, subject to the resend cooldown. */
  resendOtp(input: ResendOtpInput, context: RequestContext): Promise<OtpDispatchResult>

  /** Authenticates a credential pair and opens a session. */
  login(input: LoginInput, context: RequestContext): Promise<AuthenticationResult>

  /**
   * Rotates a refresh token.
   *
   * Consumes the presented token and issues a replacement in the same family.
   * A token presented twice revokes the entire family.
   */
  refresh(refreshToken: string, context: RequestContext): Promise<AuthenticationResult>

  /** Revokes the session behind a refresh token. Idempotent. */
  logout(refreshToken: string | undefined, context: RequestContext): Promise<void>

  /** Revokes every session for a user. */
  logoutAll(userId: string, context: RequestContext): Promise<number>

  /**
   * Begins password recovery.
   *
   * Resolves identically whether or not the address exists — the response must
   * not reveal which addresses are registered.
   */
  forgotPassword(
    input: ForgotPasswordInput,
    context: RequestContext,
  ): Promise<OtpDispatchResult>

  /** Completes recovery: verifies the OTP, sets the password, revokes all sessions. */
  resetPassword(input: ResetPasswordInput, context: RequestContext): Promise<void>

  getProfile(userId: string): Promise<UserDto>

  listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]>
}
