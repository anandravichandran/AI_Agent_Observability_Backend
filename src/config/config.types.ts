/**
 * Central configuration contract.
 *
 * Modules depend on the narrow slice they need (`DatabaseConfig`, `AuthConfig`,
 * ...) rather than on the whole `AppConfig`. That keeps the Interface Segregation
 * Principle intact and makes every collaborator trivial to construct in a test.
 */

export type NodeEnvironment = 'development' | 'test' | 'production'

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug'

export type SameSitePolicy = 'lax' | 'strict' | 'none'

export type MailTransportKind = 'smtp' | 'stream'

export interface AppMetaConfig {
  /** Machine name of the service, used in logs and the OpenAPI document. */
  readonly name: string
  /** Human readable service title. */
  readonly title: string
  /** Semantic version, sourced from package.json. */
  readonly version: string
  readonly description: string
  readonly env: NodeEnvironment
  readonly isProduction: boolean
  readonly isDevelopment: boolean
  readonly isTest: boolean
  /** Public URL of the web client, used to build links in outbound email. */
  readonly webUrl: string
}

export interface HttpConfig {
  readonly port: number
  readonly host: string
  /** e.g. `/api` */
  readonly prefix: string
  /** e.g. `v1` */
  readonly version: string
  /** Fully qualified mount path, e.g. `/api/v1`. */
  readonly basePath: string
  /** Value handed to `app.set('trust proxy', ...)`. */
  readonly trustProxy: boolean | number | string
  /** Body parser size limit, e.g. `1mb`. */
  readonly bodyLimit: string
  readonly shutdownTimeoutMs: number
}

export interface DatabaseConfig {
  readonly uri: string
  readonly dbName: string
  readonly maxPoolSize: number
  readonly minPoolSize: number
  readonly serverSelectionTimeoutMs: number
  readonly socketTimeoutMs: number
  readonly autoIndex: boolean
  readonly retryAttempts: number
  readonly retryDelayMs: number
}

export interface LoggerConfig {
  readonly level: LogLevel
  readonly pretty: boolean
  readonly toFile: boolean
  readonly dir: string
  readonly maxFiles: string
  readonly serviceName: string
  readonly env: NodeEnvironment
}

export interface CorsConfig {
  /** `['*']` means “any origin”. */
  readonly origins: string[]
  readonly credentials: boolean
  readonly allowAnyOrigin: boolean
}

export interface RateLimitConfig {
  readonly enabled: boolean
  readonly windowMs: number
  readonly max: number
  /** Tighter budget for credential and OTP endpoints. */
  readonly authWindowMs: number
  readonly authMax: number
}

export interface SwaggerConfig {
  readonly enabled: boolean
  /** Mount path relative to the API base path, e.g. `/docs`. */
  readonly path: string
}

export interface JwtConfig {
  readonly accessSecret: string
  readonly refreshSecret: string
  /** Human readable TTL, e.g. `15m`. Passed straight to `jsonwebtoken`. */
  readonly accessTtl: string
  readonly refreshTtl: string
  /** Same TTLs resolved to milliseconds, for cookie maxAge and DB expiry. */
  readonly accessTtlMs: number
  readonly refreshTtlMs: number
  readonly issuer: string
  readonly audience: string
}

export interface PasswordConfig {
  readonly saltRounds: number
}

export interface LockoutConfig {
  readonly maxFailedAttempts: number
  readonly lockDurationMs: number
  /** Oldest sessions beyond this count are revoked when a new one is created. */
  readonly maxActiveSessions: number
}

export interface AuthConfig {
  readonly jwt: JwtConfig
  readonly password: PasswordConfig
  readonly lockout: LockoutConfig
}

export interface OtpConfig {
  readonly length: number
  readonly ttlMs: number
  readonly maxAttempts: number
  readonly resendCooldownMs: number
}

export interface CookieConfig {
  readonly accessName: string
  readonly refreshName: string
  readonly csrfName: string
  readonly domain?: string
  readonly secure: boolean
  readonly sameSite: SameSitePolicy
  /** Path for the access cookie. */
  readonly path: string
  /** Narrower path for the refresh cookie, so it is not sent on every request. */
  readonly refreshPath: string
}

export interface MailConfig {
  readonly transport: MailTransportKind
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user?: string
  readonly password?: string
  readonly from: string
  readonly replyTo?: string
}

export interface AppConfig {
  readonly app: AppMetaConfig
  readonly http: HttpConfig
  readonly database: DatabaseConfig
  readonly logger: LoggerConfig
  readonly cors: CorsConfig
  readonly rateLimit: RateLimitConfig
  readonly swagger: SwaggerConfig
  readonly auth: AuthConfig
  readonly otp: OtpConfig
  readonly cookie: CookieConfig
  readonly mail: MailConfig
}

export interface UploadConfig {
  /** Directory uploads are written to, relative to the process cwd. */
  readonly dir: string
  /** Avatar size ceiling in bytes; enforced by the upload middleware. */
  readonly avatarMaxBytes: number
  /** URL prefix the static handler serves `dir` under, e.g. `/uploads`. */
  readonly publicPath: string
}

// Declaration merging extends the AppConfig interface declared above with the
// Phase 3 upload slice, keeping this file's single source of truth intact.
export interface AppConfig {
  readonly upload: UploadConfig
}


export interface ModelUploadConfig {
  /** Directory model files are stored in, relative to process cwd. */
  readonly dir: string
  /** Temp directory for in-progress uploads. Defaults to /tmp. */
  readonly tempDir: string
  /** Max model file size in bytes. */
  readonly maxBytes: number
}

export interface AppConfig {
  readonly modelUpload: ModelUploadConfig
}

// Declaration merging extends AppConfig with the Phase 5 security slices —
// CSRF, API keys, device fingerprinting, and geo tracking — so each phase's
// config remains additive and independently reviewable.
export interface CsrfConfig {
  readonly enabled: boolean
  readonly cookieName: string
  readonly headerName: string
}

export interface ApiKeyConfig {
  readonly prefixLength: number
  readonly secretBytes: number
}

export interface DeviceFingerprintConfig {
  readonly enabled: boolean
  /** `log` records a mismatch without blocking; `strict` rejects the refresh. */
  readonly enforcement: 'log' | 'strict'
}

export interface GeoConfig {
  readonly enabled: boolean
}

export interface AppConfig {
  readonly csrf: CsrfConfig
  readonly apiKey: ApiKeyConfig
  readonly deviceFingerprint: DeviceFingerprintConfig
  readonly geo: GeoConfig
}
