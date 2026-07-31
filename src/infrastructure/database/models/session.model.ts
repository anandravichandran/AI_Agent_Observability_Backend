import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose'
import {
  SESSION_REVOCATION_REASONS,
  type SessionRevocationReasonValue,
} from '@/modules/auth/auth.constants'

/**
 * Session schema — one document per *issued refresh token*, not per login.
 *
 * Rotation appends a new document sharing the login's `familyId` and marks the
 * previous one revoked. Superseded documents are retained until their TTL, and
 * that retention is what makes reuse detection work: a stolen token that has
 * already been rotated still resolves to a document, whose revoked state tells
 * us the token was replayed. Deleting on rotation would make a replay look
 * identical to a garbage token and lose the signal entirely.
 */
export interface SessionAttributes {
  userId: Types.ObjectId
  /** Shared by every token descended from one login. Revoked as a unit. */
  familyId: string
  /** SHA-256 of the refresh JWT. The token itself is never stored. */
  tokenHash: string
  ip: string
  userAgent: string
  expiresAt: Date
  lastUsedAt: Date
  revokedAt?: Date | null
  revokedReason?: SessionRevocationReasonValue | null
  replacedBySessionId?: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

export type SessionDocument = HydratedDocument<SessionAttributes> & { _id: Types.ObjectId }

const sessionSchema = new Schema<SessionAttributes>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    familyId: {
      type: String,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ip: { type: String, required: true, default: 'unknown' },
    userAgent: { type: String, required: true, default: 'unknown' },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true, default: () => new Date() },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: {
        values: SESSION_REVOCATION_REASONS,
        message: '`{VALUE}` is not a supported revocation reason',
      },
      default: null,
    },
    replacedBySessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'sessions',
  },
)

/**
 * TTL keyed on the refresh token's own expiry, so the collection self-prunes on
 * exactly the schedule the tokens do.
 */
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_ttl' })

/** Serves “list my active sessions” and the max-active-sessions eviction. */
sessionSchema.index({ userId: 1, revokedAt: 1, createdAt: -1 })

export const SessionModel: Model<SessionAttributes> = model<SessionAttributes>(
  'Session',
  sessionSchema,
)
