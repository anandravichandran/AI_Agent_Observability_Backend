import { Types, type Model } from 'mongoose'
import { UserModel } from '@/infrastructure/database/models/user.model'
import type { UserAttributes, UserDocument } from '@/infrastructure/database/models/user.model'
import { UserStatus } from '../auth.constants'
import type {
  CreateUserData,
  LoginFailureState,
  UserEntity,
  UserWithSecret,
} from '../auth.entities'
import type { IUserRepository } from './user.repository.interface'

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
      lastLoginAt: doc.lastLoginAt ?? null,
      failedLoginAttempts: doc.failedLoginAttempts,
      lockedUntil: doc.lockedUntil ?? null,
      passwordChangedAt: doc.passwordChangedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }

  private toEntityWithSecret(doc: UserDocument): UserWithSecret {
    return { ...this.toEntity(doc), passwordHash: doc.passwordHash }
  }
}
