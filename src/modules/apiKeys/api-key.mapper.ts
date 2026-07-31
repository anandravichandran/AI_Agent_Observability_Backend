import type { ApiKeyEntity } from './api-key.entities'
import type { ApiKeyDto, ApiKeyWithSecretDto } from './api-key.types'

/**
 * Entity to DTO projection.
 *
 * An explicit whitelist, never a spread — the same rule `auth.mapper.ts`
 * documents. `keyHash` never leaves this file.
 */
export const toApiKeyDto = (entity: ApiKeyEntity): ApiKeyDto => ({
  id: entity.id,
  name: entity.name,
  keyPrefix: entity.keyPrefix,
  scopes: entity.scopes,
  status: entity.status,
  lastUsedAt: entity.lastUsedAt?.toISOString() ?? null,
  lastUsedIp: entity.lastUsedIp,
  expiresAt: entity.expiresAt?.toISOString() ?? null,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
})

export const toApiKeyWithSecretDto = (
  entity: ApiKeyEntity,
  secret: string,
): ApiKeyWithSecretDto => ({
  ...toApiKeyDto(entity),
  secret,
})
