import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

/**
 * Environment loading and validation.
 *
 * This is the only place in the codebase permitted to read `process.env`.
 * Everything downstream consumes the strongly typed, validated `Env` object
 * (and, more usually, the derived `AppConfig` in `src/config/index.ts`).
 *
 * Failing fast here means a misconfigured deployment can never reach the
 * request-handling stage in a half-working state.
 */

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

/** Parses `"true" | "1" | "yes" | "on"` (case-insensitive) into a boolean. */
const booleanFromString = (defaultValue: boolean): z.ZodType<boolean> =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value) => {
      if (typeof value === 'boolean') return value
      return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
    })

/** Splits a comma separated list into a trimmed, non-empty string array. */
const csvList = z
  .string()
  .default('*')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )

/** A `jsonwebtoken` style duration: `15m`, `7d`, `3600s`, or bare seconds. */
const duration = (defaultValue: string): z.ZodType<string> =>
  z
    .string()
    .default(defaultValue)
    .refine(
      (value) => /^\d+(ms|s|m|h|d|w|y)?$/.test(value.trim()),
      'Expected a duration such as "15m", "7d", or "3600"',
    )

/** Treats an empty string as absent, which is how blank .env entries read. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : undefined
  })

const envSchema = z
  .object({
    // --- Application -------------------------------------------------------
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('armforge-ai-backend'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    HOST: z.string().min(1).default('0.0.0.0'),
    API_PREFIX: z
      .string()
      .default('/api')
      .transform((value) => (value.startsWith('/') ? value : `/${value}`))
      .transform((value) => value.replace(/\/+$/, '')),
    API_VERSION: z
      .string()
      .regex(/^v\d+$/, 'API_VERSION must look like "v1"')
      .default('v1'),
    TRUST_PROXY: z.string().default('loopback'),
    BODY_LIMIT: z.string().default('1mb'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
    APP_WEB_URL: z.string().url().default('http://localhost:3000'),

    // --- MongoDB -----------------------------------------------------------
    MONGO_URI: z
      .string()
      .min(1, 'MONGO_URI is required')
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGO_URI must start with mongodb:// or mongodb+srv://',
      ),
    MONGO_DB_NAME: z.string().min(1).default('armforge'),
    MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(1).default(10),
    MONGO_MIN_POOL_SIZE: z.coerce.number().int().min(0).default(2),
    MONGO_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
    MONGO_SOCKET_TIMEOUT_MS: z.coerce.number().int().min(100).default(45_000),
    MONGO_AUTO_INDEX: booleanFromString(true),
    MONGO_RETRY_ATTEMPTS: z.coerce.number().int().min(0).default(5),
    MONGO_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(2_000),

    // --- Logging -----------------------------------------------------------
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
    LOG_PRETTY: booleanFromString(false),
    LOG_TO_FILE: booleanFromString(false),
    LOG_DIR: z.string().default('logs'),
    LOG_MAX_FILES: z.string().default('14d'),

    // --- CORS --------------------------------------------------------------
    CORS_ORIGINS: csvList,
    CORS_CREDENTIALS: booleanFromString(false),

    // --- Rate limiting -----------------------------------------------------
    RATE_LIMIT_ENABLED: booleanFromString(true),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),

    // --- Documentation -----------------------------------------------------
    SWAGGER_ENABLED: booleanFromString(true),
    SWAGGER_PATH: z
      .string()
      .default('/docs')
      .transform((value) => (value.startsWith('/') ? value : `/${value}`)),

    // --- JWT ---------------------------------------------------------------
    // Optional at the schema level so local development works out of the box;
    // the superRefine below makes them mandatory in production.
    JWT_ACCESS_SECRET: optionalString,
    JWT_REFRESH_SECRET: optionalString,
    JWT_ACCESS_TTL: duration('15m'),
    JWT_REFRESH_TTL: duration('7d'),
    JWT_ISSUER: z.string().min(1).default('armforge-ai'),
    JWT_AUDIENCE: z.string().min(1).default('armforge-ai-clients'),

    // --- Password & lockout ------------------------------------------------
    // 10 is the practical floor for bcrypt today; 31 is the algorithm ceiling.
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(31).default(12),
    AUTH_MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    AUTH_LOCK_DURATION_MS: z.coerce.number().int().min(1_000).default(900_000),
    AUTH_MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).default(5),

    // --- OTP ---------------------------------------------------------------
    OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
    OTP_TTL_MS: z.coerce.number().int().min(30_000).default(600_000),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    OTP_RESEND_COOLDOWN_MS: z.coerce.number().int().min(0).default(60_000),

    // --- Cookies -----------------------------------------------------------
    COOKIE_ACCESS_NAME: z.string().min(1).default('armforge_access'),
    COOKIE_REFRESH_NAME: z.string().min(1).default('armforge_refresh'),
    COOKIE_DOMAIN: optionalString,
    COOKIE_SECURE: booleanFromString(false),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    // --- Mail --------------------------------------------------------------
    MAIL_TRANSPORT: z.enum(['smtp', 'stream']).default('stream'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: booleanFromString(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    MAIL_FROM: z.string().min(1).default('ArmForge AI <no-reply@armforge.ai>'),
    MAIL_REPLY_TO: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.MONGO_MIN_POOL_SIZE > env.MONGO_MAX_POOL_SIZE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONGO_MIN_POOL_SIZE'],
        message: 'Must be less than or equal to MONGO_MAX_POOL_SIZE',
      })
    }

    const isProduction = env.NODE_ENV === 'production'

    // --- Secrets ---------------------------------------------------------
    // Never allow a deployment to run on a fallback signing key. A weak or
    // shared secret is a total compromise of the auth system, so this is a
    // hard boot failure rather than a warning.
    const secretFields = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const

    for (const field of secretFields) {
      const value = env[field]

      if (isProduction && !value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Required in production. Generate at least 32 random characters.',
        })
        continue
      }

      if (value && value.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Must be at least 32 characters (received ${String(value.length)}).`,
        })
      }
    }

    // Reusing one secret for both token types would let an access token be
    // replayed as a refresh token, defeating rotation entirely.
    if (
      env.JWT_ACCESS_SECRET &&
      env.JWT_REFRESH_SECRET &&
      env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'Must differ from JWT_ACCESS_SECRET.',
      })
    }

    // --- Cookies -----------------------------------------------------------
    if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE && !isProduction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SAME_SITE'],
        message: 'SameSite=None requires COOKIE_SECURE=true.',
      })
    }

    // --- CORS --------------------------------------------------------------
    // Browsers reject `Access-Control-Allow-Origin: *` on a credentialed
    // request, so this combination silently breaks cookie auth.
    if (env.CORS_CREDENTIALS && env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'Wildcard origin cannot be combined with CORS_CREDENTIALS=true.',
      })
    }

    // --- Mail --------------------------------------------------------------
    if (isProduction && env.MAIL_TRANSPORT === 'stream') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_TRANSPORT'],
        message: 'The stream transport does not deliver mail; use smtp in production.',
      })
    }

    if (env.MAIL_TRANSPORT === 'smtp' && isProduction && !env.SMTP_USER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message: 'Required when MAIL_TRANSPORT=smtp in production.',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

/**
 * Thrown when the process environment fails validation. Deliberately not an
 * `AppError` — configuration failures happen before the HTTP layer exists.
 */
export class EnvironmentValidationError extends Error {
  public readonly issues: string[]

  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`)
    this.name = 'EnvironmentValidationError'
    this.issues = issues
  }
}

let cachedEnv: Env | undefined

/**
 * Validates and returns the process environment. The result is memoised so
 * repeated calls are free and always observe the same snapshot.
 */
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    )
    throw new EnvironmentValidationError(issues)
  }

  cachedEnv = parsed.data
  return cachedEnv
}

/** Test seam: clears the memoised environment snapshot. */
export const resetEnvCache = (): void => {
  cachedEnv = undefined
}
