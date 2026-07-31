import type { ErrorDetail } from '@/core/errors/app-error'
import type { ErrorCodeValue } from '@/core/constants/error-codes'

/**
 * The single response envelope for the entire API.
 *
 * Every endpoint — success or failure — returns this shape, so clients can
 * write one parser. `success` is the discriminant.
 */

export interface ResponseMeta {
  readonly requestId: string
  readonly timestamp: string
  readonly durationMs?: number
  readonly path?: string
  readonly method?: string
  readonly [key: string]: unknown
}

export interface PaginationMeta {
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly pageCount: number
  readonly hasNext: boolean
  readonly hasPrevious: boolean
}

export interface SuccessResponse<TData> {
  readonly success: true
  readonly statusCode: number
  readonly message: string
  readonly data: TData
  readonly meta: ResponseMeta
  readonly pagination?: PaginationMeta
}

export interface ErrorResponse {
  readonly success: false
  readonly statusCode: number
  readonly error: {
    readonly code: ErrorCodeValue | string
    readonly message: string
    readonly details?: ErrorDetail[]
    /** Present only outside production. */
    readonly stack?: string
  }
  readonly meta: ResponseMeta
}

export type ApiResponse<TData> = SuccessResponse<TData> | ErrorResponse

export interface BuildSuccessArgs<TData> {
  readonly data: TData
  readonly statusCode: number
  readonly message: string
  readonly meta: ResponseMeta
  readonly pagination?: PaginationMeta
}

export interface BuildErrorArgs {
  readonly statusCode: number
  readonly code: ErrorCodeValue | string
  readonly message: string
  readonly meta: ResponseMeta
  readonly details?: ErrorDetail[]
  readonly stack?: string
}

/**
 * Pure envelope builders.
 *
 * Kept free of Express types so they can be unit tested in isolation and reused
 * by non-HTTP transports later (queue consumers, CLI output, and so on).
 */
export const buildSuccessResponse = <TData>({
  data,
  statusCode,
  message,
  meta,
  pagination,
}: BuildSuccessArgs<TData>): SuccessResponse<TData> => ({
  success: true,
  statusCode,
  message,
  data,
  meta,
  ...(pagination ? { pagination } : {}),
})

export const buildErrorResponse = ({
  statusCode,
  code,
  message,
  meta,
  details,
  stack,
}: BuildErrorArgs): ErrorResponse => ({
  success: false,
  statusCode,
  error: {
    code,
    message,
    ...(details && details.length > 0 ? { details } : {}),
    ...(stack ? { stack } : {}),
  },
  meta,
})

/** Derives pagination metadata from raw paging inputs. */
export const buildPaginationMeta = (
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta => {
  const pageCount = pageSize > 0 ? Math.ceil(total / pageSize) : 0

  return {
    page,
    pageSize,
    total,
    pageCount,
    hasNext: page < pageCount,
    hasPrevious: page > 1,
  }
}
