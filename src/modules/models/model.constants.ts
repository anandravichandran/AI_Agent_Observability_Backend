/**
 * AI model domain constants.
 *
 * Kept as const objects with derived union types so values are usable at
 * runtime (Mongoose enums, Zod, OpenAPI) and at compile time.
 */

// ---------------------------------------------------------------------------
// Supported frameworks
// ---------------------------------------------------------------------------

export const ModelFramework = {
  ONNX: 'onnx',
  PYTORCH: 'pytorch',
  TENSORFLOW: 'tensorflow',
  GGUF: 'gguf',
} as const

export type ModelFrameworkValue = (typeof ModelFramework)[keyof typeof ModelFramework]
export const MODEL_FRAMEWORKS = Object.values(ModelFramework) as ModelFrameworkValue[]

/**
 * Allowed file extensions per framework.
 * The union of all values is the complete allow-list for the upload handler.
 */
export const FRAMEWORK_EXTENSIONS: Record<ModelFrameworkValue, string[]> = {
  onnx: ['.onnx'],
  pytorch: ['.pt', '.pth', '.bin'],
  tensorflow: ['.pb', '.h5', '.keras', '.tflite'],
  gguf: ['.gguf'],
}

/** Flat allow-list of every accepted extension (deduplicated, lower-cased). */
export const ALLOWED_EXTENSIONS: string[] = [
  ...new Set(Object.values(FRAMEWORK_EXTENSIONS).flat()),
]

/**
 * Magic-byte fingerprints.
 *
 * Checked against the first bytes of the uploaded file to catch files whose
 * extension has been changed to bypass the extension check.
 */
export const MAGIC_BYTES: Array<{
  framework: ModelFrameworkValue
  label: string
  offset: number
  bytes: number[]
}> = [
  // ONNX — protobuf with field tag 0x08 (field 1, varint)
  // The canonical first byte of an ONNX protobuf is 0x08.
  { framework: 'onnx', label: 'ONNX protobuf', offset: 0, bytes: [0x08] },
  // PyTorch — ZIP archive (model serialised as a zip of pickle files)
  { framework: 'pytorch', label: 'PyTorch (zip)', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  // TensorFlow SavedModel .pb — protobuf (same first byte pattern)
  { framework: 'tensorflow', label: 'TF protobuf', offset: 0, bytes: [0x0a] },
  // GGUF magic: 'GGUF'
  { framework: 'gguf', label: 'GGUF', offset: 0, bytes: [0x47, 0x47, 0x55, 0x46] },
  // TFLite flatbuffer magic
  { framework: 'tensorflow', label: 'TFLite', offset: 4, bytes: [0x54, 0x46, 0x4c, 0x33] },
]

// ---------------------------------------------------------------------------
// Model / version lifecycle
// ---------------------------------------------------------------------------

export const ModelStatus = {
  /** Initial record before any version is uploaded. */
  DRAFT: 'draft',
  /** At least one active version is available. */
  ACTIVE: 'active',
  /** Soft-deleted; hidden from normal queries. */
  ARCHIVED: 'archived',
} as const

export type ModelStatusValue = (typeof ModelStatus)[keyof typeof ModelStatus]
export const MODEL_STATUSES = Object.values(ModelStatus) as ModelStatusValue[]

export const VersionStatus = {
  /** Upload in progress or post-processing not yet done. */
  UPLOADING: 'uploading',
  /** Virus check running (or queued). */
  SCANNING: 'scanning',
  /** Passed all checks; ready for use. */
  READY: 'ready',
  /** Failed virus scan, metadata extraction, or validation. */
  FAILED: 'failed',
  /** Soft-deleted (file removed, metadata retained). */
  DELETED: 'deleted',
} as const

export type VersionStatusValue = (typeof VersionStatus)[keyof typeof VersionStatus]
export const VERSION_STATUSES = Object.values(VersionStatus) as VersionStatusValue[]

export const VirusScanResult = {
  CLEAN: 'clean',
  INFECTED: 'infected',
  /** Scan could not run (service unavailable, etc.). */
  SKIPPED: 'skipped',
} as const

export type VirusScanResultValue = (typeof VirusScanResult)[keyof typeof VirusScanResult]

/** Sortable fields on the model collection (whitelist for `resolveSort`). */
export const MODEL_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'framework',
  'status',
  'versionCount',
] as const

export type ModelSortField = (typeof MODEL_SORT_FIELDS)[number]

/** Default size ceiling for a single model-file upload. */
export const DEFAULT_MODEL_MAX_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB
