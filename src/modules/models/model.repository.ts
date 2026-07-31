import { Types, type FilterQuery, type Model } from 'mongoose'
import { AiModelModel } from '@/infrastructure/database/models/model.model'
import type { ModelAttributes, ModelDocument } from '@/infrastructure/database/models/model.model'
import { ModelVersionModel } from '@/infrastructure/database/models/model-version.model'
import type {
  ModelVersionAttributes,
  ModelVersionDocument,
} from '@/infrastructure/database/models/model-version.model'
import { ModelStatus, VersionStatus, type VersionStatusValue } from './model.constants'
import type {
  CreateModelData,
  CreateVersionData,
  ModelEntity,
  ModelVersionEntity,
  UpdateModelData,
} from './model.entities'
import { toSortDocument, toSkip } from '@/core/http/pagination'
import type { IModelRepository, ModelListQuery, ModelListResult } from './model.repository.interface'

export class MongooseModelRepository implements IModelRepository {
  private readonly models: Model<ModelAttributes>
  private readonly versions: Model<ModelVersionAttributes>

  constructor(
    modelsModel: Model<ModelAttributes> = AiModelModel,
    versionsModel: Model<ModelVersionAttributes> = ModelVersionModel,
  ) {
    this.models = modelsModel
    this.versions = versionsModel
  }

  // -------------------------------------------------------------------------
  // Models
  // -------------------------------------------------------------------------

  public async createModel(data: CreateModelData): Promise<ModelEntity> {
    const doc = await this.models.create({
      ownerId: new Types.ObjectId(data.ownerId),
      name: data.name,
      description: data.description,
      framework: data.framework,
      tags: data.tags,
      status: ModelStatus.DRAFT,
      versionCount: 0,
      latestVersionId: null,
    })
    return this.toModelEntity(doc)
  }

  public async findModelById(id: string): Promise<ModelEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null
    const doc = await this.models.findOne({ _id: id, deletedAt: null }).exec()
    return doc ? this.toModelEntity(doc) : null
  }

  public async findModels(query: ModelListQuery): Promise<ModelListResult> {
    const filter: FilterQuery<ModelAttributes> = { deletedAt: null }

    if (query.ownerId && Types.ObjectId.isValid(query.ownerId)) {
      filter.ownerId = new Types.ObjectId(query.ownerId)
    }
    if (query.framework) filter.framework = query.framework
    if (query.status) filter.status = query.status

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(escaped, 'i')
      filter.$or = [{ name: pattern }, { description: pattern }]
    }

    const [docs, total] = await Promise.all([
      this.models
        .find(filter)
        .sort(toSortDocument(query.sort))
        .skip(toSkip(query))
        .limit(query.limit)
        .exec(),
      this.models.countDocuments(filter).exec(),
    ])

    return { items: docs.map((d) => this.toModelEntity(d)), total }
  }

  public async updateModel(id: string, data: UpdateModelData): Promise<ModelEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null
    const $set: Record<string, unknown> = {}
    if (data.name !== undefined) $set['name'] = data.name
    if (data.description !== undefined) $set['description'] = data.description
    if (data.tags !== undefined) $set['tags'] = data.tags
    if (Object.keys($set).length === 0) return this.findModelById(id)
    const doc = await this.models
      .findOneAndUpdate({ _id: id, deletedAt: null }, { $set }, { new: true })
      .exec()
    return doc ? this.toModelEntity(doc) : null
  }

  public async archiveModel(id: string): Promise<void> {
    await this.models
      .updateOne({ _id: id }, { $set: { deletedAt: new Date(), status: ModelStatus.ARCHIVED } })
      .exec()
  }

  public async recordNewVersion(modelId: string, versionId: string): Promise<void> {
    await this.models
      .updateOne(
        { _id: modelId },
        {
          $inc: { versionCount: 1 },
          $set: {
            latestVersionId: new Types.ObjectId(versionId),
            status: ModelStatus.ACTIVE,
          },
        },
      )
      .exec()
  }

  public async recordDeletedVersion(modelId: string): Promise<void> {
    // Re-query to find the surviving latest READY version.
    const latest = await this.versions
      .findOne(
        { modelId: new Types.ObjectId(modelId), deletedAt: null, status: VersionStatus.READY },
        { _id: 1 },
      )
      .sort({ versionNumber: -1 })
      .exec()

    const count = await this.versions
      .countDocuments({ modelId: new Types.ObjectId(modelId), deletedAt: null })
      .exec()

    await this.models
      .updateOne(
        { _id: modelId },
        {
          $set: {
            versionCount: count,
            latestVersionId: latest ? latest._id : null,
            status: count === 0 ? ModelStatus.DRAFT : ModelStatus.ACTIVE,
          },
        },
      )
      .exec()
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  public async createVersion(data: CreateVersionData): Promise<ModelVersionEntity> {
    const doc = await this.versions.create({
      modelId: new Types.ObjectId(data.modelId),
      ownerId: new Types.ObjectId(data.ownerId),
      versionNumber: data.versionNumber,
      versionLabel: data.versionLabel,
      originalFilename: data.originalFilename,
      storagePath: data.storagePath,
      mimeType: data.mimeType,
      extension: data.extension,
      sizeBytes: data.sizeBytes,
      sha256: data.sha256,
      md5: data.md5,
      status: VersionStatus.UPLOADING,
      virusScan: 'skipped',
      virusScanDetail: null,
      metadata: null,
      uploadedAt: new Date(),
    })
    return this.toVersionEntity(doc)
  }

  public async findVersionById(id: string): Promise<ModelVersionEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null
    const doc = await this.versions.findById(id).exec()
    return doc ? this.toVersionEntity(doc) : null
  }

  public async findVersionsByModelId(
    modelId: string,
    onlyReady = false,
  ): Promise<ModelVersionEntity[]> {
    if (!Types.ObjectId.isValid(modelId)) return []
    const filter: FilterQuery<ModelVersionAttributes> = {
      modelId: new Types.ObjectId(modelId),
      deletedAt: null,
    }
    if (onlyReady) filter.status = VersionStatus.READY
    const docs = await this.versions.find(filter).sort({ versionNumber: -1 }).exec()
    return docs.map((d) => this.toVersionEntity(d))
  }

  public async countVersions(modelId: string): Promise<number> {
    if (!Types.ObjectId.isValid(modelId)) return 0
    return this.versions
      .countDocuments({ modelId: new Types.ObjectId(modelId), deletedAt: null })
      .exec()
  }

  public async updateVersionStatus(
    id: string,
    status: VersionStatusValue,
    extra?: {
      virusScan?: string
      virusScanDetail?: string | null
      metadata?: Record<string, unknown> | null
    },
  ): Promise<ModelVersionEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null
    const $set: Record<string, unknown> = { status }
    if (extra?.virusScan !== undefined) $set['virusScan'] = extra.virusScan
    if (extra?.virusScanDetail !== undefined) $set['virusScanDetail'] = extra.virusScanDetail
    if (extra?.metadata !== undefined) $set['metadata'] = extra.metadata
    const doc = await this.versions.findByIdAndUpdate(id, { $set }, { new: true }).exec()
    return doc ? this.toVersionEntity(doc) : null
  }

  public async softDeleteVersion(id: string): Promise<void> {
    await this.versions
      .updateOne({ _id: id }, { $set: { deletedAt: new Date(), status: VersionStatus.DELETED } })
      .exec()
  }

  public async findVersionBySha256(sha256: string): Promise<ModelVersionEntity | null> {
    const doc = await this.versions
      .findOne({ sha256, deletedAt: null, status: VersionStatus.READY })
      .exec()
    return doc ? this.toVersionEntity(doc) : null
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private toModelEntity(doc: ModelDocument): ModelEntity {
    return {
      id: doc._id.toString(),
      ownerId: doc.ownerId.toString(),
      name: doc.name,
      description: doc.description,
      framework: doc.framework,
      tags: doc.tags,
      status: doc.status,
      versionCount: doc.versionCount,
      latestVersionId: doc.latestVersionId?.toString() ?? null,
      deletedAt: doc.deletedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }

  private toVersionEntity(doc: ModelVersionDocument): ModelVersionEntity {
    return {
      id: doc._id.toString(),
      modelId: doc.modelId.toString(),
      ownerId: doc.ownerId.toString(),
      versionNumber: doc.versionNumber,
      versionLabel: doc.versionLabel,
      status: doc.status,
      originalFilename: doc.originalFilename,
      storagePath: doc.storagePath,
      mimeType: doc.mimeType,
      extension: doc.extension,
      sizeBytes: doc.sizeBytes,
      sha256: doc.sha256,
      md5: doc.md5,
      virusScan: doc.virusScan as ModelVersionEntity['virusScan'],
      virusScanDetail: doc.virusScanDetail ?? null,
      metadata: doc.metadata as ModelVersionEntity['metadata'],
      uploadedAt: doc.uploadedAt,
      deletedAt: doc.deletedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }
}
