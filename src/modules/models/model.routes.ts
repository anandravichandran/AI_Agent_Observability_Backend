import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import type { ModelController } from './model.controller'
import {
  createModelSchema,
  listModelsQuerySchema,
  modelIdParamSchema,
  updateModelSchema,
  uploadVersionSchema,
  versionIdParamSchema,
} from './model.validation'

export interface ModelRouterDependencies {
  readonly controller: ModelController
  readonly authenticate: RequestHandler
  readonly modelUpload: RequestHandler
}

/**
 * Model domain routes.
 *
 * Upload is a two-step interaction:
 *  1. POST /models              — create the model record (returns id).
 *  2. POST /models/:id/upload   — stream the file (returns uploadId, 202).
 *  3. GET  /models/:id/upload-progress/:uploadId — poll until `phase: done`.
 */
export const createModelRouter = (deps: ModelRouterDependencies): Router => {
  const { controller, authenticate, modelUpload } = deps
  const router = Router()

  router.use(authenticate)

  // Model CRUD
  router.post(
    '/',
    validate({ body: createModelSchema }),
    asyncHandler(controller.createModel),
  )

  router.get(
    '/',
    validate({ query: listModelsQuerySchema }),
    asyncHandler(controller.listModels),
  )

  router.get(
    '/:id',
    validate({ params: modelIdParamSchema }),
    asyncHandler(controller.getModel),
  )

  router.patch(
    '/:id',
    validate({ params: modelIdParamSchema, body: updateModelSchema }),
    asyncHandler(controller.updateModel),
  )

  router.delete(
    '/:id',
    validate({ params: modelIdParamSchema }),
    asyncHandler(controller.deleteModel),
  )

  // Upload
  router.post(
    '/:id/upload',
    validate({ params: modelIdParamSchema }),
    modelUpload,
    asyncHandler(controller.uploadVersion),
  )

  router.get(
    '/:id/upload-progress/:uploadId',
    validate({ params: modelIdParamSchema }),
    asyncHandler(controller.getUploadProgress),
  )

  // Versions
  router.get(
    '/:id/versions',
    validate({ params: modelIdParamSchema }),
    asyncHandler(controller.listVersions),
  )

  router.get(
    '/:id/versions/:versionId',
    validate({ params: versionIdParamSchema }),
    asyncHandler(controller.getVersion),
  )

  router.delete(
    '/:id/versions/:versionId',
    validate({ params: versionIdParamSchema }),
    asyncHandler(controller.deleteVersion),
  )

  return router
}
