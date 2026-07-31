import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '@/core/logger/logger.interface'
import type { IAvatarStorage } from './avatar-storage.interface'

/**
 * Filesystem adapter for {@link IAvatarStorage}.
 *
 * Avatars live under `<uploadDir>/avatars/<userId>.<ext>` and are served by the
 * static handler mounted at the configured public path. Storing one file per
 * user (keyed by id, not by original filename) means an upload automatically
 * supersedes the last one and no directory listing ever grows unboundedly.
 *
 * This is appropriate for a single instance. A horizontally scaled deployment
 * should swap in an object-storage adapter; nothing above the port changes.
 */
export class LocalAvatarStorage implements IAvatarStorage {
  private readonly avatarsDir: string

  constructor(
    uploadDir: string,
    private readonly publicPath: string,
    private readonly logger: ILogger,
  ) {
    this.avatarsDir = path.resolve(process.cwd(), uploadDir, 'avatars')
  }

  public async save(userId: string, data: Buffer, extension: string): Promise<string> {
    await mkdir(this.avatarsDir, { recursive: true })

    // A user keeps exactly one avatar: remove any prior file (whatever its
    // extension) before writing the replacement.
    await this.remove(userId)

    const filename = `${userId}.${extension}`
    await writeFile(path.join(this.avatarsDir, filename), data)

    return `${this.publicPath}/avatars/${filename}`
  }

  public async remove(userId: string): Promise<void> {
    let entries: string[]

    try {
      entries = await readdir(this.avatarsDir)
    } catch {
      // Directory does not exist yet — nothing to remove.
      return
    }

    const stale = entries.filter((entry) => entry.startsWith(`${userId}.`))

    await Promise.all(
      stale.map(async (entry) => {
        try {
          await rm(path.join(this.avatarsDir, entry), { force: true })
        } catch (error) {
          // A failed delete must not fail the request; the orphaned file is
          // harmless and can be reclaimed later.
          this.logger.warn('Failed to remove stale avatar file', {
            file: entry,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }),
    )
  }
}
