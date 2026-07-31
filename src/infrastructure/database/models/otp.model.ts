import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose'
import { OTP_PURPOSES, type OtpPurposeValue } from '@/modules/auth/auth.constants'

/**
 * One-time password schema.
 *
 * Two properties matter more than the rest:
 *
 * 1. `codeHash` — the plaintext code is never stored. A database dump must not
 *    hand an attacker a working verification code for every pending account.
 * 2. The TTL index on `expiresAt` — MongoDB reaps expired documents on its own,
 *    so there is no cron job to forget and no unbounded collection growth. The
 *    application still checks `expiresAt` explicitly, because the TTL monitor
 *    runs only once a minute and a code must be dead the instant it expires.
 */
export interface OtpAttributes {
  userId: Types.ObjectId
  /** Denormalised for cooldown lookups before a user record is resolved. */
  email: string
  purpose: OtpPurposeValue
  /** SHA-256 of the plaintext code, peppered with the app secret. */
  codeHash: string
  expiresAt: Date
  attempts: number
  maxAttempts: number
  consumedAt?: Date | null
  ip?: string
  userAgent?: string
  createdAt: Date
  updatedAt: Date
}

export type OtpDocument = HydratedDocument<OtpAttributes> & { _id: Types.ObjectId }

const otpSchema = new Schema<OtpAttributes>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: {
        values: OTP_PURPOSES,
        message: '`{VALUE}` is not a supported OTP purpose',
      },
      required: true,
    },
    codeHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      required: true,
      min: 1,
    },
    consumedAt: { type: Date, default: null },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'otps',
  },
)

/**
 * TTL index. `expireAfterSeconds: 0` means “delete when `expiresAt` passes”.
 *
 * Note this reaps consumed codes too, since `expiresAt` is not extended on
 * consumption — exactly the retention behaviour we want.
 */
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'otp_ttl' })

/** Serves “latest active code for this user and purpose”, the hot path. */
otpSchema.index({ userId: 1, purpose: 1, createdAt: -1 })

export const OtpModel: Model<OtpAttributes> = model<OtpAttributes>('Otp', otpSchema)
