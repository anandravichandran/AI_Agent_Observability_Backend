import crypto from 'node:crypto'
import type { OtpConfig } from '@/config/config.types'
import type { GeneratedOtp, IOtpService } from './otp-service.interface'

/**
 * Numeric OTP adapter.
 *
 * A six digit code is only ~20 bits of entropy, which is fine *only* because
 * three other controls bound the guessing surface: a short TTL, a per-code
 * attempt cap, and a rate limiter on the endpoint. Remove any one of those and
 * the code length stops being adequate.
 */
export class OtpService implements IOtpService {
  private readonly length: number
  private readonly pepper: string

  /**
   * @param pepper Server-side secret mixed into the hash. Unlike a salt it is
   * not stored alongside the digest, so a database-only compromise cannot be
   * used to precompute codes — which matters enormously for a 6-digit secret,
   * where the entire keyspace is a million entries.
   */
  constructor(config: OtpConfig, pepper: string) {
    this.length = config.length
    this.pepper = pepper
  }

  public generate(): GeneratedOtp {
    const max = 10 ** this.length

    // `randomInt` is rejection-sampled and uniform. `Math.random()` is neither
    // uniform enough nor unpredictable, and must never generate a credential.
    const value = crypto.randomInt(0, max)
    const code = value.toString().padStart(this.length, '0')

    return { code, codeHash: this.hash(code) }
  }

  public verify(code: string, codeHash: string): boolean {
    const candidate = this.hash(code.trim())

    const candidateBuffer = Buffer.from(candidate, 'hex')
    const storedBuffer = Buffer.from(codeHash, 'hex')

    // `timingSafeEqual` throws on a length mismatch, which would itself leak
    // information. Both operands are SHA-256 digests, so unequal lengths only
    // happen with a corrupt record — fail closed.
    if (candidateBuffer.length !== storedBuffer.length) return false

    return crypto.timingSafeEqual(candidateBuffer, storedBuffer)
  }

  private hash(code: string): string {
    return crypto.createHmac('sha256', this.pepper).update(code).digest('hex')
  }
}
