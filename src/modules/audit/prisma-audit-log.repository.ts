import type { PrismaClient } from '@/infrastructure/database/prisma.client'
import type { AuditEvent, AuditQuery, AuditQueryResult } from './audit.types'
import type { IAuditLogRepository } from './audit-log.repository.interface'

type AuditLogRow = {
  id: string
  action: string
  category: string
  outcome: string
  actorId: string | null
  actorEmail: string | null
  actorRole: string | null
  ip: string
  userAgent: string
  requestId: string
  targetType: string | null
  targetId: string | null
  message: string | null
  metadata: unknown
  createdAt: Date
}

/**
 * Prisma adapter for {@link IAuditLogRepository}.
 *
 * Append-only by design: there is no update or delete method here, matching
 * the interface's contract that the trail cannot be tampered with.
 */
export class PrismaAuditLogRepository implements IAuditLogRepository {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  public async append(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.action,
        category: event.category,
        outcome: event.outcome,
        actorId: event.actorId ?? null,
        actorEmail: event.actorEmail ?? null,
        actorRole: event.actorRole ?? null,
        ip: event.ip,
        userAgent: event.userAgent,
        requestId: event.requestId,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        message: event.message ?? null,
        metadata: event.metadata ?? {},
      },
    })
  }

  public async query(query: AuditQuery): Promise<AuditQueryResult> {
    const where: Record<string, unknown> = {}

    // An explicit action list wins over a single action; both beat nothing.
    if (query.actions && query.actions.length > 0) {
      where['action'] = { in: [...query.actions] }
    } else if (query.action) {
      where['action'] = query.action
    }

    if (query.category) where['category'] = query.category
    if (query.outcome) where['outcome'] = query.outcome
    if (query.actorId) where['actorId'] = query.actorId

    if (query.from || query.to) {
      where['createdAt'] = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      }
    }

    const skip = (query.page - 1) * query.limit

    // Count and page fetched together in one transaction; the trail is read
    // rarely enough that a parallel count is cheaper than a running total.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ])

    return { items: rows.map((row) => this.toEntity(row)), total }
  }

  private toEntity(row: AuditLogRow): AuditQueryResult['items'][number] {
    return {
      id: row.id,
      action: row.action,
      category: row.category,
      outcome: row.outcome as AuditQueryResult['items'][number]['outcome'],
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      actorRole: row.actorRole,
      ip: row.ip,
      userAgent: row.userAgent,
      requestId: row.requestId,
      targetType: row.targetType,
      targetId: row.targetId,
      message: row.message,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
    }
  }
}
