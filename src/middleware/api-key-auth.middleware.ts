import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ErrorCode } from '@/core/constants/error-codes'
import { UnauthorizedError, ForbiddenError } from '@/core/errors/app-error'
import type { ApiKeyScopeValue } from '@/modules/apiKeys/api-key.constants'
import { ApiKeyScope } from '@/modules/apiKeys/api-key.constants'
import type { IApiKeyService } from '@/modules/apiKeys/api-key.service'

const API_KEY_HEADER = 'x-api-key'

export interface ApiKeyAuthenticateDependencies {
  readonly apiKeyService: IApiKeyService
}

/**
 * Verifies an `X-API-Key` header and attaches `req.apiKeyContext`.
 *
 * Deliberately separate from `authenticate.middleware.ts`: an API key is not
 * a user session, so it never populates `req.user`. Routes that should
 * accept *either* a browser session or an API key compose this with
 * `createOptionalAuthenticate` and branch on whichever context is present;
 * routes that are API-key-only (none yet — see README) would mount this
 * alone.
 */
export const createApiKeyAuthenticate = (
  dependencies: ApiKeyAuthenticateDependencies,
): RequestHandler => {
  const { apiKeyService } = dependencies

  return (req: Request, res: Response, next: NextFunction): void => {
    const presentedKey = req.get(API_KEY_HEADER)
    if (!presentedKey) {
      next(
        new UnauthorizedError('An API key is required.', { code: ErrorCode.API_KEY_MISSING }),
      )
      return
    }

    apiKeyService
      .verify(presentedKey, req.ip ?? 'unknown')
      .then((context) => {
        if (!context) {
          next(
            new UnauthorizedError('The API key is invalid, revoked, or expired.', {
              code: ErrorCode.API_KEY_INVALID,
            }),
          )
          return
        }

        req.apiKeyContext = context
        next()
      })
      .catch(next)
  }
}

/** Route guard: requires the previously-verified API key to carry `scope` (or the blanket `admin:*` scope). */
export const requireApiKeyScope = (scope: ApiKeyScopeValue): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const context = req.apiKeyContext
    if (!context) {
      next(new UnauthorizedError('An API key is required.', { code: ErrorCode.API_KEY_MISSING }))
      return
    }

    if (context.scopes.includes(ApiKeyScope.ADMIN) || context.scopes.includes(scope)) {
      next()
      return
    }

    next(
      new ForbiddenError(`This API key does not have the '${scope}' scope.`, {
        code: ErrorCode.API_KEY_SCOPE_INSUFFICIENT,
      }),
    )
  }
}
