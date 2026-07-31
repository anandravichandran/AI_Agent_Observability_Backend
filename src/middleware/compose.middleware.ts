import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Sequences several Express middleware into a single `RequestHandler`.
 *
 * Every guard mounted by a router in this codebase (`authenticate`,
 * `requireAdmin`, ...) is typed as one `RequestHandler`. This lets the
 * composition root build a single guard out of several — e.g. JWT
 * verification followed by CSRF verification — without changing any route
 * module's dependency shape. Short-circuits on the first error, identically
 * to Express's own middleware chain.
 */
export const chainMiddleware = (...handlers: RequestHandler[]): RequestHandler => {
  return (req: Request, res: Response, done: NextFunction): void => {
    const run = (index: number, error?: unknown): void => {
      if (error) {
        done(error)
        return
      }

      const handler = handlers[index]
      if (!handler) {
        done()
        return
      }

      handler(req, res, (nextError?: unknown) => run(index + 1, nextError))
    }

    run(0)
  }
}
