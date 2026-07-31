import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import type { ApiKeyController } from './api-key.controller'
import {
  apiKeyIdParamSchema,
  createApiKeySchema,
  listApiKeysQuerySchema,
} from './api-key.validation'

export interface ApiKeyRouterDependencies {
  readonly controller: ApiKeyController
  /** Access-token guard (composed with CSRF protection in `container.ts`). */
  readonly authenticate: RequestHandler
}

/**
 * Self-service API key management.
 *
 * Mounted behind the same guard as every other account route: a caller must
 * already hold a browser session to mint a service-to-service credential.
 * The keys these routes issue are then used *instead of* that session on
 * machine-to-machine calls, verified by `createApiKeyAuthenticate` rather
 * than this router's guard.
 */
export const createApiKeyRouter = (dependencies: ApiKeyRouterDependencies): Router => {
  const { controller, authenticate } = dependencies
  const router = Router()

  router.use(authenticate)

  router.post('/', validate({ body: createApiKeySchema }), asyncHandler(controller.create))

  router.get('/', validate({ query: listApiKeysQuerySchema }), asyncHandler(controller.list))

  router.delete(
    '/:id',
    validate({ params: apiKeyIdParamSchema }),
    asyncHandler(controller.revoke),
  )

  return router
}
