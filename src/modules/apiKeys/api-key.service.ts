import crypto from 'node:crypto'
import type { ILogger } from '@/core/logger/logger.interface'
import { ForbiddenError, NotFoundError } from '@/core/errors/app-error'
import { resolveSort, toPagedResult, type PagedResult } from '@/core/http/pagination'
import { dateFromNow } from '@/core/utils/time'
import type { IApiKeyHasher } from '@/core/security/api-key-hasher.interface'
import type { AuthenticatedActor } from '@/modules/auth/auth.types'
import { API_KEY_SORT_FIELDS, ApiKeyStatus } from './api-key.constants'
import { toApiKeyDto, toApiKeyWithSecretDto } from './api-key.mapper'
import type { IApiKeyRepository } from './api-key.repository.interface'
import type {
  ApiKeyContext,
  ApiKeyDto,
  ApiKeyWithSecretDto,
  CreateApiKeyInput,
  ListApiKeysQuery,
} from './api-key.types'

export interface ApiKeyServiceDependencies {
  readonly repository: IApiKeyRepository
  readonly hasher: IApiKeyHasher
  readonly logger: ILogger
}

export interface IApiKeyService {
  create(actor: AuthenticatedActor, input: CreateApiKeyInput): Promise<ApiKeyWithSecretDto>
  list(actor: AuthenticatedActor, query: ListApiKeysQuery): Promise<PagedResult<ApiKeyDto>>
  revoke(actor: AuthenticatedActor, keyId: string): Promise<void>
  /**
   * Verifies a presented key and returns its authenticated context.
   * Never throws for an unrecognised key — returns null so the caller controls
   * the 401 shape, exactly like a failed password comparison in `AuthService`.
   */
  verify(presentedKey: string, ip: string): Promise<ApiKeyContext | null>
}

/**
 * API key domain service.
 *
 * The verification path is allocation-light and side-effect-free on failure:
 * usage is recorded only after every check (status, expiry, hash match)
 * passes, so a flood of invalid keys never writes to the database.
 */
export class ApiKeyService implements IApiKeyService {
  private readonly deps: ApiKeyServiceDependencies
  private readonly log: ILogger

  constructor(dependencies: ApiKeyServiceDependencies) {
    this.deps = dependencies
    this.log = dependencies.logger.child({ component: 'ApiKeyService' })
  }

  public async create(
    actor: AuthenticatedActor,
    input: CreateApiKeyInput,
  ): Promise<ApiKeyWithSecretDto> {
    const generated = this.deps.hasher.generate()

    const entity = await this.deps.repository.create({
      userId: actor.id,
      name: input.name,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      scopes: input.scopes,
      expiresAt: input.expiresInDays
        ? dateFromNow(input.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    })

    this.log.info('API key created', { userId: actor.id, keyId: entity.id, scopes: input.scopes })

    return toApiKeyWithSecretDto(entity, generated.secret)
  }

  public async list(
    actor: AuthenticatedActor,
    query: ListApiKeysQuery,
  ): Promise<PagedResult<ApiKeyDto>> {
    const sort = resolveSort(
      query.sortBy,
      API_KEY_SORT_FIELDS,
      { field: 'createdAt', order: 'desc' },
      query.sortOrder,
    )

    const result = await this.deps.repository.findMany({
      userId: actor.id,
      status: query.status,
      page: query.page,
      limit: query.limit,
      sort,
    })

    return toPagedResult(result.items.map(toApiKeyDto), result.total, query.page, query.limit)
  }

  public async revoke(actor: AuthenticatedActor, keyId: string): Promise<void> {
    const entity = await this.deps.repository.findById(keyId)
    if (!entity) {
      throw new NotFoundError('API key not found.')
    }

    if (entity.userId !== actor.id && actor.role !== 'admin') {
      throw new ForbiddenError('You do not have permission to revoke this API key.')
    }

    if (entity.status === ApiKeyStatus.REVOKED) return

    await this.deps.repository.revoke(keyId, 'revoked_by_owner')

    this.log.info('API key revoked', { userId: actor.id, keyId })
  }

  public async verify(presentedKey: string, ip: string): Promise<ApiKeyContext | null> {
    const prefix = this.deps.hasher.extractPrefix(presentedKey)
    if (!prefix) return null

    const entity = await this.deps.repository.findByPrefix(prefix)
    if (!entity) return null

    if (entity.status === ApiKeyStatus.REVOKED) return null
    if (entity.expiresAt && entity.expiresAt.getTime() <= Date.now()) return null

    const candidateHash = this.deps.hasher.hash(presentedKey)

    // Timing-safe comparison: both are fixed-length hex digests of the same
    // algorithm, so a length mismatch never leaks information either.
    if (!this.timingSafeEqualHex(candidateHash, entity.keyHash)) return null

    void this.deps.repository.recordUsage(entity.id, ip)

    return { keyId: entity.id, userId: entity.userId, scopes: entity.scopes }
  }

  private timingSafeEqualHex(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
  }
}
