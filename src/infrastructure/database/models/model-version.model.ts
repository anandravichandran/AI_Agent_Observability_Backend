import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose'
import {
  VERSION_STATUSES,
  VersionStatus,
  type VersionStatusValue,
  type VirusScanResultValue,
} from '@/modules/models/model.constants'
import type { FrameworkMetadata } from '@/modules/models/model.entities'

export interface ModelVersionAttributes {
  modelId: Types.ObjectId
  ownerId: Types.ObjectId
  versionNumber: number
  versionLabel: string
  status: VersionStatusValue
  originalFilename: string
  storagePath: string
  mimeType: string
  extension: string
  sizeBytes: number
  sha256: string
  md5: string
  virusScan: VirusScanResultValue
  virusScanDetail: string | null
  metadata: FrameworkMetadata | null
  uploadedAt: Date
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ModelVersionDocument = HydratedDocument<ModelVersionAttributes> & {
  _id: Types.ObjectId
}

const modelVersionSchema = new Schema<ModelVersionAttributes>(
  {
    modelId: { type: Schema.Types.ObjectId, ref: 'AiModel', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    versionNumber: { type: Number, required: true, min: 1 },
    versionLabel: { type: String, required: true, maxlength: 100 },
    status: {
      type: String,
      enum: { values: VERSION_STATUSES, message: '`{VALUE}` is not a supported status' },
      default: VersionStatus.UPLOADING,
      index: true,
    },
    originalFilename: { type: String, required: true, maxlength: 500 },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true, maxlength: 200 },
    extension: { type: String, required: true, maxlength: 20 },
    sizeBytes: { type: Number, required: true, min: 0 },
    sha256: { type: String, required: true, maxlength: 64, index: true },
    md5: { type: String, required: true, maxlength: 32 },
    virusScan: {
      type: String,
      enum: ['clean', 'infected', 'skipped'],
      default: 'skipped',
    },
    virusScanDetail: { type: String, default: null, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: null },
    uploadedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'model_versions',
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id'])
        delete ret['_id']
        return ret
      },
    },
    toObject: { virtuals: true },
  },
)

// Model + version number must be unique (a model cannot have two version 3s).
modelVersionSchema.index({ modelId: 1, versionNumber: 1 }, { unique: true })
// Recent versions per model (the common list query).
modelVersionSchema.index({ modelId: 1, createdAt: -1 })
// SHA-256 for deduplication checks.
modelVersionSchema.index({ sha256: 1 })

export const ModelVersionModel: Model<ModelVersionAttributes> = model<ModelVersionAttributes>(
  'ModelVersion',
  modelVersionSchema,
)
