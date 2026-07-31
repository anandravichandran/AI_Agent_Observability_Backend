import type { Server } from 'node:http'
import { buildConfig, EnvironmentValidationError } from '@/config'
import { buildContainer } from '@/container'
import { registerGracefulShutdown } from '@/core/utils/graceful-shutdown'

/**
 * Process entry point.
 *
 * Responsible for exactly three things: resolve the dependency graph, connect
 * downstream resources, and start listening. No application logic lives here,
 * which is what keeps `createApp` independently testable.
 */
const bootstrap = async (): Promise<void> => {
  // Configuration is validated before anything else is constructed, so a bad
  // deployment fails immediately with a readable message rather than at the
  // first request that happens to need the missing variable.
  const config = buildConfig()
  const { app, logger, database } = buildContainer(config)

  logger.info('Starting service', {
    service: config.app.name,
    version: config.app.version,
    environment: config.app.env,
    node: process.version,
    pid: process.pid,
  })

  // Connect before listening: an instance that cannot reach its database must
  // never report itself as ready to a load balancer.
  await database.connect()

  const server: Server = app.listen(config.http.port, config.http.host, () => {
    logger.info('HTTP server listening', {
      address: `${config.http.host}:${String(config.http.port)}`,
      basePath: config.http.basePath,
      docs: config.swagger.enabled
        ? `${config.http.basePath}${config.swagger.path}`
        : 'disabled',
    })
  })

  // Slightly above a typical 60s ALB idle timeout, to avoid races where the
  // proxy reuses a connection the server is closing.
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 66_000

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error('Port is already in use', { port: config.http.port })
      process.exit(1)
    }

    logger.error('HTTP server error', { message: error.message, code: error.code })
    process.exit(1)
  })

  registerGracefulShutdown({
    server,
    logger,
    timeoutMs: config.http.shutdownTimeoutMs,
    onShutdown: [
      async (): Promise<void> => {
        await database.disconnect()
      },
    ],
  })
}

void bootstrap().catch((error: unknown) => {
  // The logger may not exist yet, so this path writes directly to stderr.
  if (error instanceof EnvironmentValidationError) {
    console.error(`\n[fatal] ${error.message}\n`)
    process.exit(1)
  }

  console.error('\n[fatal] Failed to start the service.')
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exit(1)
})
