import type { SessionRevocationReasonValue } from '../auth.constants'
import type { CreateSessionData, SessionEntity } from '../auth.entities'

/**
 * Refresh-token session persistence port.
 *
 * Every lookup is by *hash*, never by raw token: the plaintext refresh token
 * exists only in the client's cookie and in memory during a request.
 */
export interface ISessionRepository {
  create(data: CreateSessionData): Promise<SessionEntity>

  /**
   * Finds a session by token hash regardless of revocation state.
   *
   * Returning revoked rows is deliberate — the caller needs to distinguish
   * “unknown token” from “already-rotated token” to detect replay.
   */
  findByTokenHash(tokenHash: string): Promise<SessionEntity | null>

  findById(id: string): Promise<SessionEntity | null>

  /** Active, unexpired sessions for a user, newest first. */
  findActiveByUser(userId: string): Promise<SessionEntity[]>

  countActiveByUser(userId: string): Promise<number>

  /** Marks one session revoked, optionally recording its successor. */
  revoke(
    id: string,
    reason: SessionRevocationReasonValue,
    replacedBySessionId?: string,
  ): Promise<void>

  /**
   * Revokes every live session in a rotation family.
   * The blast radius for a detected token replay.
   */
  revokeFamily(familyId: string, reason: SessionRevocationReasonValue): Promise<number>

  /** Revokes every live session for a user. Used by logout-all and password reset. */
  revokeAllForUser(
    userId: string,
    reason: SessionRevocationReasonValue,
    exceptSessionId?: string,
  ): Promise<number>

  /**
   * Enforces the per-user session cap by revoking the oldest active sessions
   * beyond `keep`. Returns how many were evicted.
   */
  revokeOldestBeyondLimit(
    userId: string,
    keep: number,
    reason: SessionRevocationReasonValue,
  ): Promise<number>

  touch(id: string, ip: string, userAgent: string): Promise<void>
}
