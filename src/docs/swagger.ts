import type { Express, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import type { AppConfig } from '@/config/config.types'
import type { ILogger } from '@/core/logger/logger.interface'
import { buildOpenApiDocument } from './openapi.document'

/**
 * Mounts Swagger UI and the raw OpenAPI JSON.
 *
 * Documentation is a cross-cutting concern, so it is attached to the app by an
 * explicit installer rather than smuggled into a router. Serving the raw
 * document at `<path>.json` lets client generators and contract tests consume
 * the spec without scraping the UI.
 */
export const mountSwagger = (app: Express, config: AppConfig, logger: ILogger): void => {
  if (!config.swagger.enabled) {
    logger.info('API documentation is disabled by configuration')
    return
  }

  const document = buildOpenApiDocument(config)
  const docsPath = `${config.http.basePath}${config.swagger.path}`
  const jsonPath = `${docsPath}.json`

  app.get(jsonPath, (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json')
    res.status(200).send(JSON.stringify(document, null, 2))
  })

  app.use(
    docsPath,
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: `${config.app.title} — API Reference`,
      swaggerOptions: {
        docExpansion: 'list',
        defaultModelsExpandDepth: 2,
        displayRequestDuration: true,
        filter: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      },
    }),
  )

  logger.info('API documentation mounted', { docsPath, jsonPath })
}
