import type {
  ModelFrameworkValue,
  ModelStatusValue,
  VersionStatusValue,
  VirusScanResultValue,
} from './model.constants'

/**
 * Persistence-agnostic entities.
 *
 * Repositories map Mongoose documents into these plain objects; no layer above
 * the repository ever imports Mongoose or handles an ObjectId.
 */

export interface ModelEntity {
  readonly id: string
  readonly ownerId: string
  readonly name: string
  readonly description: string
  readonly framework: ModelFrameworkValue
  readonly tags: string[]
  readonly status: ModelStatusValue
  /**
   * Denormalised count of non-deleted versions.
   * Kept in sync by the repository on every version write.
   */
  readonly versionCount: number
  /** Points to the latest READY version. */
  readonly latestVersionId: string | null
  readonly deletedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateModelData {
  readonly ownerId: string
  readonly name: string
  readonly description: string
  readonly framework: ModelFrameworkValue
  readonly tags: string[]
}

export interface UpdateModelData {
  readonly name?: string
  readonly description?: string
  readonly tags?: string[]
}

// ---------------------------------------------------------------------------
// Extracted metadata stored per version
// ---------------------------------------------------------------------------

export interface OnnxMetadata {
  readonly irVersion?: number
  readonly opsetVersion?: number
  readonly producerName?: string
  readonly modelVersion?: string
  readonly domain?: string
  readonly inputCount?: number
  readonly outputCount?: number
}

export interface PytorchMetadata {
  readonly hasPickle: boolean
  readonly zipEntries?: string[]
}

export interface TensorflowMetadata {
  readonly format: 'savedmodel' | 'h5' | 'tflite' | 'pb'
}

export interface GgufMetadata {
  readonly version?: number
  readonly tensorCount?: number
  readonly kvCount?: number
  readonly architecture?: string
}

export type FrameworkMetadata =
  | { framework: 'onnx'; data: OnnxMetadata }
  | { framework: 'pytorch'; data: PytorchMetadata }
  | { framework: 'tensorflow'; data: TensorflowMetadata }
  | { framework: 'gguf'; data: GgufMetadata }

export interface ModelVersionEntity {
  readonly id: string
  readonly modelId: string
  readonly ownerId: string
  /** Monotonically increasing within a model, e.g. 1, 2, 3... */
  readonly versionNumber: number
  /** Human label: `v1`, `v2`, or user-supplied. */
  readonly versionLabel: string
  readonly status: VersionStatusValue
  /** Original filename as uploaded. */
  readonly originalFilename: string
  readonly storagePath: string
  readonly mimeType: string
  /** Extension lower-cased, e.g. `.onnx`. */
  readonly extension: string
  readonly sizeBytes: number
  /** Hex-encoded SHA-256 of the raw file bytes. */
  readonly sha256: string
  /** MD5 included for compatibility with tooling that still checks it. */
  readonly md5: string
  readonly virusScan: VirusScanResultValue
  readonly virusScanDetail: string | null
  readonly metadata: FrameworkMetadata | null
  readonly uploadedAt: Date
  readonly deletedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateVersionData {
  readonly modelId: string
  readonly ownerId: string
  readonly versionNumber: number
  readonly versionLabel: string
  readonly originalFilename: string
  readonly storagePath: string
  readonly mimeType: string
  readonly extension: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly md5: string
}
