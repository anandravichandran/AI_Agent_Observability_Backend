import type {
  ModelFrameworkValue,
  ModelSortField,
  ModelStatusValue,
  VersionStatusValue,
  VirusScanResultValue,
} from './model.constants'
import type { SortOrder } from '@/core/http/pagination'

// ---------------------------------------------------------------------------
// Outbound DTOs
// ---------------------------------------------------------------------------

export interface ModelVersionDto {
  readonly id: string
  readonly modelId: string
  readonly versionNumber: number
  readonly versionLabel: string
  readonly status: VersionStatusValue
  readonly originalFilename: string
  readonly extension: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly md5: string
  readonly virusScan: VirusScanResultValue
  readonly virusScanDetail: string | null
  readonly metadata: Record<string, unknown> | null
  readonly uploadedAt: string
  readonly deletedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ModelDto {
  readonly id: string
  readonly ownerId: string
  readonly name: string
  readonly description: string
  readonly framework: ModelFrameworkValue
  readonly tags: string[]
  readonly status: ModelStatusValue
  readonly versionCount: number
  readonly latestVersionId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ModelWithLatestVersionDto extends ModelDto {
  readonly latestVersion: ModelVersionDto | null
}

export interface ModelDetailDto extends ModelDto {
  readonly versions: ModelVersionDto[]
}

// ---------------------------------------------------------------------------
// Upload progress (stored in-memory, keyed by uploadId)
// ---------------------------------------------------------------------------

export type UploadPhase =
  | 'receiving'
  | 'hashing'
  | 'scanning'
  | 'extracting'
  | 'persisting'
  | 'done'
  | 'failed'

export interface UploadProgress {
  readonly uploadId: string
  readonly modelId: string
  readonly phase: UploadPhase
  /** 0-100 for the overall operation. */
  readonly percent: number
  readonly bytesReceived: number
  readonly bytesTotal: number
  readonly error: string | null
  readonly versionId: string | null
}

// ---------------------------------------------------------------------------
// Inbound query shapes
// ---------------------------------------------------------------------------

export interface ListModelsQuery {
  readonly search?: string
  readonly framework?: ModelFrameworkValue
  readonly status?: ModelStatusValue
  readonly ownerId?: string
  readonly sortBy?: ModelSortField
  readonly sortOrder?: SortOrder
  readonly page: number
  readonly limit: number
}

export interface CreateModelInput {
  readonly name: string
  readonly description: string
  readonly framework: ModelFrameworkValue
  readonly tags: string[]
}

export interface UpdateModelInput {
  readonly name?: string
  readonly description?: string
  readonly tags?: string[]
}
