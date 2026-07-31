import { z } from 'zod'

/**
 * Reusable list-query primitives: pagination, sorting, searching, and the
 * scaffolding for filtering.
 *
 * Every collection endpoint in the API — the admin user directory, the audit
 * trail, a user's own activity and login history — needs the same four things:
 * a bounded page, a validated multi-key sort, an optional free-text search, and
 * a set of exact-match filters. Rather than re-derive that logic (and its
 * security pitfalls) per endpoint, it lives here once.
 *
 * The pieces are deliberately composable at the Zod level rather than bundled
 * into one monolithic schema: each endpoint declares its own `.strict()` object
 * mixing these shared fields with its endpoint-specific filters, so an unknown
 * query parameter is still rejected outright.
 */

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** A Mongoose-style sort specification: `field -> 1` (asc) or `-1` (desc). */
export type SortSpec = Record<string, 1 | -1>

/**
 * Escapes every character that carries special meaning inside a regular
 * expression.
 *
 * Search terms are matched with a MongoDB `$regex`, and a raw term like
 * `a.*b` or `(` would otherwise be interpreted as a pattern — at best returning
 * surprising results, at worst enabling a catastrophic-backtracking (ReDoS)
 * payload. Escaping first turns the term back into a literal substring match.
 */
export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Builds a Zod schema that parses a comma-separated `sort` string into a
 * validated {@link SortSpec}.
 *
 * The wire format is compact and REST-conventional: `sort=-createdAt,email`
 * means "newest first, then by email ascending". A leading `-` is descending,
 * a leading `+` or no prefix is ascending.
 *
 * Every field is checked against an explicit allowlist. That check is not
 * cosmetic — without it a client could sort by an unindexed field and turn a
 * cheap query into a collection scan, or probe for the existence of internal
 * fields. An unknown field is a 422, not a silent fallback, so the client
 * learns immediately that their request was malformed.
 */
export const createSortSchema = (
  sortableFields: readonly string[],
  defaultSort: SortSpec,
  maxKeys = 3,
): z.ZodType<SortSpec, z.ZodTypeDef, unknown> =>
  z
    .string()
    .trim()
    .optional()
    .transform((raw, ctx): SortSpec => {
      if (!raw) return { ...defaultSort }

      const tokens = raw
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0)

      if (tokens.length === 0) return { ...defaultSort }

      if (tokens.length > maxKeys) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `At most ${String(maxKeys)} sort fields are allowed`,
        })
        return z.NEVER
      }

      const spec: SortSpec = {}

      for (const token of tokens) {
        const direction: 1 | -1 = token.startsWith('-') ? -1 : 1
        const field = token.replace(/^[+-]/, '')

        if (!sortableFields.includes(field)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Cannot sort by \`${field}\`. Allowed fields: ${sortableFields.join(', ')}`,
          })
          return z.NEVER
        }

        spec[field] = direction
      }

      return spec
    })

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Page number, one-based. Defaults to the first page. */
export const pageField = z.coerce.number().int().min(1).default(1)

/**
 * Page size, capped so a single request cannot ask for an unbounded slice of a
 * collection. Both the maximum and the default are configurable per endpoint.
 */
export const limitField = (max = 100, defaultValue = 20): z.ZodType<number, z.ZodTypeDef, unknown> =>
  z.coerce.number().int().min(1).max(max).default(defaultValue)

/** Converts a one-based page and a limit into a Mongo `skip` offset. */
export const toSkip = (page: number, limit: number): number => (page - 1) * limit

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

/**
 * Free-text search term. Bounded in length because it becomes a regular
 * expression; an unbounded term is both a performance and a safety hazard.
 */
export const searchField = (maxLength = 128): z.ZodType<string | undefined, z.ZodTypeDef, unknown> =>
  z.string().trim().min(1).max(maxLength).optional()

/**
 * A case-insensitive, anchored-anywhere substring matcher for a set of fields.
 *
 * Returns a Mongo `$or` fragment ready to spread into a filter, or `null` when
 * there is nothing to search for. The term is escaped, so it always matches
 * literally.
 */
export const buildSearchFilter = (
  term: string | undefined,
  fields: readonly string[],
): Record<string, unknown> | null => {
  if (!term || fields.length === 0) return null

  const pattern = new RegExp(escapeRegExp(term), 'i')

  return { $or: fields.map((field) => ({ [field]: pattern })) }
}

// ---------------------------------------------------------------------------
// Boolean query parameters
// ---------------------------------------------------------------------------

/**
 * A tri-state boolean query parameter.
 *
 * Query strings carry booleans as text, so `?verified=true` arrives as the
 * string `"true"`. This accepts the common truthy/falsy spellings and leaves
 * the value absent (rather than `false`) when the parameter is omitted, so a
 * filter can distinguish "only verified" from "don't filter on verification".
 */
export const booleanQueryField = (): z.ZodType<boolean | undefined, z.ZodTypeDef, unknown> =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true' || value === '1'))
