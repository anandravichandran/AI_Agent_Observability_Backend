import compression from 'compression'
import type { RequestHandler } from 'express'

/**
 * Response compression.
 *
 * Honours the standard `x-no-compression` opt-out so streaming or
 * already-compressed payloads can bypass gzip on a per-request basis.
 */
export const createCompressionMiddleware = (): RequestHandler =>
  compression({
    // Below ~1 KB the CPU cost outweighs the transfer saving.
    threshold: 1024,
    level: 6,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false
      return compression.filter(req, res)
    },
  })
