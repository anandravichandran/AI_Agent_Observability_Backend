import type {
  CreateUserData,
  LoginFailureState,
  NotificationSettings,
  UpdateProfileData,
  UpdateUserAdminData,
  UserEntity,
  UserListQuery,
  UserListResult,
  UserPreferences,
  UserWithSecret,
} from '../auth.entities'

/**
 * User persistence port.
 *
 * Owned by the auth module (the consumer), not by the infrastructure layer that
 * implements it. That is the dependency inversion that keeps the arrows in this
 * codebase pointing inward.
 */
export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>

  findByEmail(email: string): Promise<UserEntity | null>

  /**
   * Loads a user together with the bcrypt hash.
   *
   * Only two call sites may use this: password verification during login, and
   * the reuse check during password reset.
   */
  findByEmailWithSecret(email: string): Promise<UserWithSecret | null>

  findByIdWithSecret(id: string): Promise<UserWithSecret | null>

  existsByEmail(email: string): Promise<boolean>

  create(data: CreateUserData): Promise<UserEntity>

  /** Marks the address verified and promotes the account to active. */
  markEmailVerified(id: string): Promise<UserEntity | null>

  /**
   * Replaces the credential and stamps `passwordChangedAt`.
   * Callers are responsible for revoking existing sessions.
   */
  updatePassword(id: string, passwordHash: string): Promise<void>

  /** Clears the failure counter and records the successful sign-in. */
  recordSuccessfulLogin(id: string, ip: string): Promise<void>

  /**
   * Atomically increments the failure counter, applying a lock once the
   * threshold is reached. Returns the resulting state so the caller can decide
   * what to tell the client.
   */
  registerFailedLogin(
    id: string,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<LoginFailureState>

  /** Clears an expired or satisfied lockout. */
  clearLockout(id: string): Promise<void>

  /** Updates editable display fields. Returns the updated entity, or null. */
  updateProfile(id: string, data: UpdateProfileData): Promise<UserEntity | null>

  /** Sets or clears the avatar. Pass `null` to remove it. */
  updateAvatar(id: string, avatarUrl: string | null): Promise<UserEntity | null>

  /** Replaces the preference value object. */
  updatePreferences(id: string, preferences: UserPreferences): Promise<UserEntity | null>

  /** Replaces the notification opt-in flags. */
  updateNotificationSettings(
    id: string,
    settings: NotificationSettings,
  ): Promise<UserEntity | null>

  /** Applies administrator-editable fields (role, status). */
  updateAdminFields(id: string, data: UpdateUserAdminData): Promise<UserEntity | null>

  /**
   * Soft-deletes an account: marks it `deleted`, stamps `deletedAt`, and
   * scrambles nothing else so the audit trail stays intact.
   */
  softDelete(id: string): Promise<UserEntity | null>

  /** Paginated, filtered, searchable, sortable listing for administrators. */
  list(query: UserListQuery): Promise<UserListResult>
}
