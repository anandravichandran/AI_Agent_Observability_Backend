import type { SortSpec } from '@/core/http/pagination'
import type { ApiKeyStatusValue } from './api-key.constants'
import type { ApiKeyEntity, CreateApiKeyData } from './api-key.entities'

export interface ApiKeyListQuery {
  readonly userId: string
  readonly status?: ApiKeyStatusValue
  readonly page: number
  readonly limit: number
  readonly sort: SortSpec
}

export interface ApiKeyListResult {
  readonly items: ApiKeyEntity[]
  readonly total: number
}

export interface IApiKeyRepository {
  create(data: CreateApiKeyData): Promise<ApiKeyEntity>
  findById(id: string): Promise<ApiKeyEntity | null>
  /** Lookup by the public prefix — the only field an incoming request can be matched on before the secret is verified. */
  findByPrefix(keyPrefix: string): Promise<ApiKeyEntity | null>
  findMany(query: ApiKeyListQuery): Promise<ApiKeyListResult>
  revoke(id: string, reason: string): Promise<void>
  recordUsage(id: string, ip: string): Promise<void>
}
