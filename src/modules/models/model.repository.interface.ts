import type { SortSpec } from '@/core/http/pagination'
import type { ModelFrameworkValue, ModelStatusValue, VersionStatusValue } from './model.constants'
import type { CreateModelData, CreateVersionData, ModelEntity, ModelVersionEntity, UpdateModelData } from './model.entities'

export interface ModelListQuery {
  readonly search?: string
  readonly framework?: ModelFrameworkValue
  readonly status?: ModelStatusValue
  readonly ownerId?: string
  readonly page: number
  readonly limit: number
  readonly sort: SortSpec
}

export interface ModelListResult {
  readonly items: ModelEntity[]
  readonly total: number
}

export interface IModelRepository {
  // Models
  createModel(data: CreateModelData): Promise<ModelEntity>
  findModelById(id: string): Promise<ModelEntity | null>
  findModels(query: ModelListQuery): Promise<ModelListResult>
  updateModel(id: string, data: UpdateModelData): Promise<ModelEntity | null>
  archiveModel(id: string): Promise<void>
  /** Increment versionCount and update latestVersionId. */
  recordNewVersion(modelId: string, versionId: string): Promise<void>
  /** Decrement versionCount and recompute latestVersionId from remaining ready versions. */
  recordDeletedVersion(modelId: string): Promise<void>

  // Versions
  createVersion(data: CreateVersionData): Promise<ModelVersionEntity>
  findVersionById(id: string): Promise<ModelVersionEntity | null>
  findVersionsByModelId(
    modelId: string,
    onlyReady?: boolean,
  ): Promise<ModelVersionEntity[]>
  /** Count non-deleted versions for a model. */
  countVersions(modelId: string): Promise<number>
  updateVersionStatus(
    id: string,
    status: VersionStatusValue,
    extra?: {
      virusScan?: string
      virusScanDetail?: string | null
      metadata?: Record<string, unknown> | null
    },
  ): Promise<ModelVersionEntity | null>
  softDeleteVersion(id: string): Promise<void>
  /** Find any existing version with the same SHA-256 (deduplication check). */
  findVersionBySha256(sha256: string): Promise<ModelVersionEntity | null>
}
