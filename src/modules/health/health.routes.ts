import { Router } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import type { HealthController } from './health.controller'

/**
 * Health and version routes.
 *
 * Built by a factory that receives its controller, so route wiring stays a pure
 * function of its dependencies with no module-level singletons.
 */
export const createHealthRouter = (controller: HealthController): Router => {
  const router = Router()

  router.get('/health', asyncHandler(controller.getHealth))
  router.get('/health/live', controller.getLiveness)
  router.get('/health/ready', asyncHandler(controller.getReadiness))
  router.get('/version', controller.getVersion)

  return router
}
