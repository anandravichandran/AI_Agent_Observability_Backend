import type { ILogger } from '@/core/logger/logger.interface'
import type { PaginationMeta, SuccessResponse } from '@/core/http/api-response'
import type { AuthenticatedActor, AuthTokenSource } from '@/modules/auth/auth.types'
import type { ApiKeyContext } from '@/modules/apiKeys/api-key.types'

/**
 * Express type augmentation.
 *
 * Declaring these here (rather than casting at each call site) is what lets
 * controllers call `res.success(...)`, read `req.id`, and access `req.user`
 * with full type safety.
 */
declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by the request-id middleware. */
      id: string
      /** High-resolution start timestamp, in milliseconds. */
      startTime: number
      /** Request-scoped logger with the request id already bound. */
      logger: ILogger
      /**
       * Present only after `authenticate` has run. Optional by design: a
       * handler that needs a guaranteed principal should sit behind the
       * middleware and use `requireActor(req)`.
       */
      user?: AuthenticatedActor
      /** Set by `authenticate` alongside `user`; read by `csrf.middleware.ts`. */
      authTokenSource?: AuthTokenSource
      /** Present only after `createApiKeyAuthenticate` has run. */
      apiKeyContext?: ApiKeyContext
    }

    interface Response {
      /** Sends a 200 success envelope. */
      success<TData>(
        data: TData,
        message?: string,
        pagination?: PaginationMeta,
      ): Response

      /** Sends a 201 success envelope. */
      created<TData>(data: TData, message?: string): Response

      /** Sends a 202 success envelope. */
      accepted<TData>(data: TData, message?: string): Response

      /** Sends a 204 with no body. */
      noContent(): Response

      /** Sends a success envelope with an explicit status code. */
      respond<TData>(
        statusCode: number,
        data: TData,
        message?: string,
        pagination?: PaginationMeta,
      ): Response

      /** Builds an envelope without sending it. Used by the error handler. */
      buildEnvelope<TData>(
        statusCode: number,
        data: TData,
        message: string,
      ): SuccessResponse<TData>
    }
  }
}

export {}
