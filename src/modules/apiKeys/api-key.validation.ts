import { z } from 'zod'
import { API_KEY_SCOPES, API_KEY_SORT_FIELDS, API_KEY_STATUSES } from './api-key.constants'

/**
 * Request schemas for self-service API key management.
 *
 * Same conventions as every other module: `.strict()` so unknown fields are
 * rejected, and a `.transform()` on `name` strips angle-bracket tag payloads
 * at the boundary rather than storing them and hoping every future renderer
 * escapes on output.
 */

const objectId = z
  .string()
  .length(24, 'Expected a 24-character id')
  .regex(/^[0-9a-fA-F]{24}$/, 'Expected a valid id')

export const createApiKeySchema = z
  .object({
    name: z
      .string({ required_error: 'A key name is required' })
      .trim()
      .min(1, 'A key name is required')
      .max(120, 'Key name is too long')
      .transform((value) => value.replace(/<[^>]*>/g, '')),
    scopes: z
      .array(z.enum(API_KEY_SCOPES as [string, ...string[]]))
      .min(1, 'Select at least one scope')
      .max(API_KEY_SCOPES.length),
    expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
  })
  .strict()

export const apiKeyIdParamSchema = z.object({ id: objectId }).strict()

export const listApiKeysQuerySchema = z
  .object({
    status: z.enum(API_KEY_STATUSES as [string, ...string[]]).optional(),
    sortBy: z.enum(API_KEY_SORT_FIELDS as [string, ...string[]]).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()

export type CreateApiKeyBody = z.infer<typeof createApiKeySchema>
export type ListApiKeysQueryParams = z.infer<typeof listApiKeysQuerySchema>
