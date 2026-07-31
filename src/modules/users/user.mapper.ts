import { parseUserAgent } from '@/core/utils/user-agent'
import type { SessionEntity, UserEntity } from '@/modules/auth/auth.entities'
import type { AuditLogEntity } from '@/modules/audit/audit.types'
import type {
  ActivityDto,
  DeviceSessionDto,
  LoginHistoryDto,
  ProfileDto,
} from './user.types'

/**
 * Entity → DTO projection for the account surface.
 *
 * An explicit whitelist, never a spread, for the same reason as the auth
 * mapper: an internal field added to the entity later must not silently leak
 * into a response. Dates are serialised here so the contract is explicit.
 */

export const toProfileDto = (user: UserEntity): ProfileDto => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: `${user.firstName} ${user.lastName}`.trim(),
  role: user.role,
  status: user.status,
  isEmailVerified: user.isEmailVerified,
  avatarUrl: user.avatarUrl,
  preferences: { theme: user.preferences.theme },
  notifications: { ...user.notifications },
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
})

/**
 * Projects a session for the “signed-in devices” view.
 *
 * `tokenHash` and `familyId` are omitted: the hash is a credential derivative
 * and the family id would expose the rotation graph to a client with no use
 * for it. The raw user-agent is parsed into a friendly browser/OS/device label.
 */
export const toDeviceSessionDto = (
  session: SessionEntity,
  currentSessionId: string,
): DeviceSessionDto => {
  const { browser, os, device } = parseUserAgent(session.userAgent)

  return {
    id: session.id,
    ip: session.ip,
    browser,
    os,
    device,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentSessionId,
  }
}

/** One audit row rendered as a login-history entry. */
export const toLoginHistoryDto = (event: AuditLogEntity): LoginHistoryDto => {
  const { browser, os, device } = parseUserAgent(event.userAgent)

  return {
    id: event.id,
    at: event.createdAt.toISOString(),
    ip: event.ip,
    browser,
    os,
    device,
    userAgent: event.userAgent,
    outcome: event.outcome,
    detail: event.message,
  }
}

/** One audit row rendered as an account-activity entry. */
export const toActivityDto = (event: AuditLogEntity): ActivityDto => {
  const { browser, os, device } = parseUserAgent(event.userAgent)

  return {
    id: event.id,
    action: event.action,
    category: event.category,
    outcome: event.outcome,
    at: event.createdAt.toISOString(),
    ip: event.ip,
    browser,
    os,
    device,
    message: event.message,
  }
}
