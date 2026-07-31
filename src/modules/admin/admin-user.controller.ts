import type { Request, Response } from 'express'
import { buildPaginationMeta } from '@/core/http/api-response'
import { requireActor, toRequestContext } from '@/core/http/request-context'
import type { IAdminUserService } from './admin-user.service.interface'
import type { AdminUpdateUserBody, ListUsersQueryParams } from './admin.validation'

/**
 * HTTP adapter for {@link IAdminUserService}.
 *
 * Mounted behind `authenticate` + `requireAdmin`, so every handler can assume a
 * present, administrator principal.
 */
export class AdminUserController {
  private readonly service: IAdminUserService

  constructor(service: IAdminUserService) {
    this.service = service
  }

  public listUsers = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as ListUsersQueryParams

    const result = await this.service.listUsers({
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      ...(query.search ? { search: query.search } : {}),
      filters: {
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.verified !== undefined ? { isEmailVerified: query.verified } : {}),
      },
    })

    res.success(
      { users: result.items },
      'Users retrieved.',
      buildPaginationMeta(query.page, query.limit, result.total),
    )
  }

  public getUser = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string }
    const user = await this.service.getUser(userId)

    res.success({ user }, 'User retrieved.')
  }

  public updateUser = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { userId } = req.params as { userId: string }
    const body = req.body as AdminUpdateUserBody

    const user = await this.service.updateUser(
      actor.id,
      userId,
      {
        ...(body.role ? { role: body.role } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
      toRequestContext(req),
    )

    res.success({ user }, 'User updated.')
  }

  public deleteUser = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { userId } = req.params as { userId: string }
    await this.service.deleteUser(actor.id, userId, toRequestContext(req))

    res.success({ userId, deleted: true }, 'User account closed.')
  }

  public revokeUserSessions = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { userId } = req.params as { userId: string }
    const result = await this.service.revokeUserSessions(
      actor.id,
      userId,
      toRequestContext(req),
    )

    res.success({ userId, ...result }, 'User sessions revoked.')
  }
}
