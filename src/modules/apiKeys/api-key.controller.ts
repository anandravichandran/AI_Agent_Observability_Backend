import type { Request, Response } from 'express'
import { requireActor } from '@/core/http/request-context'
import type { IApiKeyService } from './api-key.service'
import type { ApiKeyScopeValue, ApiKeyStatusValue } from './api-key.constants'
import type { CreateApiKeyBody, ListApiKeysQueryParams } from './api-key.validation'

/**
 * HTTP adapter for {@link IApiKeyService}.
 *
 * Thin by construction: no branching business logic, matching every other
 * controller in this codebase.
 */
export class ApiKeyController {
  private readonly service: IApiKeyService

  constructor(service: IApiKeyService) {
    this.service = service
  }

  public create = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const body = req.body as CreateApiKeyBody

    const apiKey = await this.service.create(actor, {
      name: body.name,
      scopes: body.scopes as ApiKeyScopeValue[],
      expiresInDays: body.expiresInDays,
    })

    res.created(
      { apiKey },
      'API key created. Copy the secret now — it will not be shown again.',
    )
  }

  public list = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const query = req.query as unknown as ListApiKeysQueryParams

    const result = await this.service.list(actor, {
      status: query.status as ApiKeyStatusValue | undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    })

    res.success({ apiKeys: result.items }, 'API keys retrieved.', result.meta)
  }

  public revoke = async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req)
    const { id } = req.params as { id: string }

    await this.service.revoke(actor, id)

    res.success({ revoked: true }, 'API key revoked.')
  }
}
