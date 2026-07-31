import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose'
import {
  USER_ROLES,
  USER_STATUSES,
  UserRole,
  UserStatus,
  type UserRoleValue,
  type UserStatusValue,
} from '@/modules/auth/auth.constants'

/**
 * User schema.
 *
 * Deliberately free of instance methods for password comparison: hashing is the
 * responsibility of `IPasswordHasher`, injected into the service. Putting
 * `comparePassword()` on the model would bind the persistence layer to a
 * specific hashing algorithm and make the cost factor untestable.
 */
export interface UserAttributes {
  email: string
  /** bcrypt hash. `select: false` — never loaded unless explicitly requested. */
  passwordHash: string
  firstName: string
  lastName: string
  role: UserRoleValue
  status: UserStatusValue
  isEmailVerified: boolean
  emailVerifiedAt?: Date | null
  lastLoginAt?: Date | null
  lastLoginIp?: string | null
  /** Consecutive failures; reset to zero on any successful authentication. */
  failedLoginAttempts: number
  lockedUntil?: Date | null
  passwordChangedAt?: Date | null
  /** Public path to the uploaded avatar, e.g. `/uploads/avatars/<id>.webp`. */
  avatarUrl?: string | null
  preferences: {
    theme: 'light' | 'dark' | 'system'
  }
  notifications: {
    productUpdates: boolean
    securityAlerts: boolean
    benchmarkResults: boolean
    weeklyDigest: boolean
  }
  /**
   * Soft-delete tombstone. Present (non-null) means the account is deleted;
   * queries for active users must exclude it. Kept rather than hard-deleted so
   * the audit trail and referential integrity survive account closure.
   */
  deletedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export type UserDocument = HydratedDocument<UserAttributes> & { _id: Types.ObjectId }

const userSchema = new Schema<UserAttributes>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      // The single most important line in this file. Every query omits the
      // credential unless it opts in with `.select('+passwordHash')`.
      select: false,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 80,
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: '`{VALUE}` is not a supported role',
      },
      default: UserRole.ENGINEER,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: USER_STATUSES,
        message: '`{VALUE}` is not a supported status',
      },
      default: UserStatus.PENDING,
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    avatarUrl: { type: String, default: null },

    preferences: {
      theme: {
        type: String,
        enum: {
          values: ['light', 'dark', 'system'],
          message: '`{VALUE}` is not a supported theme',
        },
        default: 'system',
      },
    },

    notifications: {
      productUpdates: { type: Boolean, default: true },
      // Forced true on every write in the service layer; the default here only
      // covers first creation. See user.constants for why it cannot be disabled.
      securityAlerts: { type: Boolean, default: true },
      benchmarkResults: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: false },
    },

    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'users',
    /**
     * Defence in depth. Repositories already map documents to DTOs, but if a
     * document is ever serialised directly, the hash must not travel with it.
     */
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id'])
        delete ret['_id']
        delete ret['passwordHash']
        return ret
      },
    },
    toObject: { virtuals: true },
  },
)

userSchema.virtual('fullName').get(function (this: UserAttributes): string {
  return `${this.firstName} ${this.lastName}`.trim()
})

/**
 * Supports the “clean up unverified signups” query and any future admin
 * listing filtered by status and recency.
 */
userSchema.index({ status: 1, createdAt: -1 })

/**
 * Backs the admin user-list filter combination. Sorting by `createdAt`
 * descending over a role+status filter uses this rather than a collection scan.
 */
userSchema.index({ role: 1, status: 1, createdAt: -1 })

export const UserModel: Model<UserAttributes> = model<UserAttributes>('User', userSchema)
