import type { RequestContext } from '@/modules/auth/auth.types'
import type {
  AdminUpdateUserInput,
  AdminUserDto,
  AdminUserListQuery,
  AdminUsersResult,
  SessionsRevokedResult,
} from './admin.types'

/**
 * Administrator user-management port.
 *
 * Every mutating method takes the acting administrator's id (`actorId`)
 * separately from the target user's id, both so the action can be attributed in
 * the audit trail and so the service can refuse self-targeting operations.
 */
export interface IAdminUserService {
  listUsers(query: AdminUserListQuery): Promise<AdminUsersResult>

  getUser(userId: string): Promise<AdminUserDto>

  updateUser(
    actorId: string,
    userId: string,
    input: AdminUpdateUserInput,
    context: RequestContext,
  ): Promise<AdminUserDto>

  /** Soft-deletes a user and revokes all of their sessions. */
  deleteUser(actorId: string, userId: string, context: RequestContext): Promise<void>

  /** Force-signs a user out of every device. */
  revokeUserSessions(
    actorId: string,
    userId: string,
    context: RequestContext,
  ): Promise<SessionsRevokedResult>
}
