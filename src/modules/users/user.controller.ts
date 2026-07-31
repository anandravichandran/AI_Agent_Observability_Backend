import type { Request, Response } from 'express'
import type { CookieConfig } from '@/config/config.types'
import { clearAuthCookies } from '@/core/http/cookies'
import { requireActor, toRequestContext } from '@/core/http/request-context'
import { BadRequestError } from '@/core/errors/app-error'
import type { IUserService, UploadedAvatar } from './user.service'
import type {
  ActivityQueryParams,
  ChangePasswordBody,
  DeleteAccountBody,
  LoginHistoryQueryParams,
  UpdateNotificationsBody,
  UpdatePreferencesBody,
  UpdateProfileBody,
} from './user.validation'

export interface UserControllerDependencies {
  readonly userService: IUserService
  readonly cookieConfig: CookieConfig
}

/**
 * HTTP adapter for the account self-service surface.
 *
 * Controllers translate, manage cookies, and shape the response — nothing
 * else. Every method is an arrow-function property so it can be handed to a
 * route without binding. The user id always comes from the verified token via
 * `requireActor`, never from a URL parameter, which is the IDOR invariant the
 * service relies on.
 */
export class UserController {
  private readonly userService: IUserService
  private readonly cookieConfig: CookieConfig

  constructor(dependencies: UserControllerDependencies) {
    this.userService = dependencies.userService
    this.cookieConfig = dependencies.cookieConfig
  }

  public getProfile = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const profile = await this.userService.getProfile(actor.id)

    res.success({ profile }, 'Profile retrieved.')
  }

  public updateProfile = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const profile = await this.userService.updateProfile(
      actor.id,
      req.body as UpdateProfileBody,
      toRequestContext(req),
    )

    res.success({ profile }, 'Profile updated.')
  }

  public changePassword = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    await this.userService.changePassword(
      actor.id,
      actor.sessionId,
      req.body as ChangePasswordBody,
      toRequestContext(req),
    )

    res.success(
      { passwordChanged: true },
      'Password updated. Other devices have been signed out.',
    )
  }

  public deleteAccount = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    await this.userService.deleteAccount(
      actor.id,
      req.body as DeleteAccountBody,
      toRequestContext(req),
    )

    // The account is gone, so clear its cookies to leave the client in a
    // signed-out state rather than holding tokens for a deleted user.
    clearAuthCookies(res, this.cookieConfig)

    res.success({ deleted: true }, 'Your account has been deleted.')
  }

  public uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const file = req.file

    if (!file) {
      throw new BadRequestError('Attach an image in the `avatar` field.')
    }

    const profile = await this.userService.uploadAvatar(
      actor.id,
      { buffer: file.buffer, mimetype: file.mimetype } satisfies UploadedAvatar,
      toRequestContext(req),
    )

    res.success({ profile }, 'Avatar updated.')
  }

  public removeAvatar = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const profile = await this.userService.removeAvatar(actor.id, toRequestContext(req))

    res.success({ profile }, 'Avatar removed.')
  }

  public updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const profile = await this.userService.updatePreferences(
      actor.id,
      req.body as UpdatePreferencesBody,
      toRequestContext(req),
    )

    res.success({ profile }, 'Preferences updated.')
  }

  public updateNotifications = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const notifications = await this.userService.updateNotifications(
      actor.id,
      req.body as UpdateNotificationsBody,
      toRequestContext(req),
    )

    res.success({ notifications }, 'Notification settings updated.')
  }

  public listDeviceSessions = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const sessions = await this.userService.listDeviceSessions(actor.id, actor.sessionId)

    res.success({ sessions, count: sessions.length }, 'Signed-in devices retrieved.')
  }

  public revokeDeviceSession = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }

    await this.userService.revokeDeviceSession(actor.id, id, toRequestContext(req))

    res.success({ revoked: true }, 'Device signed out.')
  }

  public getLoginHistory = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const query = req.query as unknown as LoginHistoryQueryParams

    const result = await this.userService.getLoginHistory(actor.id, {
      ...(query.outcome ? { outcome: query.outcome } : {}),
      page: query.page,
      limit: query.limit,
    })

    res.success({ entries: result.items }, 'Login history retrieved.', result.meta)
  }

  public getActivity = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const query = req.query as unknown as ActivityQueryParams

    const result = await this.userService.getActivity(actor.id, {
      ...(query.action ? { action: query.action } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      page: query.page,
      limit: query.limit,
    })

    res.success({ entries: result.items }, 'Account activity retrieved.', result.meta)
  }
}
