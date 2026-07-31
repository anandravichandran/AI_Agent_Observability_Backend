import type { SortSpec } from '@/core/http/pagination'
import type { UserRoleValue, UserStatusValue } from '../auth.constants'
import type {
  CreateUserData,
  LoginFailureState,
  UserEntity,
  UserNotificationsData,
  UserPreferencesData,
  UserWithSecret,
} from '../auth.entities'

/** Filter + paging for the administrative user list. */
export interface UserListQuery {
  /** Case-insensitive substring matched against email, first, and last name. */
  readonly search?: string
  readonly role?: UserRoleValue
  readonly status?: UserStatusValue
  readonly page: number
  readonly limit: number
  readonly sort: SortSpec
}

export interface UserListResult {
  readonly items: UserEntity[]
  readonly total: number
}

/** Editable identity fields. Both optional so a partial patch is expressible. */
export interface UpdateProfileData {
  readonly firstName?: string
  readonly lastName?: string
}

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
   * Only password verification and the reuse check during a password change
   * may use this. Everything else must use the hash-free finders.
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

  // -------------------------------------------------------------------------
  // Profile & account (Phase 3)
  // -------------------------------------------------------------------------

  /** Patches first/last name and returns the updated user. */
  updateProfile(id: string, data: UpdateProfileData): Promise<UserEntity | null>

  /** Replaces the preferences sub-document. */
  updatePreferences(id: string, preferences: UserPreferencesData): Promise<UserEntity | null>

  /** Replaces the notification-settings sub-document. */
  updateNotifications(
    id: string,
    notifications: UserNotificationsData,
  ): Promise<UserEntity | null>

  /** Sets or clears (`null`) the avatar path. */
  setAvatar(id: string, avatarUrl: string | null): Promise<void>

  /**
   * Soft-deletes an account: stamps `deletedAt`, anonymises the email so the
   * address can be re-registered, and clears the avatar. Session revocation is
   * the caller's job. The row is retained so the audit trail stays resolvable.
   */
  softDelete(id: string): Promise<void>

  /** Administrative role change. */
  updateRole(id: string, role: UserRoleValue): Promise<UserEntity | null>

  /** Administrative status change (suspend / reactivate). */
  updateStatus(id: string, status: UserStatusValue): Promise<UserEntity | null>

  /** Paginated, filtered, sorted administrative listing of non-deleted users. */
  findMany(query: UserListQuery): Promise<UserListResult>
}
