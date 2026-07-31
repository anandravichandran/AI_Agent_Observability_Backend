import morgan, { type StreamOptions } from 'morgan'
import type { Request, RequestHandler, Response } from 'express'
import type { AppMetaConfig } from '@/config/config.types'
import type { WinstonLogger } from '@/core/logger/winston.logger'
import { OBSERVABILITY_PATHS } from '@/core/constants'

/**
 * HTTP access logging via morgan, piped into the application logger.
 *
 * Routing morgan through winston means access logs and application logs share
 * one transport, one format, and one destination — rather than morgan writing
 * unstructured text straight to stdout.
 */
export const createHttpLoggerMiddleware = (
  logger: WinstonLogger,
  app: AppMetaConfig,
): RequestHandler => {
  morgan.token('id', (req) => (req as Request).id ?? '-')
  morgan.token('body-size', (_req, res) => (res as Response).getHeader('content-length')?.toString() ?? '0')

  const format = app.isProduction
    ? ':id :remote-addr :method :url :status :body-size - :response-time ms'
    : ':id :method :url :status :response-time ms'

  const stream: StreamOptions = logger.stream

  return morgan(format, {
    stream,
    // Health probes fire constantly; logging them in production is pure noise.
    skip: (req, res) => {
      if (app.isTest) return true
      if (!app.isProduction) return false

      const isProbe = OBSERVABILITY_PATHS.some((path) => req.url?.endsWith(path))
      return isProbe && res.statusCode < 400
    },
  })
}
