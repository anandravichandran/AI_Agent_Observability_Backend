import type { Readable } from 'node:stream'

/**
 * Model file persistence port.
 *
 * The service depends on this rather than on the filesystem directly, so a
 * move to object storage (S3, GCS) is a new adapter and a one-line change in
 * the composition root.
 */
export interface IModelStorage {
  /**
   * Streams a model file to storage and returns the opaque storage path.
   *
   * The caller provides the modelId and version number so the adapter can
   * build a deterministic, collision-free path. The returned path is the one
   * persisted in the database; the adapter uses it for every subsequent
   * operation on this file.
   *
   * Resolves after the file is fully written.
   */
  save(
    modelId: string,
    versionNumber: number,
    extension: string,
    stream: Readable,
    options?: { onProgress?: (bytesWritten: number) => void },
  ): Promise<string>

  /**
   * Removes a stored model file. Best-effort: a missing file is not an error.
   */
  remove(storagePath: string): Promise<void>

  /**
   * Returns a readable stream for serving the file, or null if not found.
   */
  createReadStream(storagePath: string): Promise<Readable | null>

  /**
   * Returns the absolute filesystem path for a stored file, or null.
   * Only meaningful for local adapters; returns null for object-storage adapters.
   */
  resolvePath(storagePath: string): string | null
}
