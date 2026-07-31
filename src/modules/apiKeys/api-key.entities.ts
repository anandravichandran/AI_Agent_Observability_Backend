import type { ApiKeyScopeValue, ApiKeyStatusValue } from './api-key.constants'

/**
 * Persistence-agnostic entity. Repositories map Mongoose documents into this
 * shape; no layer above the repository ever imports Mongoose.
 */
export interface ApiKeyEntity {
  readonly id: string
  readonly userId: string
  readonly name: string
  readonly keyPrefix: string
  readonly keyHash: string
  readonly scopes: ApiKeyScopeValue[]
  readonly status: ApiKeyStatusValue
  readonly lastUsedAt: Date | null
  readonly lastUsedIp: string | null
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly revokedReason: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateApiKeyData {
  readonly userId: string
  readonly name: string
  readonly keyPrefix: string
  readonly keyHash: string
  readonly scopes: ApiKeyScopeValue[]
  readonly expiresAt: Date | null
}
