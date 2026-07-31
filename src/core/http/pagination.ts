import type { Request } from 'express'
import { buildPaginationMeta, type PaginationMeta } from './api-response'

/**
 * Shared pagination, sorting, and list-query plumbing.
 *
 * Centralised here rather than per module so every list endpoint in the
 * platform pages and sorts identically, and so a policy change (page cap, sort
 * direction token) is a one-file change.
 */

/** Page/limit pair, already validated and defaulted. */
export interface PageParams {
  readonly page: number
  readonly limit: number
}

/** Sort direction token accepted by list endpoints. */
export type SortOrder = 'asc' | 'desc'

/** A resolved, database-ready sort specification. */
export interface SortSpec {
  readonly field: string
  readonly order: SortOrder
}

/** The result of running a paginated query, shaped for the envelope. */
export interface PagedResult<TItem> {
  readonly items: TItem[]
  readonly meta: PaginationMeta
}

/** Hard ceiling on page size, so a client cannot request an entire collection. */
export const MAX_PAGE_SIZE = 100

/**
 * Resolves a sort request against a whitelist.
 *
 * The whitelist is the security control: the requested field is interpolated
 * into a Mongo sort document, so accepting arbitrary strings would let a
 * caller probe for or sort by fields they should not see (or trigger
 * pathological sort plans on unindexed fields). Anything not on the list
 * falls back to the module's declared default.
 */
export const resolveSort = (
  requested: string | undefined,
  allowed: readonly string[],
  fallback: SortSpec,
  order?: SortOrder,
): SortSpec => {
  if (!requested) return { field: fallback.field, order: order ?? fallback.order }

  const field = allowed.includes(requested) ? requested : fallback.field
  return { field, order: order ?? fallback.order }
}

/**
 * Converts a resolved {@link SortSpec} into a Mongoose sort document.
 * Kept as a tiny helper so the direction mapping lives in exactly one place.
 */
export const toSortDocument = (spec: SortSpec): Record<string, 1 | -1> => ({
  [spec.field]: spec.order === 'asc' ? 1 : -1,
})

/** Offset for a page/limit pair. */
export const toSkip = ({ page, limit }: PageParams): number => (page - 1) * limit

/**
 * Wraps a slice plus a total count into a {@link PagedResult}.
 * Controllers spread this straight into the success envelope.
 */
export const toPagedResult = <TItem>(
  items: TItem[],
  total: number,
  page: number,
  limit: number,
): PagedResult<TItem> => ({
  items,
  meta: buildPaginationMeta(page, limit, total),
})

/**
 * Reads a validated pagination query from the request.
 *
 * Assumes the `validate` middleware already ran and coerced `req.query` to the
 * module's schema. This helper performs the cast and nothing else, so the
 * controller reads declaratively.
 */
export const readPageParams = (req: Request): PageParams => {
  const query = req.query as unknown as { page?: number; limit?: number }
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
  }
}
