/**
 * Password hashing port.
 *
 * Abstracting this is not ceremony. Hashing algorithms have a shelf life — bcrypt
 * replaced MD5, and argon2id will eventually replace bcrypt. When that happens
 * the change is a new adapter plus one line in the composition root, with no
 * edit to any service.
 */
export interface IPasswordHasher {
  /** Hashes a plaintext password with a per-password random salt. */
  hash(plain: string): Promise<string>

  /**
   * Verifies a password against a stored hash.
   * Implementations must compare in constant time.
   */
  compare(plain: string, hash: string): Promise<boolean>

  /**
   * True when a stored hash was produced with weaker parameters than the
   * current configuration, signalling a transparent rehash on next login.
   */
  needsRehash(hash: string): boolean
}
