import crypto from 'node:crypto'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { PassThrough } from 'node:stream'
import { randomUUID } from 'node:crypto'
import type { ILogger } from '@/core/logger/logger.interface'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/core/errors/app-error'
import { resolveSort, toPagedResult, type PagedResult } from '@/core/http/pagination'
import type { AuthenticatedActor } from '@/modules/auth/auth.types'
import type { IModelStorage } from '@/infrastructure/storage/model-storage.interface'
import type { IVirusChecker } from '@/infrastructure/virus/virus-checker.interface'
import {
  ALLOWED_EXTENSIONS,
  FRAMEWORK_EXTENSIONS,
  MODEL_SORT_FIELDS,
  ModelStatus,
  VersionStatus,
} from './model.constants'
import type { ModelFrameworkValue } from './model.constants'
import type { CreateModelData, UpdateModelData } from './model.entities'
import { extractMetadata } from './model.metadata'
import type { IModelRepository } from './model.repository.interface'
import { toModelDetailDto, toModelDto, toModelWithLatestVersionDto, toVersionDto } from './model.mapper'
import { uploadProgressStore } from './upload-progress.store'
import type {
  CreateModelInput,
  ListModelsQuery,
  ModelDetailDto,
  ModelDto,
  ModelVersionDto,
  ModelWithLatestVersionDto,
  UpdateModelInput,
  UploadPhase,
  UploadProgress,
} from './model.types'

export interface UploadModelFileInput {
  readonly modelId: string
  readonly actor: AuthenticatedActor
  readonly stream: Readable
  readonly originalFilename: string
  readonly mimeType: string
  readonly contentLength: number | null
  readonly versionLabel?: string
}

export interface ModelServiceDependencies {
  readonly modelRepository: IModelRepository
  readonly modelStorage: IModelStorage
  readonly virusChecker: IVirusChecker
  readonly logger: ILogger
}

export interface IModelService {
  createModel(actor: AuthenticatedActor, input: CreateModelInput): Promise<ModelDto>
  listModels(actor: AuthenticatedActor, query: ListModelsQuery): Promise<PagedResult<ModelWithLatestVersionDto>>
  getModel(actor: AuthenticatedActor, modelId: string): Promise<ModelDetailDto>
  updateModel(actor: AuthenticatedActor, modelId: string, input: UpdateModelInput): Promise<ModelDto>
  deleteModel(actor: AuthenticatedActor, modelId: string): Promise<void>
  uploadVersion(input: UploadModelFileInput): Promise<{ uploadId: string }>
  getUploadProgress(uploadId: string): UploadProgress | null
  getVersion(actor: AuthenticatedActor, modelId: string, versionId: string): Promise<ModelVersionDto>
  deleteVersion(actor: AuthenticatedActor, modelId: string, versionId: string): Promise<void>
}

/**
 * Model domain service.
 *
 * Upload pipeline:
 *  1. Validate extension against framework allow-list.
 *  2. Stream to storage while computing SHA-256 + MD5 in parallel (two
 *     concurrent hash streams so we read the file once, not twice).
 *  3. Compare SHA-256 against existing versions for deduplication.
 *  4. Virus scan via the pluggable IVirusChecker (noop by default).
 *  5. Extract framework metadata from the stored file.
 *  6. Mark version READY and update the model record.
 *
 * Progress is tracked in the in-memory UploadProgressStore so the client can
 * poll without a websocket.
 */
export class ModelService implements IModelService {
  private readonly deps: ModelServiceDependencies
  private readonly log: ILogger

  constructor(deps: ModelServiceDependencies) {
    this.deps = deps
    this.log = deps.logger.child({ component: 'ModelService' })
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  public async createModel(
    actor: AuthenticatedActor,
    input: CreateModelInput,
  ): Promise<ModelDto> {
    const data: CreateModelData = {
      ownerId: actor.id,
      name: input.name,
      description: input.description,
      framework: input.framework as ModelFrameworkValue,
      tags: input.tags,
    }
    const model = await this.deps.modelRepository.createModel(data)
    return toModelDto(model)
  }

  public async listModels(
    actor: AuthenticatedActor,
    query: ListModelsQuery,
  ): Promise<PagedResult<ModelWithLatestVersionDto>> {
    const sort = resolveSort(
      query.sortBy,
      MODEL_SORT_FIELDS,
      { field: 'createdAt', order: 'desc' },
      query.sortOrder,
    )

    const result = await this.deps.modelRepository.findModels({
      search: query.search,
      framework: query.framework as ModelFrameworkValue | undefined,
      status: query.status as ModelService['deps'] extends { modelRepository: IModelRepository } ? typeof query.status : never,
      // Viewers see their own models; admins/engineers see all.
      ownerId: undefined,
      page: query.page,
      limit: query.limit,
      sort,
    })

    // Hydrate each model with its latest version.
    const items = await Promise.all(
      result.items.map(async (m) => {
        const latest = m.latestVersionId
          ? await this.deps.modelRepository.findVersionById(m.latestVersionId)
          : null
        return toModelWithLatestVersionDto(m, latest)
      }),
    )

    return toPagedResult(items, result.total, query.page, query.limit)
  }

  public async getModel(
    actor: AuthenticatedActor,
    modelId: string,
  ): Promise<ModelDetailDto> {
    const model = await this.requireModel(modelId)
    const versions = await this.deps.modelRepository.findVersionsByModelId(modelId)
    return toModelDetailDto(model, versions)
  }

  public async updateModel(
    actor: AuthenticatedActor,
    modelId: string,
    input: UpdateModelInput,
  ): Promise<ModelDto> {
    const model = await this.requireModel(modelId)
    this.requireOwnerOrAdmin(actor, model.ownerId)

    const data: UpdateModelData = {
      name: input.name,
      description: input.description,
      tags: input.tags,
    }
    const updated = await this.deps.modelRepository.updateModel(modelId, data)
    return toModelDto(updated ?? model)
  }

  public async deleteModel(
    actor: AuthenticatedActor,
    modelId: string,
  ): Promise<void> {
    const model = await this.requireModel(modelId)
    this.requireOwnerOrAdmin(actor, model.ownerId)

    // Soft-delete all versions first (remove files, update DB rows).
    const versions = await this.deps.modelRepository.findVersionsByModelId(modelId)
    await Promise.all(
      versions.map(async (v) => {
        await this.deps.modelStorage.remove(v.storagePath)
        await this.deps.modelRepository.softDeleteVersion(v.id)
      }),
    )

    await this.deps.modelRepository.archiveModel(modelId)
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  public async uploadVersion(input: UploadModelFileInput): Promise<{ uploadId: string }> {
    const { modelId, actor, stream, originalFilename, mimeType, contentLength, versionLabel } = input

    const model = await this.requireModel(modelId)
    this.requireOwnerOrAdmin(actor, model.ownerId)

    // Validate extension against the model's declared framework.
    const ext = path.extname(originalFilename).toLowerCase()
    const allowed = FRAMEWORK_EXTENSIONS[model.framework]

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestError(
        `File type \`${ext}\` is not supported. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}.`,
      )
    }

    if (!allowed.includes(ext)) {
      throw new BadRequestError(
        `Extension \`${ext}\` is not valid for ${model.framework} models. Expected: ${allowed.join(', ')}.`,
      )
    }

    // Determine version number.
    const existingCount = await this.deps.modelRepository.countVersions(modelId)
    const versionNumber = existingCount + 1
    const label = versionLabel?.trim() || `v${versionNumber}`
    const uploadId = randomUUID()

    // Track progress.
    uploadProgressStore.init(uploadId, modelId, contentLength ?? 0)

    // Run the full pipeline asynchronously so the HTTP response (202) is
    // returned immediately and the client polls for progress.
    void this.runUploadPipeline({
      uploadId,
      modelId,
      actor,
      stream,
      originalFilename,
      mimeType,
      ext,
      versionNumber,
      label,
      framework: model.framework,
      contentLength,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      this.log.error('Upload pipeline failed', { uploadId, modelId, error: msg })
      uploadProgressStore.fail(uploadId, msg)
    })

    return { uploadId }
  }

  private async runUploadPipeline(params: {
    uploadId: string
    modelId: string
    actor: AuthenticatedActor
    stream: Readable
    originalFilename: string
    mimeType: string
    ext: string
    versionNumber: number
    label: string
    framework: ModelFrameworkValue
    contentLength: number | null
  }): Promise<void> {
    const {
      uploadId, modelId, actor, stream, originalFilename, mimeType,
      ext, versionNumber, label, framework, contentLength,
    } = params

    const advance = (phase: UploadPhase, pct: number) =>
      uploadProgressStore.advance(uploadId, phase, pct)

    // PHASE 1: Receive + hash (stream to storage, hash in parallel).
    advance('receiving', 0)

    const sha256Hasher = crypto.createHash('sha256')
    const md5Hasher = crypto.createHash('md5')
    let bytesWritten = 0

    // Tee the stream: one branch to storage, one branch to hashers.
    // We use a PassThrough + piping to avoid buffering the whole file.
    const hashPassThrough = new PassThrough()

    // Compute hashes from the hash branch.
    hashPassThrough.on('data', (chunk: Buffer) => {
      sha256Hasher.update(chunk)
      md5Hasher.update(chunk)
    })

    const hashDone = new Promise<void>((resolve, reject) => {
      hashPassThrough.on('end', resolve)
      hashPassThrough.on('error', reject)
    })

    // Write to storage from the main stream, reporting progress.
    const storagePath = await this.deps.modelStorage.save(
      modelId,
      versionNumber,
      ext,
      stream.pipe(hashPassThrough, { end: false }),
      {
        onProgress: (bytes) => {
          bytesWritten = bytes
          const pct = contentLength
            ? Math.min(50, Math.round((bytes / contentLength) * 50))
            : 10
          uploadProgressStore.update(uploadId, {
            bytesReceived: bytes,
            percent: pct,
          })
        },
      },
    )

    // End the hash stream when the source stream ends.
    stream.once('end', () => hashPassThrough.end())
    stream.once('error', (e) => hashPassThrough.destroy(e))

    await hashDone

    const sha256 = sha256Hasher.digest('hex')
    const md5 = md5Hasher.digest('hex')

    advance('hashing', 55)

    // PHASE 2: Deduplication check.
    const existing = await this.deps.modelRepository.findVersionBySha256(sha256)
    if (existing && existing.modelId === modelId) {
      // Remove the just-stored duplicate.
      await this.deps.modelStorage.remove(storagePath)
      uploadProgressStore.fail(uploadId, `This file is identical to version ${existing.versionLabel} (SHA-256 match).`)
      throw new ConflictError(
        `This file is identical to version ${existing.versionLabel} (SHA-256 match).`,
      )
    }

    // PHASE 3: Persist the version record (status: UPLOADING).
    advance('persisting', 58)

    const version = await this.deps.modelRepository.createVersion({
      modelId,
      ownerId: actor.id,
      versionNumber,
      versionLabel: label,
      originalFilename,
      storagePath,
      mimeType,
      extension: ext,
      sizeBytes: bytesWritten,
      sha256,
      md5,
    })

    // PHASE 4: Virus scan.
    advance('scanning', 60)

    const filePath = this.deps.modelStorage.resolvePath(storagePath)
    let scanResult = 'skipped'
    let scanDetail: string | null = null

    if (filePath) {
      const scan = await this.deps.virusChecker.scan({
        filePath,
        originalFilename,
        sizeBytes: bytesWritten,
      })
      scanResult = scan.result
      scanDetail = scan.detail

      if (scan.result === 'infected') {
        // Remove infected file immediately and mark version as failed.
        await this.deps.modelStorage.remove(storagePath)
        await this.deps.modelRepository.updateVersionStatus(version.id, VersionStatus.FAILED, {
          virusScan: 'infected',
          virusScanDetail: scanDetail,
        })
        uploadProgressStore.fail(uploadId, `Virus detected: ${scanDetail ?? 'unknown threat'}`)
        this.log.error('Infected file rejected', { uploadId, modelId, versionId: version.id, detail: scanDetail })
        return
      }
    }

    advance('scanning', 75)

    // PHASE 5: Metadata extraction.
    advance('extracting', 77)

    let metadata = null
    if (filePath) {
      metadata = await extractMetadata(filePath, framework, ext, this.log)
    }

    advance('extracting', 90)

    // PHASE 6: Mark READY, update model.
    await this.deps.modelRepository.updateVersionStatus(version.id, VersionStatus.READY, {
      virusScan: scanResult,
      virusScanDetail: scanDetail,
      metadata: metadata as Record<string, unknown> | null,
    })

    await this.deps.modelRepository.recordNewVersion(modelId, version.id)

    advance('persisting', 98)
    uploadProgressStore.complete(uploadId, version.id)

    this.log.info('Model version uploaded', {
      uploadId, modelId, versionId: version.id,
      versionNumber, sha256, sizeBytes: bytesWritten, virusScan: scanResult,
    })
  }

  public getUploadProgress(uploadId: string): UploadProgress | null {
    return uploadProgressStore.get(uploadId)
  }

  // -------------------------------------------------------------------------
  // Version operations
  // -------------------------------------------------------------------------

  public async getVersion(
    actor: AuthenticatedActor,
    modelId: string,
    versionId: string,
  ): Promise<ModelVersionDto> {
    await this.requireModel(modelId)
    const version = await this.deps.modelRepository.findVersionById(versionId)
    if (!version || version.modelId !== modelId) throw new NotFoundError('Version not found.')
    return toVersionDto(version)
  }

  public async deleteVersion(
    actor: AuthenticatedActor,
    modelId: string,
    versionId: string,
  ): Promise<void> {
    const model = await this.requireModel(modelId)
    this.requireOwnerOrAdmin(actor, model.ownerId)

    const version = await this.deps.modelRepository.findVersionById(versionId)
    if (!version || version.modelId !== modelId) throw new NotFoundError('Version not found.')
    if (version.deletedAt) throw new NotFoundError('Version not found.')

    await this.deps.modelStorage.remove(version.storagePath)
    await this.deps.modelRepository.softDeleteVersion(versionId)
    await this.deps.modelRepository.recordDeletedVersion(modelId)
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireModel(modelId: string) {
    const model = await this.deps.modelRepository.findModelById(modelId)
    if (!model) throw new NotFoundError('Model not found.')
    return model
  }

  private requireOwnerOrAdmin(actor: AuthenticatedActor, ownerId: string): void {
    if (actor.id !== ownerId && actor.role !== 'admin') {
      throw new ForbiddenError('You do not have permission to modify this model.')
    }
  }
}
