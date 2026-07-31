import type { Request, Response } from 'express'
import { HttpStatus } from '@/core/constants'
import type { IHealthService } from './health.service.interface'

/**
 * HTTP adapter for the health module.
 *
 * Holds no logic beyond translating a service result into a status code. The
 * service is injected through the constructor, so the controller is trivially
 * testable and knows nothing about how health is determined.
 */
export class HealthController {
  private readonly service: IHealthService

  constructor(service: IHealthService) {
    this.service = service
  }

  /**
   * Bound as arrow properties so they can be passed directly to the router as
   * `controller.getHealth` without losing `this`.
   */
  public readonly getHealth = async (_req: Request, res: Response): Promise<void> => {
    const report = await this.service.getHealth()

    // A degraded dependency must surface as 503 so load balancers and
    // orchestrators react, even though the payload itself is well formed.
    const statusCode =
      report.status === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE

    res.respond(
      statusCode,
      report,
      report.status === 'up'
        ? 'Service is healthy.'
        : 'Service is reporting a degraded or failing dependency.',
    )
  }

  public readonly getLiveness = (_req: Request, res: Response): void => {
    res.success(this.service.getLiveness(), 'Process is live.')
  }

  public readonly getReadiness = async (_req: Request, res: Response): Promise<void> => {
    const report = await this.service.getReadiness()

    res.respond(
      report.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
      report,
      report.ready
        ? 'Service is ready to accept traffic.'
        : 'Service is not ready to accept traffic.',
    )
  }

  public readonly getVersion = (_req: Request, res: Response): void => {
    res.success(this.service.getVersion(), 'Version information retrieved.')
  }
}
