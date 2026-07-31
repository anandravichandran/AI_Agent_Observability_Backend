import type { OtpPurposeValue } from '../auth.constants'
import type { CreateOtpData, OtpEntity } from '../auth.entities'

/** One-time password persistence port. */
export interface IOtpRepository {
  create(data: CreateOtpData): Promise<OtpEntity>

  /**
   * Most recently issued, still-active code for a user and purpose.
   * “Active” means not consumed and not past `expiresAt`.
   * Includes `codeHash`, which is `select: false` in the schema.
   */
  findActive(userId: string, purpose: OtpPurposeValue): Promise<OtpEntity | null>

  /** Issue time of the last code sent, used to enforce the resend cooldown. */
  findLastIssuedAt(userId: string, purpose: OtpPurposeValue): Promise<Date | null>

  /** Atomically increments the attempt counter and returns the new value. */
  incrementAttempts(id: string): Promise<number>

  /** Marks a code used. Consumption is single-use and irreversible. */
  markConsumed(id: string): Promise<void>

  /**
   * Invalidates every outstanding code for a user and purpose.
   *
   * Called before issuing a new one, so a resend supersedes its predecessor
   * instead of leaving several codes valid at once.
   */
  invalidateAll(userId: string, purpose: OtpPurposeValue): Promise<number>
}
