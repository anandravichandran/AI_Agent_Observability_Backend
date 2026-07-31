import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { Headers } from '@/core/constants'
import type { ILogger } from '@/core/logger/logger.interface'
import { now } from '@/core/utils/time'

/** Rejects client-supplied ids that are absurdly long or contain control chars. */
const isAcceptableId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 128 &&
  /^[\w.:-]+$/.test(value)

/**
 * Assigns a correlation id to every request.
 *
 * Honours an inbound `x-request-id` (so a trace survives an API gateway hop)
 * but validates it first — an unvalidated header would let a caller poison log
 * output. Also attaches a request-scoped child logger, which is why this must
 * be registered before any other middleware that logs.
 */
export const createRequestIdMiddleware = (logger: ILogger): RequestHandler => {
  return (req, res, next): void => {
    const inbound =
      req.headers[Headers.REQUEST_ID] ?? req.headers[Headers.CORRELATION_ID]

    const requestId = isAcceptableId(inbound) ? inbound : randomUUID()

    req.id = requestId
    req.startTime = now()
    req.logger = logger.child({ requestId })

    res.setHeader(Headers.REQUEST_ID, requestId)

    next()
  }
}
