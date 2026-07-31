import type { PrismaClient } from '@/infrastructure/database/prisma.client'
import type { SessionRevocationReasonValue } from '../auth.constants'
import type { CreateSessionData, SessionEntity } from '../auth.entities'
import type { ISessionRepository } from './session.repository.interface'

type SessionRow = {
  id: string
  userId: string
  familyId: string
  tokenHash: string
  ip: string
  userAgent: string
  fingerprint: string | null
  geoCountry: string | null
  geoIsPrivate: boolean
  expiresAt: Date
  lastUsedAt: Date
  revokedAt: Date | null
  revokedReason: string | null
  replacedBySessionId: string | null
  createdAt: Date
}

/** Prisma adapter for {@link ISessionRepository}. */
export class PrismaSessionRepository implements ISessionRepository {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  public async create(data: CreateSessionData): Promise<SessionEntity> {
    const row = await this.prisma.session.create({
      data: {
        id: data.id,
        userId: data.userId,
        familyId: data.familyId,
        tokenHash: data.tokenHash,
        ip: data.ip,
        userAgent: data.userAgent,
        fingerprint: data.fingerprint,
        geoCountry: data.geoCountry,
        geoIsPrivate: data.geoIsPrivate,
        expiresAt: data.expiresAt,
        lastUsedAt: new Date(),
        revokedAt: null,
        revokedReason: null,
        replacedBySessionId: null,
      },
    })

    return this.toEntity(row)
  }

  public async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    const row = await this.prisma.session.findUnique({ where: { tokenHash } })
    return row ? this.toEntity(row) : null
  }

  public async findById(id: string): Promise<SessionEntity | null> {
    const row = await this.prisma.session.findUnique({ where: { id } })
    return row ? this.toEntity(row) : null
  }

  public async findActiveByUser(userId: string): Promise<SessionEntity[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })

    return rows.map((row) => this.toEntity(row))
  }

  public async countActiveByUser(userId: string): Promise<number> {
    return this.prisma.session.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    })
  }

  public async revoke(
    id: string,
    reason: SessionRevocationReasonValue,
    replacedBySessionId?: string,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
        replacedBySessionId: replacedBySessionId ?? null,
      },
    })
  }

  public async revokeFamily(
    familyId: string,
    reason: SessionRevocationReasonValue,
  ): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    })

    return result.count
  }

  public async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReasonValue,
    exceptSessionId?: string,
  ): Promise<number> {
    const where: Record<string, unknown> = { userId, revokedAt: null }
    if (exceptSessionId) where['id'] = { not: exceptSessionId }

    const result = await this.prisma.session.updateMany({
      where,
      data: { revokedAt: new Date(), revokedReason: reason },
    })

    return result.count
  }

  public async revokeOldestBeyondLimit(
    userId: string,
    keep: number,
    reason: SessionRevocationReasonValue,
  ): Promise<number> {
    // Select the survivors first, then revoke everything else. Computing the
    // "excess" via an offset instead would race with a concurrent login
    // inserting a new session between the two queries.
    const survivors = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: keep,
      select: { id: true },
    })

    const survivorIds = survivors.map((row) => row.id)

    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { notIn: survivorIds } },
      data: { revokedAt: new Date(), revokedReason: reason },
    })

    return result.count
  }

  public async touch(id: string, ip: string, userAgent: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id },
      data: { lastUsedAt: new Date(), ip, userAgent },
    })
  }

  private toEntity(row: SessionRow): SessionEntity {
    return {
      id: row.id,
      userId: row.userId,
      familyId: row.familyId,
      tokenHash: row.tokenHash,
      ip: row.ip,
      userAgent: row.userAgent,
      fingerprint: row.fingerprint,
      geoCountry: row.geoCountry,
      geoIsPrivate: row.geoIsPrivate,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
      revokedReason: row.revokedReason as SessionRevocationReasonValue | null,
      replacedBySessionId: row.replacedBySessionId,
      createdAt: row.createdAt,
    }
  }
}
