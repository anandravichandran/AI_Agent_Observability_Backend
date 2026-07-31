import { z } from 'zod'
import {
  createSortSchema,
  limitField,
  pageField,
  searchField,
} from '@/core/query'

/**
 * Query schema for the administrator audit-trail endpoint.
 *
 * Lives in the audit module (rather than borrowing the auth module's schema) so
 * the audit surface owns its own contract. It layers audit-specific filters on
 * top of the shared pagination, sorting, and search primitives.
 */

/** Sortable columns. Restricted to indexed, low-cardinality fields. */
export const AUDIT_SORT_FIELDS = [
  'createdAt',
  'action',
  'category',
  'outcome',
  'actorEmail',
] as const

export const auditQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(64).optional(),
    actorId: z.string().trim().length(24, 'Expected a 24-character id').optional(),
    actorEmail: z.string().trim().toLowerCase().email().optional(),
    category: z.string().trim().min(1).max(32).optional(),
    outcome: z.enum(['success', 'failure']).optional(),
    search: searchField(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: pageField,
    // Capped so a client cannot request the entire trail in one query.
    limit: limitField(100, 20),
    sort: createSortSchema(AUDIT_SORT_FIELDS, { createdAt: -1 }),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must be earlier than `to`',
    path: ['from'],
  })

export type AuditQueryParams = z.infer<typeof auditQuerySchema>
