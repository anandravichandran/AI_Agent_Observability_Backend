import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose'
import {
  MODEL_FRAMEWORKS,
  MODEL_STATUSES,
  ModelStatus,
  type ModelFrameworkValue,
  type ModelStatusValue,
} from '@/modules/models/model.constants'

export interface ModelAttributes {
  ownerId: Types.ObjectId
  name: string
  description: string
  framework: ModelFrameworkValue
  tags: string[]
  status: ModelStatusValue
  versionCount: number
  latestVersionId: Types.ObjectId | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ModelDocument = HydratedDocument<ModelAttributes> & { _id: Types.ObjectId }

const modelSchema = new Schema<ModelAttributes>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: {
      type: String,
      required: [true, 'Model name is required'],
      trim: true,
      maxlength: 200,
      index: true,
    },
    description: { type: String, default: '', maxlength: 2000 },
    framework: {
      type: String,
      enum: { values: MODEL_FRAMEWORKS, message: '`{VALUE}` is not a supported framework' },
      required: true,
      index: true,
    },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      enum: { values: MODEL_STATUSES, message: '`{VALUE}` is not a supported status' },
      default: ModelStatus.DRAFT,
      index: true,
    },
    versionCount: { type: Number, default: 0, min: 0 },
    latestVersionId: { type: Schema.Types.ObjectId, ref: 'ModelVersion', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'ai_models',
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

// Compound index for the admin/user listing: owner + status + recency.
modelSchema.index({ ownerId: 1, status: 1, createdAt: -1 })
// Text search across name and description.
modelSchema.index({ name: 'text', description: 'text' })
// Framework + status for analytics queries.
modelSchema.index({ framework: 1, status: 1 })

export const AiModelModel: Model<ModelAttributes> = model<ModelAttributes>('AiModel', modelSchema)
