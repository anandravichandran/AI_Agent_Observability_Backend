import { Types, type Model } from 'mongoose'
import { ApiKeyModel } from '@/infrastructure/database/models/api-key.model'
import type {
  ApiKeyAttributes,
  ApiKeyDocument,
} from '@/infrastructure/database/models/api-key.model'
import { toSkip, toSortDocument } from '@/core/http/pagination'
import type { ApiKeyScopeValue, ApiKeyStatusValue } from './api-key.constants'
import { ApiKeyStatus } from './api-key.constants'
import type { ApiKeyEntity, CreateApiKeyData } from './api-key.entities'
import type {
  ApiKeyListQuery,
  ApiKeyListResult,
  IApiKeyRepository,
} from './api-key.repository.interface'

/** Mongoose adapter for {@link IApiKeyRepository}. */
export class MongooseApiKeyRepository implements IApiKeyRepository {
  private readonly model: Model<ApiKeyAttributes>

  constructor(model: Model<ApiKeyAttributes> = ApiKeyModel) {
    this.model = model
  }

  public async create(data: CreateApiKeyData): Promise<ApiKeyEntity> {
    const doc = await this.model.create({
      userId: new Types.ObjectId(data.userId),
      name: data.name,
      keyPrefix: data.keyPrefix,
      keyHash: data.keyHash,
      scopes: data.scopes,
      status: ApiKeyStatus.ACTIVE,
      lastUsedAt: null,
      lastUsedIp: null,
      expiresAt: data.expiresAt,
      revokedAt: null,
      revokedReason: null,
    })

    return this.toEntity(doc)
  }

  public async findById(id: string): Promise<ApiKeyEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null

    const doc = await this.model.findById(id).exec()
    return doc ? this.toEntity(doc) : null
  }

  public async findByPrefix(keyPrefix: string): Promise<ApiKeyEntity | null> {
    const doc = await this.model.findOne({ keyPrefix }).exec()
    return doc ? this.toEntity(doc) : null
  }

  public async findMany(query: ApiKeyListQuery): Promise<ApiKeyListResult> {
    if (!Types.ObjectId.isValid(query.userId)) return { items: [], total: 0 }

    const filter: Record<string, unknown> = { userId: new Types.ObjectId(query.userId) }
    if (query.status) filter['status'] = query.status

    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(toSortDocument(query.sort))
        .skip(toSkip(query))
        .limit(query.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ])

    return { items: docs.map((doc) => this.toEntity(doc)), total }
  }

  public async revoke(id: string, reason: string): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        { $set: { status: ApiKeyStatus.REVOKED, revokedAt: new Date(), revokedReason: reason } },
      )
      .exec()
  }

  public async recordUsage(id: string, ip: string): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { lastUsedAt: new Date(), lastUsedIp: ip } })
      .exec()
  }

  private toEntity(doc: ApiKeyDocument): ApiKeyEntity {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      keyPrefix: doc.keyPrefix,
      keyHash: doc.keyHash,
      scopes: doc.scopes as ApiKeyScopeValue[],
      status: doc.status as ApiKeyStatusValue,
      lastUsedAt: doc.lastUsedAt ?? null,
      lastUsedIp: doc.lastUsedIp ?? null,
      expiresAt: doc.expiresAt ?? null,
      revokedAt: doc.revokedAt ?? null,
      revokedReason: doc.revokedReason ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }
}
