import type { NotificationSettings, UserPreferences } from '@/modules/auth/auth.entities'
import type { RequestContext, SessionDto } from '@/modules/auth/auth.types'
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

/**
 * Account self-service port.
 *
 * Every method operates on the authenticated user's own account; the caller's
 * id is always passed explicitly rather than read from an ambient request, so
 * the service stays free of Express and trivially testable.
 */
export interface IUserService {
  getProfile(userId: string): Promise<ProfileDto>

  updateProfile(
    userId: string,
    input: UpdateProfileInput,
    context: RequestContext,
  ): Promise<ProfileDto>

  /**
   * Verifies the current password, sets a new one, and revokes every session.
   * Returns how many sessions were revoked so the client can inform the user.
   */
  changePassword(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<SessionsRevokedResult>

  /** Soft-deletes the account after re-authenticating and revokes all sessions. */
  deleteAccount(
    userId: string,
    input: DeleteAccountInput,
    context: RequestContext,
  ): Promise<void>

  uploadAvatar(
    userId: string,
    input: UploadAvatarInput,
    context: RequestContext,
  ): Promise<ProfileDto>

  removeAvatar(userId: string, context: RequestContext): Promise<ProfileDto>

  getPreferences(userId: string): Promise<UserPreferences>

  updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
    context: RequestContext,
  ): Promise<UserPreferences>

  getNotificationSettings(userId: string): Promise<NotificationSettings>

  updateNotificationSettings(
    userId: string,
    input: UpdateNotificationSettingsInput,
    context: RequestContext,
  ): Promise<NotificationSettings>

  getActivity(userId: string, query: ActivityQuery): Promise<PagedResult<ActivityDto>>

  getLoginHistory(
    userId: string,
    query: LoginHistoryQuery,
  ): Promise<PagedResult<LoginHistoryDto>>

  listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]>

  /** Revokes one of the user's own sessions. 404s if it is not theirs. */
  revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
    context: RequestContext,
  ): Promise<void>

  /** Revokes every session except the one making the request. */
  revokeOtherSessions(
    userId: string,
    currentSessionId: string,
    context: RequestContext,
  ): Promise<SessionsRevokedResult>
}
