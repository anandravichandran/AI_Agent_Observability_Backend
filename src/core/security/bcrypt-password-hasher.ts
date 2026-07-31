import bcrypt from 'bcryptjs'
import type { PasswordConfig } from '@/config/config.types'
import type { IPasswordHasher } from './password-hasher.interface'

/**
 * bcrypt adapter for {@link IPasswordHasher}.
 *
 * The cost factor is configuration, not a constant, because the right value
 * changes with hardware. It should be tuned so a single hash takes roughly
 * 200-300ms on production hardware: slow enough to make offline cracking
 * expensive, fast enough that login latency stays acceptable.
 */
export class BcryptPasswordHasher implements IPasswordHasher {
  private readonly saltRounds: number

  constructor(config: PasswordConfig) {
    this.saltRounds = config.saltRounds
  }

  public async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds)
  }

  public async compare(plain: string, hash: string): Promise<boolean> {
    // A malformed or empty stored hash makes bcrypt throw. Treat that as a
    // failed comparison rather than a 500 — a corrupt record should deny
    // access, not leak its existence through a different status code.
    try {
      return await bcrypt.compare(plain, hash)
    } catch {
      return false
    }
  }

  public needsRehash(hash: string): boolean {
    // bcrypt hashes are `$2<variant>$<cost>$<salt+digest>`.
    const cost = Number.parseInt(hash.split('$')[2] ?? '0', 10)
    return Number.isNaN(cost) || cost < this.saltRounds
  }

  /**
   * Burns roughly the same CPU as a real comparison.
   *
   * Called when login is attempted against an address that does not exist. Without
   * it, “no such user” returns in microseconds while “wrong password” takes
   * hundreds of milliseconds, and that timing gap is a reliable user-enumeration
   * oracle regardless of how carefully the response bodies are matched.
   */
  public async fakeCompare(): Promise<void> {
    await bcrypt.hash('timing-equalisation-placeholder', this.saltRounds)
  }
}
