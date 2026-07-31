import type { Request, Response } from 'express'
import type { CookieConfig } from '@/config/config.types'
import { buildPaginationMeta } from '@/core/http/api-response'
import { clearAuthCookies } from '@/core/http/cookies'
import { requireActor, toRequestContext } from '@/core/http/request-context'
import type { IUserService } from './users.service.interface'
import type {
  ActivityQueryParams,
  ChangePasswordBody,
  DeleteAccountBody,
  LoginHistoryQueryParams,
  UpdateNotificationSettingsBody,
  UpdatePreferencesBody,
  UpdateProfileBody,
  UploadAvatarBody,
} from './users.validation'

export interface UserControllerDependencies {
  readonly userService: IUserService
  readonly cookieConfig: CookieConfig
}

/**
 * HTTP adapter for {@link IUserService}.
 *
 * As with the auth controller, methods are arrow-function properties so they
 * can be handed straight to a route without `.bind(this)`, and they contain no
 * business logic — only request translation, cookie management, and response
 * shaping.
 */
export class UserController {
  private readonly userService: IUserService
  private readonly cookieConfig: CookieConfig

  constructor(dependencies: UserControllerDependencies) {
    this.userService = dependencies.userService
    this.cookieConfig = dependencies.cookieConfig
  }

  // --- Profile -------------------------------------------------------------

  public getProfile = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const profile = await this.userService.getProfile(actor.id)

    res.success({ profile }, 'Profile retrieved.')
  }

  public updateProfile = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as UpdateProfileBody
    const profile = await this.userService.updateProfile(actor.id, body, toRequestContext(req))

    res.success({ profile }, 'Profile updated.')
  }

  // --- Credentials & lifecycle --------------------------------------------

  public changePassword = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as ChangePasswordBody
    const result = await this.userService.changePassword(actor.id, body, toRequestContext(req))

    // Every session was revoked, this one included; clear the cookies so the
    // now-dead tokens are not sent on the next request.
    clearAuthCookies(res, this.cookieConfig)

    res.success(
      { passwordChanged: true, ...result },
      'Password changed. Sign in again with your new password.',
    )
  }

  public deleteAccount = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as DeleteAccountBody
    await this.userService.deleteAccount(actor.id, body, toRequestContext(req))

    clearAuthCookies(res, this.cookieConfig)

    res.success({ accountClosed: true }, 'Your account has been closed.')
  }

  // --- Avatar --------------------------------------------------------------

  public uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as UploadAvatarBody
    const profile = await this.userService.uploadAvatar(actor.id, body, toRequestContext(req))

    res.success({ profile }, 'Avatar updated.')
  }

  public removeAvatar = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const profile = await this.userService.removeAvatar(actor.id, toRequestContext(req))

    res.success({ profile }, 'Avatar removed.')
  }

  // --- Preferences & notifications ----------------------------------------

  public getPreferences = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const preferences = await this.userService.getPreferences(actor.id)

    res.success({ preferences }, 'Preferences retrieved.')
  }

  public updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as UpdatePreferencesBody
    const preferences = await this.userService.updatePreferences(
      actor.id,
      body,
      toRequestContext(req),
    )

    res.success({ preferences }, 'Preferences updated.')
  }

  public getNotificationSettings = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const notificationSettings = await this.userService.getNotificationSettings(actor.id)

    res.success({ notificationSettings }, 'Notification settings retrieved.')
  }

  public updateNotificationSettings = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as UpdateNotificationSettingsBody
    const notificationSettings = await this.userService.updateNotificationSettings(
      actor.id,
      body,
      toRequestContext(req),
    )

    res.success({ notificationSettings }, 'Notification settings updated.')
  }

  // --- Activity & login history -------------------------------------------

  public getActivity = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const query = req.query as unknown as ActivityQueryParams
    const result = await this.userService.getActivity(actor.id, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      ...(query.action ? { action: query.action } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
    })

    res.success(
      { activity: result.items },
      'Account activity retrieved.',
      buildPaginationMeta(query.page, query.limit, result.total),
    )
  }

  public getLoginHistory = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const query = req.query as unknown as LoginHistoryQueryParams
    const result = await this.userService.getLoginHistory(actor.id, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      ...(query.outcome ? { outcome: query.outcome } : {}),
    })

    res.success(
      { logins: result.items },
      'Login history retrieved.',
      buildPaginationMeta(query.page, query.limit, result.total),
    )
  }

  // --- Device sessions -----------------------------------------------------

  public listSessions = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const sessions = await this.userService.listSessions(actor.id, actor.sessionId)

    res.success({ sessions, count: sessions.length }, 'Active sessions retrieved.')
  }

  public revokeSession = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { sessionId } = req.params as { sessionId: string }
    await this.userService.revokeSession(
      actor.id,
      sessionId,
      actor.sessionId,
      toRequestContext(req),
    )

    res.success({ revoked: true, sessionId }, 'Session revoked.')
  }

  public revokeOtherSessions = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const result = await this.userService.revokeOtherSessions(
      actor.id,
      actor.sessionId,
      toRequestContext(req),
    )

    res.success(result, 'Signed out of all other devices.')
  }
}
