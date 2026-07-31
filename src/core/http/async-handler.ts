import type { NextFunction, Request, RequestHandler, Response } from 'express'

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>

/**
 * Wraps an async handler so a rejected promise is forwarded to Express'
 * error pipeline instead of becoming an unhandled rejection.
 *
 * Express 4 does not await handlers, so every async controller method must be
 * wrapped. Express 5 makes this redundant, at which point this helper becomes a
 * no-op rather than a breaking change — which is exactly why it is centralised.
 */
export const asyncHandler =
  (handler: AsyncRequestHandler): RequestHandler =>
  (req, res, next): void => {
    void Promise.resolve(handler(req, res, next)).catch(next)
  }
