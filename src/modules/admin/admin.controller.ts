import type { Request, Response } from 'express'
import { requireActor, toRequestContext } from '@/core/http/request-context'
import type { IAdminService } from './admin.service'
import type {
  ListUsersQueryParams,
  UpdateUserRoleBody,
  UpdateUserStatusBody,
} from '@/modules/users/user.validation'
import type { UserRoleValue, UserStatusValue } from '@/modules/auth/auth.constants'

/**
 * HTTP adapter for administrator account management.
 *
 * Thin like every controller here: translate, call the service, shape the
 * envelope. The route's role gate guarantees `req.user` is an admin; the
 * service enforces the finer privilege rules (no self-mutation, no
 * admin-on-admin) against the specific target.
 */
export class AdminController {
  private readonly adminService: IAdminService

  constructor(adminService: IAdminService) {
    this.adminService = adminService
  }

  public listUsers = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as ListUsersQueryParams

    const result = await this.adminService.listUsers({
      ...(query.search ? { search: query.search } : {}),
      ...(query.role ? { role: query.role as UserRoleValue } : {}),
      ...(query.status ? { status: query.status as UserStatusValue } : {}),
      ...(query.sortBy ? { sortBy: query.sortBy } : {}),
      ...(query.sortOrder ? { sortOrder: query.sortOrder } : {}),
      page: query.page,
      limit: query.limit,
    })

    res.success({ users: result.items }, 'Users retrieved.', result.meta)
  }

  public getUser = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string }
    const user = await this.adminService.getUser(id)

    res.success({ user }, 'User retrieved.')
  }

  public updateRole = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }
    const { role } = req.body as UpdateUserRoleBody

    const user = await this.adminService.updateRole(
      actor,
      id,
      role as UserRoleValue,
      toRequestContext(req),
    )

    res.success({ user }, 'Role updated. The user has been signed out to apply it.')
  }

  public updateStatus = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }
    const { status } = req.body as UpdateUserStatusBody

    const user = await this.adminService.updateStatus(
      actor,
      id,
      status as UserStatusValue,
      toRequestContext(req),
    )

    res.success({ user }, 'Status updated.')
  }

  public revokeSessions = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }

    const revoked = await this.adminService.revokeUserSessions(
      actor,
      id,
      toRequestContext(req),
    )

    res.success({ revokedSessions: revoked }, 'All sessions revoked.')
  }

  public listSessions = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string }
    const sessions = await this.adminService.listUserSessions(id)

    res.success({ sessions, count: sessions.length }, 'User sessions retrieved.')
  }
}
