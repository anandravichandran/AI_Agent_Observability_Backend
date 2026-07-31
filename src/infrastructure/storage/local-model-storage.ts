import {
  createReadStream as fsCreateReadStream,
  createWriteStream,
} from 'node:fs'
import { mkdir, rm, access } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import type { ILogger } from '@/core/logger/logger.interface'
import type { IModelStorage } from './model-storage.interface'

/**
 * Local-filesystem adapter for {@link IModelStorage}.
 *
 * Files live under `<modelsDir>/<modelId>/v<versionNumber><extension>`.
 * One directory per model keeps the file listing manageable and lets the
 * whole model directory be removed atomically during a model deletion.
 *
 * The path convention is an implementation detail of this adapter; the service
 * only ever stores the returned opaque path and passes it back for later
 * operations. Nothing outside this file parses or constructs paths.
 */
export class LocalModelStorage implements IModelStorage {
  private readonly baseDir: string

  constructor(
    modelsDir: string,
    private readonly logger: ILogger,
  ) {
    this.baseDir = path.resolve(process.cwd(), modelsDir)
  }

  public async save(
    modelId: string,
    versionNumber: number,
    extension: string,
    stream: Readable,
    options?: { onProgress?: (bytesWritten: number) => void },
  ): Promise<string> {
    const dir = path.join(this.baseDir, modelId)
    await mkdir(dir, { recursive: true })

    const filename = `v${versionNumber}${extension}`
    const fullPath = path.join(dir, filename)
    const storagePath = path.join(modelId, filename)

    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(fullPath)
      let written = 0

      stream.on('data', (chunk: Buffer) => {
        written += chunk.length
        options?.onProgress?.(written)
      })

      stream.on('error', (err) => {
        writeStream.destroy()
        reject(err)
      })

      writeStream.on('error', reject)
      writeStream.on('finish', resolve)

      stream.pipe(writeStream)
    })

    return storagePath
  }

  public async remove(storagePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, storagePath)

    try {
      await rm(fullPath, { force: true })
    } catch (err) {
      this.logger.warn('Failed to remove model file', {
        storagePath,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  public async createReadStream(storagePath: string): Promise<Readable | null> {
    const fullPath = path.join(this.baseDir, storagePath)

    try {
      await access(fullPath)
      return fsCreateReadStream(fullPath)
    } catch {
      return null
    }
  }

  public resolvePath(storagePath: string): string | null {
    return path.join(this.baseDir, storagePath)
  }
}
