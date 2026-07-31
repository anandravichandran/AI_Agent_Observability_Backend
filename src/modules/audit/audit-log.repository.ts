import { Types, type FilterQuery, type Model } from 'mongoose'
import { AuditLogModel } from '@/infrastructure/database/models/audit-log.model'
import type {
  AuditLogAttributes,
  AuditLogDocument,
} from '@/infrastructure/database/models/audit-log.model'
import type { AuditEvent, AuditQuery, AuditQueryResult } from './audit.types'
import type { IAuditLogRepository } from './audit-log.repository.interface'

/** Mongoose adapter for {@link IAuditLogRepository}. */
export class MongooseAuditLogRepository implements IAuditLogRepository {
  private readonly model: Model<AuditLogAttributes>

  constructor(model: Model<AuditLogAttributes> = AuditLogModel) {
    this.model = model
  }

  public async append(event: AuditEvent): Promise<void> {
    await this.model.create({
      action: event.action,
      category: event.category,
      outcome: event.outcome,
      actorId:
        event.actorId && Types.ObjectId.isValid(event.actorId)
          ? new Types.ObjectId(event.actorId)
          : null,
      actorEmail: event.actorEmail ?? null,
      actorRole: event.actorRole ?? null,
      ip: event.ip,
      userAgent: event.userAgent,
      requestId: event.requestId,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      message: event.message ?? null,
      metadata: event.metadata ?? {},
    })
  }

  public async query(query: AuditQuery): Promise<AuditQueryResult> {
    const filter: FilterQuery<AuditLogAttributes> = {}

    // An explicit action list wins over a single action; both beat nothing.
    if (query.actions && query.actions.length > 0) {
      filter.action = { $in: [...query.actions] }
    } else if (query.action) {
      filter.action = query.action
    }

    if (query.category) filter.category = query.category
    if (query.outcome) filter.outcome = query.outcome

    if (query.actorId && Types.ObjectId.isValid(query.actorId)) {
      filter.actorId = new Types.ObjectId(query.actorId)
    }

    if (query.from ?? query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      }
    }

    const skip = (query.page - 1) * query.limit

    // Count and page fetched together; the trail is read rarely enough that a
    // parallel count is cheaper than maintaining a running total.
    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).exec(),
      this.model.countDocuments(filter).exec(),
    ])

    return {
      items: docs.map((doc) => this.toEntity(doc)),
      total,
    }
  }

  private toEntity(doc: AuditLogDocument): AuditQueryResult['items'][number] {
    return {
      id: doc._id.toString(),
      action: doc.action,
      category: doc.category,
      outcome: doc.outcome,
      actorId: doc.actorId?.toString() ?? null,
      actorEmail: doc.actorEmail ?? null,
      actorRole: doc.actorRole ?? null,
      ip: doc.ip,
      userAgent: doc.userAgent,
      requestId: doc.requestId,
      targetType: doc.targetType ?? null,
      targetId: doc.targetId ?? null,
      message: doc.message ?? null,
      metadata: doc.metadata ?? {},
      createdAt: doc.createdAt,
    }
  }
}
