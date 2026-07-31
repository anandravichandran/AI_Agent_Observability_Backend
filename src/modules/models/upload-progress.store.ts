import type { UploadPhase, UploadProgress } from './model.types'

/**
 * In-memory upload progress registry.
 *
 * A simple Map is sufficient for a single process. For a horizontally scaled
 * deployment, replace this with a Redis-backed implementation; the interface
 * stays the same.
 *
 * Entries are cleaned up after `TTL_MS` so the map does not grow unboundedly
 * on a long-running process.
 */

const TTL_MS = 30 * 60 * 1000 // 30 minutes

interface Entry {
  data: UploadProgress
  expiresAt: number
}

class UploadProgressStore {
  private readonly map = new Map<string, Entry>()

  public set(progress: UploadProgress): void {
    this.map.set(progress.uploadId, {
      data: progress,
      expiresAt: Date.now() + TTL_MS,
    })
    this.evict()
  }

  public get(uploadId: string): UploadProgress | null {
    const entry = this.map.get(uploadId)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.map.delete(uploadId)
      return null
    }
    return entry.data
  }

  public update(
    uploadId: string,
    patch: Partial<Omit<UploadProgress, 'uploadId'>>,
  ): void {
    const existing = this.get(uploadId)
    if (!existing) return
    this.set({ ...existing, ...patch })
  }

  private evict(): void {
    const now = Date.now()
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiresAt) this.map.delete(key)
    }
  }

  public init(
    uploadId: string,
    modelId: string,
    bytesTotal: number,
  ): UploadProgress {
    const progress: UploadProgress = {
      uploadId,
      modelId,
      phase: 'receiving',
      percent: 0,
      bytesReceived: 0,
      bytesTotal,
      error: null,
      versionId: null,
    }
    this.set(progress)
    return progress
  }

  public advance(
    uploadId: string,
    phase: UploadPhase,
    percent: number,
    extra?: Partial<UploadProgress>,
  ): void {
    this.update(uploadId, { phase, percent, ...extra })
  }

  public fail(uploadId: string, error: string): void {
    this.update(uploadId, { phase: 'failed', percent: 0, error })
  }

  public complete(uploadId: string, versionId: string): void {
    this.update(uploadId, { phase: 'done', percent: 100, versionId })
  }
}

/** Process-singleton progress store. */
export const uploadProgressStore = new UploadProgressStore()
