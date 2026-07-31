/**
 * API key domain constants.
 *
 * Scopes are coarse-grained and additive: a key can hold several, and a route
 * declares the single scope it requires via `requireApiKeyScope`. Kept as a
 * const object (not a TS `enum`) so the values are usable at runtime for Zod,
 * Mongoose, and OpenAPI, exactly like every other domain-constants file in
 * this codebase.
 */

export const ApiKeyScope = {
  MODELS_READ: 'models:read',
  MODELS_WRITE: 'models:write',
  USERS_READ: 'users:read',
  AUDIT_READ: 'audit:read',
  ADMIN: 'admin:*',
} as const

export type ApiKeyScopeValue = (typeof ApiKeyScope)[keyof typeof ApiKeyScope]
export const API_KEY_SCOPES = Object.values(ApiKeyScope) as ApiKeyScopeValue[]

export const ApiKeyStatus = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
} as const

export type ApiKeyStatusValue = (typeof ApiKeyStatus)[keyof typeof ApiKeyStatus]
export const API_KEY_STATUSES = Object.values(ApiKeyStatus) as ApiKeyStatusValue[]

/** Prefix on every generated key, so a leaked credential is recognisable in logs and secret scanners. */
export const API_KEY_TOKEN_PREFIX = 'afk'

/** Sortable fields on the api_keys collection (whitelist for `resolveSort`). */
export const API_KEY_SORT_FIELDS = ['createdAt', 'lastUsedAt', 'name'] as const
export type ApiKeySortField = (typeof API_KEY_SORT_FIELDS)[number]

/**
 * Domain events for the module.
 *
 * No dispatcher exists yet in this codebase (no Redis/BullMQ wiring; see
 * README "Technical debt"), so these are currently informational constants
 * consumed only by structured log lines. They are named and shaped now so a
 * real event bus can be introduced later without renaming anything call
 * sites already depend on.
 */
export const ApiKeyEvent = {
  CREATED: 'api_key.created',
  REVOKED: 'api_key.revoked',
  USED: 'api_key.used',
  VERIFICATION_FAILED: 'api_key.verification_failed',
} as const

export type ApiKeyEventValue = (typeof ApiKeyEvent)[keyof typeof ApiKeyEvent]
