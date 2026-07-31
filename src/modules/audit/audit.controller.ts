import type { Request, Response } from 'express'
import { buildPaginationMeta } from '@/core/http/api-response'
import type { IAuditService } from './audit.service.interface'
import type { AuditQueryParams } from './audit.validation'

/**
 * Read access to the security audit trail.
 *
 * Administrator-only, enforced at the route. Exposing it is what makes the
 * trail useful rather than merely present — an audit log nobody can read during
 * an incident is a compliance artefact, not a security control.
 */
export class AuditController {
  private readonly auditService: IAuditService

  constructor(auditService: IAuditService) {
    this.auditService = auditService
  }

  public list = async (req: Request, res: Response): Promise<void> => {
    // Already coerced and defaulted by the validate middleware.
    const query = req.query as unknown as AuditQueryParams

    const result = await this.auditService.query({
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.actorEmail ? { actorEmail: query.actorEmail } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    })

    res.success(
      { events: result.items },
      'Audit events retrieved.',
      buildPaginationMeta(query.page, query.limit, result.total),
    )
  }
}
