import type { Server } from 'node:http'
import type { ILogger } from '@/core/logger/logger.interface'

export interface GracefulShutdownOptions {
  readonly server: Server
  readonly logger: ILogger
  /** Hard deadline before the process is killed regardless of progress. */
  readonly timeoutMs: number
  /**
   * Resource teardown callbacks, executed in order after the HTTP server has
   * stopped accepting connections.
   */
  readonly onShutdown: Array<() => Promise<void>>
}

/**
 * Installs signal handlers for an orderly shutdown.
 *
 * Correct ordering matters under an orchestrator: stop accepting new
 * connections first, drain in-flight requests, then release downstream
 * resources. Closing the database before the server drains would fail requests
 * that were already accepted.
 *
 * A watchdog timer guarantees the process exits even if a socket refuses to
 * close, so a rolling deploy can never stall on a wedged instance.
 */
export const registerGracefulShutdown = ({
  server,
  logger,
  timeoutMs,
  onShutdown,
}: GracefulShutdownOptions): void => {
  let shuttingDown = false

  const shutdown = async (signal: string, exitCode: number): Promise<void> => {
    // A second SIGINT while draining means the operator wants out now.
    if (shuttingDown) {
      logger.warn('Shutdown already in progress, forcing exit', { signal })
      process.exit(exitCode)
    }

    shuttingDown = true
    logger.info('Graceful shutdown initiated', { signal, timeoutMs })

    const watchdog = setTimeout(() => {
      logger.error('Shutdown exceeded its deadline, forcing exit', { timeoutMs })
      process.exit(1)
    }, timeoutMs)

    // Do not hold the event loop open purely for the watchdog.
    watchdog.unref()

    try {
      // 1. Stop accepting new connections and drain existing ones.
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      logger.info('HTTP server closed to new connections')

      // 2. Release downstream resources.
      for (const teardown of onShutdown) {
        await teardown()
      }

      clearTimeout(watchdog)
      logger.info('Graceful shutdown complete')
      process.exit(exitCode)
    } catch (error) {
      clearTimeout(watchdog)
      logger.error('Graceful shutdown failed', {
        reason: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    }
  }

  // SIGTERM: orchestrator-initiated. SIGINT: operator-initiated.
  process.on('SIGTERM', () => void shutdown('SIGTERM', 0))
  process.on('SIGINT', () => void shutdown('SIGINT', 0))

  // The process state is undefined after these; log, then leave.
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', { message: error.message, stack: error.stack })
    void shutdown('uncaughtException', 1)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
    void shutdown('unhandledRejection', 1)
  })
}
