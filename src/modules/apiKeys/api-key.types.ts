import type { ApiKeyScopeValue, ApiKeyStatusValue } from './api-key.constants'

// ---------------------------------------------------------------------------
// Outbound DTOs
// ---------------------------------------------------------------------------

/** Public projection. Never carries the hash. */
export interface ApiKeyDto {
  readonly id: string
  readonly name: string
  readonly keyPrefix: string
  readonly scopes: ApiKeyScopeValue[]
  readonly status: ApiKeyStatusValue
  readonly lastUsedAt: string | null
  readonly lastUsedIp: string | null
  readonly expiresAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** Returned exactly once, at creation. The raw secret is never persisted or retrievable again. */
export interface ApiKeyWithSecretDto extends ApiKeyDto {
  readonly secret: string
}

// ---------------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  readonly name: string
  readonly scopes: ApiKeyScopeValue[]
  readonly expiresInDays?: number
}

export interface ListApiKeysQuery {
  readonly status?: ApiKeyStatusValue
  readonly sortBy?: string
  readonly sortOrder?: 'asc' | 'desc'
  readonly page: number
  readonly limit: number
}

// ---------------------------------------------------------------------------
// Runtime context attached by the API key authentication middleware
// ---------------------------------------------------------------------------

export interface ApiKeyContext {
  readonly keyId: string
  readonly userId: string
  readonly scopes: ApiKeyScopeValue[]
}
