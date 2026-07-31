import { Types, type Model } from 'mongoose'
import { SessionModel } from '@/infrastructure/database/models/session.model'
import type {
  SessionAttributes,
  SessionDocument,
} from '@/infrastructure/database/models/session.model'
import type { SessionRevocationReasonValue } from '../auth.constants'
import type { CreateSessionData, SessionEntity } from '../auth.entities'
import type { ISessionRepository } from './session.repository.interface'

/** Mongoose adapter for {@link ISessionRepository}. */
export class MongooseSessionRepository implements ISessionRepository {
  private readonly model: Model<SessionAttributes>

  constructor(model: Model<SessionAttributes> = SessionModel) {
    this.model = model
  }

  public async create(data: CreateSessionData): Promise<SessionEntity> {
    const doc = await this.model.create({
      userId: new Types.ObjectId(data.userId),
      familyId: data.familyId,
      tokenHash: data.tokenHash,
      ip: data.ip,
      userAgent: data.userAgent,
      fingerprint: data.fingerprint,
      geoCountry: data.geoCountry,
      geoIsPrivate: data.geoIsPrivate,
      expiresAt: data.expiresAt,
      lastUsedAt: new Date(),
      revokedAt: null,
      revokedReason: null,
      replacedBySessionId: null,
    })

    return this.toEntity(doc)
  }

  public async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    const doc = await this.model.findOne({ tokenHash }).exec()
    return doc ? this.toEntity(doc) : null
  }

  public async findById(id: string): Promise<SessionEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null

    const doc = await this.model.findById(id).exec()
    return doc ? this.toEntity(doc) : null
  }

  public async findActiveByUser(userId: string): Promise<SessionEntity[]> {
    if (!Types.ObjectId.isValid(userId)) return []

    const docs = await this.model
      .find({
        userId: new Types.ObjectId(userId),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .exec()

    return docs.map((doc) => this.toEntity(doc))
  }

  public async countActiveByUser(userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) return 0

    return this.model
      .countDocuments({
        userId: new Types.ObjectId(userId),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec()
  }

  public async revoke(
    id: string,
    reason: SessionRevocationReasonValue,
    replacedBySessionId?: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id, revokedAt: null },
        {
          $set: {
            revokedAt: new Date(),
            revokedReason: reason,
            replacedBySessionId: replacedBySessionId
              ? new Types.ObjectId(replacedBySessionId)
              : null,
          },
        },
      )
      .exec()
  }

  public async revokeFamily(
    familyId: string,
    reason: SessionRevocationReasonValue,
  ): Promise<number> {
    const result = await this.model
      .updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
      )
      .exec()

    return result.modifiedCount
  }

  public async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReasonValue,
    exceptSessionId?: string,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) return 0

    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      revokedAt: null,
    }

    if (exceptSessionId && Types.ObjectId.isValid(exceptSessionId)) {
      filter['_id'] = { $ne: new Types.ObjectId(exceptSessionId) }
    }

    const result = await this.model
      .updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } })
      .exec()

    return result.modifiedCount
  }

  public async revokeOldestBeyondLimit(
    userId: string,
    keep: number,
    reason: SessionRevocationReasonValue,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) return 0

    // Select the survivors, then revoke everything else. Skipping to find the
    // excess directly would race with a concurrent login inserting a session
    // between the two operations.
    const survivors = await this.model
      .find({
        userId: new Types.ObjectId(userId),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .limit(keep)
      .select('_id')
      .exec()

    const survivorIds = survivors.map((doc) => doc._id)

    const result = await this.model
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          revokedAt: null,
          _id: { $nin: survivorIds },
        },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
      )
      .exec()

    return result.modifiedCount
  }

  public async touch(id: string, ip: string, userAgent: string): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { lastUsedAt: new Date(), ip, userAgent } })
      .exec()
  }

  private toEntity(doc: SessionDocument): SessionEntity {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      familyId: doc.familyId,
      tokenHash: doc.tokenHash,
      ip: doc.ip,
      userAgent: doc.userAgent,
      fingerprint: doc.fingerprint ?? null,
      geoCountry: doc.geoCountry ?? null,
      geoIsPrivate: doc.geoIsPrivate ?? false,
      expiresAt: doc.expiresAt,
      lastUsedAt: doc.lastUsedAt,
      revokedAt: doc.revokedAt ?? null,
      revokedReason: doc.revokedReason ?? null,
      replacedBySessionId: doc.replacedBySessionId?.toString() ?? null,
      createdAt: doc.createdAt,
    }
  }
}
