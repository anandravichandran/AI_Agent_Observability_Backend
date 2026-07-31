import { Types, type Model } from 'mongoose'
import { OtpModel } from '@/infrastructure/database/models/otp.model'
import type { OtpAttributes, OtpDocument } from '@/infrastructure/database/models/otp.model'
import type { OtpPurposeValue } from '../auth.constants'
import type { CreateOtpData, OtpEntity } from '../auth.entities'
import type { IOtpRepository } from './otp.repository.interface'

/** Mongoose adapter for {@link IOtpRepository}. */
export class MongooseOtpRepository implements IOtpRepository {
  private readonly model: Model<OtpAttributes>

  constructor(model: Model<OtpAttributes> = OtpModel) {
    this.model = model
  }

  public async create(data: CreateOtpData): Promise<OtpEntity> {
    const doc = await this.model.create({
      userId: new Types.ObjectId(data.userId),
      email: data.email.trim().toLowerCase(),
      purpose: data.purpose,
      codeHash: data.codeHash,
      expiresAt: data.expiresAt,
      attempts: 0,
      maxAttempts: data.maxAttempts,
      consumedAt: null,
      ip: data.ip,
      userAgent: data.userAgent,
    })

    return this.toEntity(doc)
  }

  public async findActive(
    userId: string,
    purpose: OtpPurposeValue,
  ): Promise<OtpEntity | null> {
    if (!Types.ObjectId.isValid(userId)) return null

    const doc = await this.model
      .findOne({
        userId: new Types.ObjectId(userId),
        purpose,
        consumedAt: null,
        // The TTL monitor only sweeps once a minute, so filter on expiry here
        // rather than trusting the index to have removed the document.
        expiresAt: { $gt: new Date() },
      })
      .select('+codeHash')
      .sort({ createdAt: -1 })
      .exec()

    return doc ? this.toEntity(doc) : null
  }

  public async findLastIssuedAt(
    userId: string,
    purpose: OtpPurposeValue,
  ): Promise<Date | null> {
    if (!Types.ObjectId.isValid(userId)) return null

    const doc = await this.model
      .findOne({ userId: new Types.ObjectId(userId), purpose })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .exec()

    return doc?.createdAt ?? null
  }

  public async incrementAttempts(id: string): Promise<number> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true })
      .select('attempts')
      .exec()

    return doc?.attempts ?? 0
  }

  public async markConsumed(id: string): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { consumedAt: new Date() } })
      .exec()
  }

  public async invalidateAll(userId: string, purpose: OtpPurposeValue): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) return 0

    const result = await this.model
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          purpose,
          consumedAt: null,
        },
        { $set: { consumedAt: new Date() } },
      )
      .exec()

    return result.modifiedCount
  }

  private toEntity(doc: OtpDocument): OtpEntity {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      email: doc.email,
      purpose: doc.purpose,
      // Undefined when the projection excluded it; the empty string keeps the
      // entity total, and a constant-time compare against it always fails.
      codeHash: doc.codeHash ?? '',
      expiresAt: doc.expiresAt,
      attempts: doc.attempts,
      maxAttempts: doc.maxAttempts,
      consumedAt: doc.consumedAt ?? null,
      createdAt: doc.createdAt,
    }
  }
}
