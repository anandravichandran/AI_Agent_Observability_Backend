import { Types, type FilterQuery, type Model } from 'mongoose'
import { buildSearchFilter, toSkip } from '@/core/query'
import { UserModel } from '@/infrastructure/database/models/user.model'
import type { UserAttributes, UserDocument } from '@/infrastructure/database/models/user.model'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  UserStatus,
} from '../auth.constants'
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
import type { IUserRepository } from './user.repository.interface'

/** Fields the admin directory search matches against. */
const USER_SEARCH_FIELDS = ['email', 'firstName', 'lastName'] as const

/**
 * Mongoose adapter for {@link IUserRepository}.
 *
 * All ObjectId handling, projection, and document-to-entity mapping is confined
 * to this file.
 */
export class MongooseUserRepository implements IUserRepository {
  private readonly model: Model<UserAttributes>

  /** The model is injected so tests can supply a stub or a scoped connection. */
  constructor(model: Model<UserAttributes> = UserModel) {
    this.model = model
  }

  public async findById(id: string): Promise<UserEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null

    const doc = await this.model.findById(id).exec()
    return doc ? this.toEntity(doc) : null
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.model.findOne({ email: this.normalise(email) }).exec()
    return doc ? this.toEntity(doc) : null
  }

  public async findByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    const doc = await this.model
      .findOne({ email: this.normalise(email) })
      .select('+passwordHash')
      .exec()

    return doc ? this.toEntityWithSecret(doc) : null
  }

  public async findByIdWithSecret(id: string): Promise<UserWithSecret | null> {
    if (!Types.ObjectId.isValid(id)) return null

    const doc = await this.model.findById(id).select('+passwordHash').exec()
    return doc ? this.toEntityWithSecret(doc) : null
  }

  public async existsByEmail(email: string): Promise<boolean> {
    const found = await this.model
      .exists({ email: this.normalise(email) })
      .exec()

    return found !== null
  }

  public async create(data: CreateUserData): Promise<UserEntity> {
    const doc = await this.model.create({
      email: this.normalise(data.email),
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      status: data.status,
      isEmailVerified: false,
      failedLoginAttempts: 0,
    })

    return this.toEntity(doc)
  }

  public async markEmailVerified(id: string): Promise<UserEntity | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
            status: UserStatus.ACTIVE,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        },
        { new: true },
      )
      .exec()

    return doc ? this.toEntity(doc) : null
  }

  public async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            passwordHash,
            passwordChangedAt: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        },
      )
      .exec()
  }

  public async recordSuccessfulLogin(id: string, ip: string): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            lastLoginAt: new Date(),
            lastLoginIp: ip,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        },
      )
      .exec()
  }

  public async registerFailedLogin(
    id: string,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<LoginFailureState> {
    // `findOneAndUpdate` with `$inc` is atomic, so concurrent failed attempts
    // cannot race and under-count. A read-modify-write here would let an
    // attacker parallelise guesses to stay under the lockout threshold.
    const doc = await this.model
      .findByIdAndUpdate(id, { $inc: { failedLoginAttempts: 1 } }, { new: true })
      .exec()

    if (!doc) {
      return { failedLoginAttempts: 0, lockedUntil: null, isLocked: false }
    }

    const attempts = doc.failedLoginAttempts

    if (attempts < maxAttempts) {
      return { failedLoginAttempts: attempts, lockedUntil: null, isLocked: false }
    }

    // Threshold reached: apply the lock in a second write. Split from the
    // increment so the lock window always starts at the moment of the final
    // attempt, rather than being computed from a stale read.
    const lockedUntil = new Date(Date.now() + lockDurationMs)

    await this.model.updateOne({ _id: id }, { $set: { lockedUntil } }).exec()

    return { failedLoginAttempts: attempts, lockedUntil, isLocked: true }
  }

  public async clearLockout(id: string): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { failedLoginAttempts: 0, lockedUntil: null } })
      .exec()
  }

  // -------------------------------------------------------------------------
  // Profile & account management
  // -------------------------------------------------------------------------

  public async updateProfile(
    id: string,
    data: UpdateProfileData,
  ): Promise<UserEntity | null> {
    // Only assign keys the caller actually supplied, so an omitted field is
    // left untouched rather than overwritten with `undefined`.
    const update: Partial<Pick<UserAttributes, 'firstName' | 'lastName'>> = {}
    if (data.firstName !== undefined) update.firstName = data.firstName
    if (data.lastName !== undefined) update.lastName = data.lastName

    return this.applyUpdate(id, { $set: update })
  }

  public async updateAvatar(id: string, avatarUrl: string | null): Promise<UserEntity | null> {
    return this.applyUpdate(id, { $set: { avatarUrl } })
  }

  public async updatePreferences(
    id: string,
    preferences: UserPreferences,
  ): Promise<UserEntity | null> {
    return this.applyUpdate(id, { $set: { preferences } })
  }

  public async updateNotificationSettings(
    id: string,
    settings: NotificationSettings,
  ): Promise<UserEntity | null> {
    return this.applyUpdate(id, { $set: { notificationSettings: settings } })
  }

  public async updateAdminFields(
    id: string,
    data: UpdateUserAdminData,
  ): Promise<UserEntity | null> {
    const update: Partial<Pick<UserAttributes, 'role' | 'status'>> = {}
    if (data.role !== undefined) update.role = data.role
    if (data.status !== undefined) update.status = data.status

    return this.applyUpdate(id, { $set: update })
  }

  public async softDelete(id: string): Promise<UserEntity | null> {
    return this.applyUpdate(id, {
      $set: { status: UserStatus.DELETED, deletedAt: new Date() },
    })
  }

  public async list(query: UserListQuery): Promise<UserListResult> {
    const filter: FilterQuery<UserAttributes> = {}

    if (query.filters.role) filter.role = query.filters.role
    if (query.filters.status) filter.status = query.filters.status
    if (query.filters.isEmailVerified !== undefined) {
      filter.isEmailVerified = query.filters.isEmailVerified
    }

    const search = buildSearchFilter(query.search, USER_SEARCH_FIELDS)
    if (search) Object.assign(filter, search)

    // Page and count run in parallel; the total drives the pagination metadata.
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(query.sort)
        .skip(toSkip(query.page, query.limit))
        .limit(query.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ])

    return { items: docs.map((doc) => this.toEntity(doc)), total }
  }

  /** Shared `findByIdAndUpdate` wrapper that guards the id and maps the result. */
  private async applyUpdate(
    id: string,
    update: Record<string, unknown>,
  ): Promise<UserEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null

    const doc = await this.model.findByIdAndUpdate(id, update, { new: true }).exec()
    return doc ? this.toEntity(doc) : null
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private normalise(email: string): string {
    return email.trim().toLowerCase()
  }

  private toEntity(doc: UserDocument): UserEntity {
    return {
      id: doc._id.toString(),
      email: doc.email,
      firstName: doc.firstName,
      lastName: doc.lastName,
      role: doc.role,
      status: doc.status,
      isEmailVerified: doc.isEmailVerified,
      emailVerifiedAt: doc.emailVerifiedAt ?? null,
      avatarUrl: doc.avatarUrl ?? null,
      // Legacy rows created before these fields existed fall back to defaults,
      // so every entity above the repository sees a complete value object.
      preferences: doc.preferences
        ? {
            theme: doc.preferences.theme,
            language: doc.preferences.language,
            timezone: doc.preferences.timezone,
          }
        : { ...DEFAULT_USER_PREFERENCES },
      notificationSettings: doc.notificationSettings
        ? {
            productUpdates: doc.notificationSettings.productUpdates,
            securityAlerts: doc.notificationSettings.securityAlerts,
            benchmarkComplete: doc.notificationSettings.benchmarkComplete,
            weeklyReport: doc.notificationSettings.weeklyReport,
          }
        : { ...DEFAULT_NOTIFICATION_SETTINGS },
      lastLoginAt: doc.lastLoginAt ?? null,
      failedLoginAttempts: doc.failedLoginAttempts,
      lockedUntil: doc.lockedUntil ?? null,
      passwordChangedAt: doc.passwordChangedAt ?? null,
      deletedAt: doc.deletedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }

  private toEntityWithSecret(doc: UserDocument): UserWithSecret {
    return { ...this.toEntity(doc), passwordHash: doc.passwordHash }
  }
}
