import { loadEnv, type Env } from './env'
import { getPackageInfo } from './package-info'
import { parseDurationMs } from '@/core/utils/time'
import type { AppConfig } from './config.types'

export * from './config.types'
export { loadEnv, resetEnvCache, EnvironmentValidationError, type Env } from './env'
export { getPackageInfo, type PackageInfo } from './package-info'

/**
 * Express' `trust proxy` accepts a boolean, a hop count, or a string spec.
 * The environment always arrives as a string, so normalise it once here.
 */
const parseTrustProxy = (raw: string): boolean | number | string => {
  const value = raw.trim()
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10)
  return value
}

/**
 * Development-only fallback signing keys.
 *
 * `env.ts` makes the real secrets mandatory in production, so these can only
 * ever be reached on a developer machine or in a test run. They are constants
 * rather than random values so tokens survive a hot reload.
 */
const DEV_ACCESS_SECRET = 'armforge-development-access-secret-do-not-use-in-production'
const DEV_REFRESH_SECRET = 'armforge-development-refresh-secret-do-not-use-in-production'

/**
 * Builds the immutable application configuration from a validated environment.
 *
 * Exported as a factory (not just a singleton) so tests and tooling can build a
 * config from an arbitrary environment without touching `process.env`.
 */
export const buildConfig = (env: Env = loadEnv()): AppConfig => {
  const pkg = getPackageInfo()
  const basePath = `${env.API_PREFIX}/${env.API_VERSION}`

  // SameSite=None is meaningless without Secure, and production must never
  // transmit a session cookie over plaintext regardless of configuration.
  const cookieSecure =
    env.NODE_ENV === 'production' || env.COOKIE_SECURE || env.COOKIE_SAME_SITE === 'none'

  return Object.freeze({
    app: Object.freeze({
      name: env.APP_NAME,
      title: 'ArmForge AI Backend',
      version: pkg.version,
      description:
        'Autonomous AI optimization and benchmarking platform for Arm — platform API.',
      env: env.NODE_ENV,
      isProduction: env.NODE_ENV === 'production',
      isDevelopment: env.NODE_ENV === 'development',
      isTest: env.NODE_ENV === 'test',
      webUrl: env.APP_WEB_URL.replace(/\/+$/, ''),
    }),

    http: Object.freeze({
      port: env.PORT,
      host: env.HOST,
      prefix: env.API_PREFIX,
      version: env.API_VERSION,
      basePath,
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      bodyLimit: env.BODY_LIMIT,
      shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    }),

    database: Object.freeze({
      uri: env.MONGO_URI,
      dbName: env.MONGO_DB_NAME,
      maxPoolSize: env.MONGO_MAX_POOL_SIZE,
      minPoolSize: env.MONGO_MIN_POOL_SIZE,
      serverSelectionTimeoutMs: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
      socketTimeoutMs: env.MONGO_SOCKET_TIMEOUT_MS,
      autoIndex: env.MONGO_AUTO_INDEX,
      retryAttempts: env.MONGO_RETRY_ATTEMPTS,
      retryDelayMs: env.MONGO_RETRY_DELAY_MS,
    }),

    logger: Object.freeze({
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY,
      toFile: env.LOG_TO_FILE,
      dir: env.LOG_DIR,
      maxFiles: env.LOG_MAX_FILES,
      serviceName: env.APP_NAME,
      env: env.NODE_ENV,
    }),

    cors: Object.freeze({
      origins: Object.freeze([...env.CORS_ORIGINS]) as unknown as string[],
      credentials: env.CORS_CREDENTIALS,
      allowAnyOrigin: env.CORS_ORIGINS.includes('*'),
    }),

    rateLimit: Object.freeze({
      enabled: env.RATE_LIMIT_ENABLED,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      authWindowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
      authMax: env.AUTH_RATE_LIMIT_MAX,
    }),

    swagger: Object.freeze({
      enabled: env.SWAGGER_ENABLED,
      path: env.SWAGGER_PATH,
    }),

    auth: Object.freeze({
      jwt: Object.freeze({
        accessSecret: env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
        refreshSecret: env.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET,
        accessTtl: env.JWT_ACCESS_TTL,
        refreshTtl: env.JWT_REFRESH_TTL,
        accessTtlMs: parseDurationMs(env.JWT_ACCESS_TTL),
        refreshTtlMs: parseDurationMs(env.JWT_REFRESH_TTL),
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      }),
      password: Object.freeze({
        saltRounds: env.BCRYPT_SALT_ROUNDS,
      }),
      lockout: Object.freeze({
        maxFailedAttempts: env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
        lockDurationMs: env.AUTH_LOCK_DURATION_MS,
        maxActiveSessions: env.AUTH_MAX_ACTIVE_SESSIONS,
      }),
    }),

    otp: Object.freeze({
      length: env.OTP_LENGTH,
      ttlMs: env.OTP_TTL_MS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      resendCooldownMs: env.OTP_RESEND_COOLDOWN_MS,
    }),

    cookie: Object.freeze({
      accessName: env.COOKIE_ACCESS_NAME,
      refreshName: env.COOKIE_REFRESH_NAME,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
      secure: cookieSecure,
      sameSite: env.COOKIE_SAME_SITE,
      path: '/',
      // Scoped so the refresh token is never attached to ordinary API calls,
      // shrinking its exposure to XSS-adjacent leaks and proxy logs.
      refreshPath: `${basePath}/auth`,
    }),

    mail: Object.freeze({
      transport: env.MAIL_TRANSPORT,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
      ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
      from: env.MAIL_FROM,
      ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
    }),
  })
}
