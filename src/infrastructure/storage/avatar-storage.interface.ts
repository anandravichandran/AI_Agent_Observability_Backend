/**
 * Avatar persistence port.
 *
 * The user service depends on this rather than on the filesystem directly, so a
 * move to object storage (S3, GCS) is a new adapter and a one-line change in
 * the composition root — nothing above the port changes.
 */
export interface IAvatarStorage {
  /**
   * Persists an avatar image and returns its public URL path.
   *
   * Replaces any existing avatar for the user, so a user always has at most
   * one stored file regardless of the extension they upload.
   */
  save(userId: string, data: Buffer, extension: string): Promise<string>

  /**
   * Deletes every stored avatar for a user. Best-effort: a missing file is not
   * an error, because the goal is simply “no avatar on disk”.
   */
  remove(userId: string): Promise<void>
}
