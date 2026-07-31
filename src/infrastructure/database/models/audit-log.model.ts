import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose'

/**
 * Append-only audit trail.
 *
 * Records security-relevant events: who did what, from where, and whether it
 * succeeded. Failure events matter as much as successes — a burst of
 * `auth.login` failures from one address is the signal you actually want.
 *
 * There is intentionally no update or delete path in the repository. An audit
 * record that can be edited is not an audit record.
 */
export interface AuditLogAttributes {
  /** Dotted event name, e.g. `auth.login`. */
  action: string
  category: string
  outcome: 'success' | 'failure'
  /** Null for anonymous attempts (a login against an unknown address). */
  actorId?: Types.ObjectId | null
  actorEmail?: string | null
  actorRole?: string | null
  ip: string
  userAgent: string
  /** Correlates the audit record with application logs for the same request. */
  requestId: string
  targetType?: string | null
  targetId?: string | null
  message?: string | null
  /** Redacted before it reaches here — see `AuditService`. */
  metadata?: Record<string, unknown>
  createdAt: Date
}

export type AuditLogDocument = HydratedDocument<AuditLogAttributes> & {
  _id: Types.ObjectId
}

const auditLogSchema = new Schema<AuditLogAttributes>(
  {
    action: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    outcome: {
      type: String,
      enum: ['success', 'failure'],
      required: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorEmail: { type: String, default: null },
    actorRole: { type: String, default: null },
    ip: { type: String, required: true, default: 'unknown' },
    userAgent: { type: String, required: true, default: 'unknown' },
    requestId: { type: String, required: true, index: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    message: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    // Only `createdAt`: an audit record is never modified, so `updatedAt`
    // would be a permanently meaningless field.
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: 'audit_logs',
  },
)

/** Serves the admin trail query: filter by actor or action, newest first. */
auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ actorId: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })

export const AuditLogModel: Model<AuditLogAttributes> = model<AuditLogAttributes>(
  'AuditLog',
  auditLogSchema,
)
