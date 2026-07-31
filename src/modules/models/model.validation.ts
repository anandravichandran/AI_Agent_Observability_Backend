import { z } from 'zod'
import { MODEL_FRAMEWORKS, MODEL_SORT_FIELDS, MODEL_STATUSES } from './model.constants'
import { nonEmptyEnumTuple } from '@/core/utils/zod-enum'

const objectId = z
  .string()
  .length(24, 'Expected a 24-character id')
  .regex(/^[0-9a-fA-F]{24}$/, 'Expected a valid id')

export const createModelSchema = z
  .object({
    name: z
      .string({ required_error: 'Model name is required' })
      .trim()
      .min(1, 'Model name is required')
      .max(200, 'Model name is too long'),
    description: z.string().trim().max(2000, 'Description is too long').default(''),
    framework: z.enum(nonEmptyEnumTuple(MODEL_FRAMEWORKS), {
      errorMap: () => ({ message: `Supported frameworks: ${MODEL_FRAMEWORKS.join(', ')}` }),
    }),
    tags: z
      .array(z.string().trim().min(1).max(50))
      .max(20, 'Maximum 20 tags')
      .default([]),
  })
  .strict()

export const updateModelSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  })
  .strict()
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.tags !== undefined,
    { message: 'Provide at least one field to update' },
  )

export const modelIdParamSchema = z.object({ id: objectId }).strict()

export const versionIdParamSchema = z
  .object({ id: objectId, versionId: objectId })
  .strict()

export const listModelsQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    framework: z.enum(nonEmptyEnumTuple(MODEL_FRAMEWORKS)).optional(),
    status: z.enum(nonEmptyEnumTuple(MODEL_STATUSES)).optional(),
    ownedByMe: z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
    sortBy: z.enum(nonEmptyEnumTuple(MODEL_SORT_FIELDS)).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()

export const uploadVersionSchema = z
  .object({
    versionLabel: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .optional()
  .default({})

export type CreateModelBody = z.infer<typeof createModelSchema>
export type UpdateModelBody = z.infer<typeof updateModelSchema>
export type ListModelsQueryParams = z.infer<typeof listModelsQuerySchema>
export type UploadVersionBody = z.infer<typeof uploadVersionSchema>
