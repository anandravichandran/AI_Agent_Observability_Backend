import type { PrismaClient } from '@/infrastructure/database/prisma.client'
import { toSkip } from '@/core/http/pagination'
import { ApiKeyStatus, type ApiKeyScopeValue } from './api-key.constants'
import type { ApiKeyEntity, CreateApiKeyData } from './api-key.entities'
import type {
  ApiKeyListQuery,
  ApiKeyListResult,
  IApiKeyRepository,
} from './api-key.repository.interface'

type ApiKeyRow = {
  id: string
  userId: string
  name: string
  keyPrefix: string
  keyHash: string
  scopes: string[]
  status: string
  lastUsedAt: Date | null
  lastUsedIp: string | null
  expiresAt: Date | null
  revokedAt: Date | null
  revokedReason: string | null
  createdAt: Date
  updatedAt: Date
}

/** Prisma adapter for {@link IApiKeyRepository}. */
export class PrismaApiKeyRepository implements IApiKeyRepository {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  public async create(data: CreateApiKeyData): Promise<ApiKeyEntity> {
    const row = await this.prisma.apiKey.create({
      data: {
        userId: data.userId,
        name: data.name,
        keyPrefix: data.keyPrefix,
        keyHash: data.keyHash,
        scopes: data.scopes,
        status: ApiKeyStatus.ACTIVE,
        expiresAt: data.expiresAt,
      },
    })

    return this.toEntity(row)
  }

  public async findById(id: string): Promise<ApiKeyEntity | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { id } })
    return row ? this.toEntity(row) : null
  }

  public async findByPrefix(keyPrefix: string): Promise<ApiKeyEntity | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { keyPrefix } })
    return row ? this.toEntity(row) : null
  }

  public async findMany(query: ApiKeyListQuery): Promise<ApiKeyListResult> {
    const where: Record<string, unknown> = { userId: query.userId }
    if (query.status) where['status'] = query.status

    const [items, total] = await this.prisma.$transaction([
      this.prisma.apiKey.findMany({
        where,
        orderBy: { [query.sort.field]: query.sort.order },
        skip: toSkip({ page: query.page, limit: query.limit }),
        take: query.limit,
      }),
      this.prisma.apiKey.count({ where }),
    ])

    return { items: items.map((row) => this.toEntity(row)), total }
  }

  public async revoke(id: string, reason: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id, revokedAt: null },
      data: { status: ApiKeyStatus.REVOKED, revokedAt: new Date(), revokedReason: reason },
    })
  }

  public async recordUsage(id: string, ip: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id },
      data: { lastUsedAt: new Date(), lastUsedIp: ip },
    })
  }

  private toEntity(row: ApiKeyRow): ApiKeyEntity {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      keyPrefix: row.keyPrefix,
      keyHash: row.keyHash,
      scopes: row.scopes as ApiKeyScopeValue[],
      status: row.status as ApiKeyEntity['status'],
      lastUsedAt: row.lastUsedAt,
      lastUsedIp: row.lastUsedIp,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      revokedReason: row.revokedReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
