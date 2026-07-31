import { Schema, model, models, type Document, type Model, type Types } from 'mongoose'
import { API_KEY_SCOPES, API_KEY_STATUSES, ApiKeyStatus } from '@/modules/apiKeys/api-key.constants'

export interface ApiKeyAttributes {
  readonly userId: Types.ObjectId
  readonly name: string
  /** Public lookup key, e.g. `afk_9f2c1a04b1`. Never the secret. */
  readonly keyPrefix: string
  /** SHA-256 hex digest of the full presented key. */
  readonly keyHash: string
  readonly scopes: string[]
  readonly status: string
  readonly lastUsedAt: Date | null
  readonly lastUsedIp: string | null
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly revokedReason: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type ApiKeyDocument = ApiKeyAttributes & Document

const apiKeySchema = new Schema<ApiKeyAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    keyPrefix: { type: String, required: true, unique: true, index: true },
    keyHash: { type: String, required: true, unique: true },
    scopes: {
      type: [String],
      required: true,
      enum: API_KEY_SCOPES,
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: 'At least one scope is required.',
      },
    },
    status: { type: String, enum: API_KEY_STATUSES, default: ApiKeyStatus.ACTIVE, index: true },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'api_keys' },
)

// Primary listing query: "this user's keys, newest first, optionally by status".
apiKeySchema.index({ userId: 1, status: 1, createdAt: -1 })

// TTL cleanup for keys that were created with an expiry. The partial filter
// is required because a TTL index on a field that is frequently `null` would
// otherwise make Mongo evaluate (and skip) every non-expiring key on each
// background sweep; scoping the index to documents that actually have a date
// keeps the sweep cheap and leaves non-expiring keys alone permanently.
apiKeySchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } },
)

export const ApiKeyModel: Model<ApiKeyAttributes> =
  (models['ApiKey'] as Model<ApiKeyAttributes>) ?? model<ApiKeyAttributes>('ApiKey', apiKeySchema)
