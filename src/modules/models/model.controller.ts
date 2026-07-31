import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { Request, Response } from 'express'
import { requireActor } from '@/core/http/request-context'
import { BadRequestError, NotFoundError } from '@/core/errors/app-error'
import type { IModelService } from './model.service'
import type {
  CreateModelBody,
  ListModelsQuery,
  UpdateModelBody,
  UploadVersionBody,
} from './model.validation'
import type { ModelFrameworkValue, ModelStatusValue } from './model.constants'

export class ModelController {
  private readonly service: IModelService

  constructor(service: IModelService) {
    this.service = service
  }

  // -------------------------------------------------------------------------
  // Model CRUD
  // -------------------------------------------------------------------------

  public createModel = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as CreateModelBody
    const model = await this.service.createModel(actor, {
      name: body.name,
      description: body.description,
      framework: body.framework as ModelFrameworkValue,
      tags: body.tags,
    })
    res.created({ model }, 'Model created.')
  }

  public listModels = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const query = req.query as unknown as ListModelsQuery
    const result = await this.service.listModels(actor, {
      search: query.search,
      framework: query.framework as ModelFrameworkValue | undefined,
      status: query.status as ModelStatusValue | undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    })
    res.success({ models: result.items }, 'Models retrieved.', result.meta)
  }

  public getModel = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }
    const model = await this.service.getModel(actor, id)
    res.success({ model }, 'Model retrieved.')
  }

  public updateModel = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }
    const body = req.body as UpdateModelBody
    const model = await this.service.updateModel(actor, id, {
      name: body.name,
      description: body.description,
      tags: body.tags,
    })
    res.success({ model }, 'Model updated.')
  }

  public deleteModel = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }
    await this.service.deleteModel(actor, id)
    res.success({ deleted: true }, 'Model deleted.')
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  public uploadVersion = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }
    const file = req.file

    if (!file) {
      throw new BadRequestError('Attach a model file in the `file` field.')
    }

    const body = (req.body ?? {}) as UploadVersionBody

    // Stream the multer-buffered temp file into the service pipeline.
    // The service reads it from disk, so there is no memory pressure.
    const fileStream = createReadStream(file.path)

    // Clean up the temp file after the stream is consumed (success or error).
    const cleanupTemp = () => {
      void unlink(file.path).catch(() => { /* best effort */ })
    }
    fileStream.once('end', cleanupTemp)
    fileStream.once('error', cleanupTemp)

    const { uploadId } = await this.service.uploadVersion({
      modelId: id,
      actor,
      stream: fileStream,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      contentLength: file.size,
      versionLabel: body?.versionLabel,
    })

    res.accepted({ uploadId }, 'Upload started. Poll /upload-progress/:uploadId for status.')
  }

  public getUploadProgress = async (req: Request, res: Response): Promise<void> => {
    requireActor(req)
    const { uploadId } = req.params as { uploadId: string }
    const progress = this.service.getUploadProgress(uploadId)
    if (!progress) throw new NotFoundError('Upload not found or expired.')
    res.success({ progress }, 'Upload progress.')
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  public listVersions = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }
    const detail = await this.service.getModel(actor, id)
    res.success({ versions: detail.versions, count: detail.versions.length }, 'Versions retrieved.')
  }

  public getVersion = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id, versionId } = req.params as { id: string; versionId: string }
    const version = await this.service.getVersion(actor, id, versionId)
    res.success({ version }, 'Version retrieved.')
  }

  public deleteVersion = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id, versionId } = req.params as { id: string; versionId: string }
    await this.service.deleteVersion(actor, id, versionId)
    res.success({ deleted: true }, 'Version deleted.')
  }
}
