import type { PrismaClient } from '@/infrastructure/database/prisma.client'
import { Prisma } from '@/infrastructure/database/prisma.client'
import { toSkip } from '@/core/http/pagination'
import { ModelStatus, VersionStatus, type VersionStatusValue } from './model.constants'
import type {
  CreateModelData,
  CreateVersionData,
  FrameworkMetadata,
  ModelEntity,
  ModelVersionEntity,
  UpdateModelData,
} from './model.entities'
import type { IModelRepository, ModelListQuery, ModelListResult } from './model.repository.interface'

type ModelRow = {
  id: string
  ownerId: string
  name: string
  description: string
  framework: string
  tags: string[]
  status: string
  versionCount: number
  latestVersionId: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type VersionRow = {
  id: string
  modelId: string
  ownerId: string
  versionNumber: number
  versionLabel: string
  status: string
  originalFilename: string
  storagePath: string
  mimeType: string
  extension: string
  sizeBytes: bigint
  sha256: string
  md5: string
  virusScan: string
  virusScanDetail: string | null
  metadata: unknown
  uploadedAt: Date
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Prisma adapter for {@link IModelRepository}.
 *
 * `recordDeletedVersion` runs inside `$transaction` because it reads the
 * surviving version state and then writes a denormalised counter on the
 * parent model — a read-modify-write that must be atomic, or two concurrent
 * deletes could leave `versionCount` under/over-counted or `latestVersionId`
 * pointing at a version that no longer exists.
 */
export class PrismaModelRepository implements IModelRepository {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  // -------------------------------------------------------------------------
  // Models
  // -------------------------------------------------------------------------

  public async createModel(data: CreateModelData): Promise<ModelEntity> {
    const row = await this.prisma.model.create({
      data: {
        ownerId: data.ownerId,
        name: data.name,
        description: data.description,
        framework: data.framework,
        tags: data.tags,
        status: ModelStatus.DRAFT,
        versionCount: 0,
        latestVersionId: null,
      },
    })
    return this.toModelEntity(row)
  }

  public async findModelById(id: string): Promise<ModelEntity | null> {
    const row = await this.prisma.model.findFirst({ where: { id, deletedAt: null } })
    return row ? this.toModelEntity(row) : null
  }

  public async findModels(query: ModelListQuery): Promise<ModelListResult> {
    const where: Record<string, unknown> = { deletedAt: null }
    if (query.ownerId) where['ownerId'] = query.ownerId
    if (query.framework) where['framework'] = query.framework
    if (query.status) where['status'] = query.status
    if (query.search) {
      where['OR'] = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.model.findMany({
        where,
        orderBy: { [query.sort.field]: query.sort.order },
        skip: toSkip({ page: query.page, limit: query.limit }),
        take: query.limit,
      }),
      this.prisma.model.count({ where }),
    ])

    return { items: items.map((row) => this.toModelEntity(row)), total }
  }

  public async updateModel(id: string, data: UpdateModelData): Promise<ModelEntity | null> {
    const update: Record<string, unknown> = {}
    if (data.name !== undefined) update['name'] = data.name
    if (data.description !== undefined) update['description'] = data.description
    if (data.tags !== undefined) update['tags'] = data.tags

    if (Object.keys(update).length === 0) return this.findModelById(id)

    const result = await this.prisma.model.updateMany({
      where: { id, deletedAt: null },
      data: update,
    })
    if (result.count === 0) return null
    return this.findModelById(id)
  }

  public async archiveModel(id: string): Promise<void> {
    await this.prisma.model.updateMany({
      where: { id },
      data: { deletedAt: new Date(), status: ModelStatus.ARCHIVED },
    })
  }

  public async recordNewVersion(modelId: string, versionId: string): Promise<void> {
    await this.prisma.model.update({
      where: { id: modelId },
      data: {
        versionCount: { increment: 1 },
        latestVersionId: versionId,
        status: ModelStatus.ACTIVE,
      },
    })
  }

  public async recordDeletedVersion(modelId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const latest = await tx.modelVersion.findFirst({
        where: { modelId, deletedAt: null, status: VersionStatus.READY },
        orderBy: { versionNumber: 'desc' },
        select: { id: true },
      })

      const count = await tx.modelVersion.count({ where: { modelId, deletedAt: null } })

      await tx.model.update({
        where: { id: modelId },
        data: {
          versionCount: count,
          latestVersionId: latest?.id ?? null,
          status: count === 0 ? ModelStatus.DRAFT : ModelStatus.ACTIVE,
        },
      })
    })
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  public async createVersion(data: CreateVersionData): Promise<ModelVersionEntity> {
    const row = await this.prisma.modelVersion.create({
      data: {
        modelId: data.modelId,
        ownerId: data.ownerId,
        versionNumber: data.versionNumber,
        versionLabel: data.versionLabel,
        originalFilename: data.originalFilename,
        storagePath: data.storagePath,
        mimeType: data.mimeType,
        extension: data.extension,
        sizeBytes: BigInt(data.sizeBytes),
        sha256: data.sha256,
        md5: data.md5,
        status: VersionStatus.UPLOADING,
        virusScan: 'skipped',
        virusScanDetail: null,
        uploadedAt: new Date(),
      },
    })
    return this.toVersionEntity(row)
  }

  public async findVersionById(id: string): Promise<ModelVersionEntity | null> {
    const row = await this.prisma.modelVersion.findUnique({ where: { id } })
    return row ? this.toVersionEntity(row) : null
  }

  public async findVersionsByModelId(
    modelId: string,
    onlyReady = false,
  ): Promise<ModelVersionEntity[]> {
    const where: Record<string, unknown> = { modelId, deletedAt: null }
    if (onlyReady) where['status'] = VersionStatus.READY

    const rows = await this.prisma.modelVersion.findMany({
      where,
      orderBy: { versionNumber: 'desc' },
    })

    return rows.map((row) => this.toVersionEntity(row))
  }

  public async countVersions(modelId: string): Promise<number> {
    return this.prisma.modelVersion.count({ where: { modelId, deletedAt: null } })
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
    const update: Record<string, unknown> = { status }
    if (extra?.virusScan !== undefined) update['virusScan'] = extra.virusScan
    if (extra?.virusScanDetail !== undefined) update['virusScanDetail'] = extra.virusScanDetail
    if (extra?.metadata !== undefined) {
      update['metadata'] = extra.metadata === null ? Prisma.JsonNull : extra.metadata
    }

    try {
      const row = await this.prisma.modelVersion.update({ where: { id }, data: update })
      return this.toVersionEntity(row)
    } catch {
      return null
    }
  }

  public async softDeleteVersion(id: string): Promise<void> {
    await this.prisma.modelVersion.updateMany({
      where: { id },
      data: { deletedAt: new Date(), status: VersionStatus.DELETED },
    })
  }

  public async findVersionBySha256(sha256: string): Promise<ModelVersionEntity | null> {
    const row = await this.prisma.modelVersion.findFirst({ where: { sha256, deletedAt: null } })
    return row ? this.toVersionEntity(row) : null
  }

  private toModelEntity(row: ModelRow): ModelEntity {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      description: row.description,
      framework: row.framework as ModelEntity['framework'],
      tags: row.tags,
      status: row.status as ModelEntity['status'],
      versionCount: row.versionCount,
      latestVersionId: row.latestVersionId,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private toVersionEntity(row: VersionRow): ModelVersionEntity {
    return {
      id: row.id,
      modelId: row.modelId,
      ownerId: row.ownerId,
      versionNumber: row.versionNumber,
      versionLabel: row.versionLabel,
      status: row.status as ModelVersionEntity['status'],
      originalFilename: row.originalFilename,
      storagePath: row.storagePath,
      mimeType: row.mimeType,
      extension: row.extension,
      sizeBytes: Number(row.sizeBytes),
      sha256: row.sha256,
      md5: row.md5,
      virusScan: row.virusScan as ModelVersionEntity['virusScan'],
      virusScanDetail: row.virusScanDetail,
      metadata: (row.metadata as FrameworkMetadata | null) ?? null,
      uploadedAt: row.uploadedAt,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
