import type { DatabaseConfig } from '@/config/config.types'
import type { ILogger } from '@/core/logger/logger.interface'
import type { ComponentHealth } from '@/core/types/common.types'
import { DatabaseError } from '@/core/errors/app-error'
import { elapsedSince, now, sleep } from '@/core/utils/time'
import { createPrismaClient, type PrismaClient } from './prisma.client'
import type { ConnectionState, DatabaseStatus, IDatabaseConnection } from './database.interface'

/**
 * Prisma/PostgreSQL adapter implementing the {@link IDatabaseConnection} port.
 *
 * Exposes the underlying `PrismaClient` via `.client` so every repository
 * shares a single connection pool and can compose multi-repository writes
 * inside one `$transaction` call. This file owns connection lifecycle,
 * retries, and health reporting only — no query logic lives here.
 */
export class PrismaConnection implements IDatabaseConnection {
  private readonly config: DatabaseConfig
  private readonly logger: ILogger
  public readonly client: PrismaClient
  private connected = false
  private connectedAt: string | undefined

  constructor(config: DatabaseConfig, logger: ILogger) {
    this.config = config
    this.logger = logger.child({ component: 'PrismaConnection' })
    this.client = createPrismaClient(config.url, config.logQueries)

    if (config.logQueries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.client as any).$on('query', (event: { query: string; duration: number }) => {
        this.logger.debug('Prisma query', { query: event.query, durationMs: event.duration })
      })
    }
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      this.logger.debug('Connection already established, skipping connect')
      return
    }

    const totalAttempts = this.config.retryAttempts + 1
    let lastError: unknown

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        this.logger.info('Connecting to PostgreSQL', { attempt, totalAttempts })

        await this.client.$connect()
        // Confirm the pool actually accepts a round trip, not just that
        // $connect() resolved (which it does even for a lazily-validated URL).
        await this.client.$queryRaw`SELECT 1`

        this.connected = true
        this.connectedAt = new Date().toISOString()
        this.logger.info('PostgreSQL connection established')
        return
      } catch (error) {
        lastError = error
        const isFinalAttempt = attempt === totalAttempts

        this.logger.error('PostgreSQL connection attempt failed', {
          attempt,
          totalAttempts,
          willRetry: !isFinalAttempt,
          reason: error instanceof Error ? error.message : String(error),
        })

        if (isFinalAttempt) break
        await sleep(this.config.retryDelayMs * attempt)
      }
    }

    throw new DatabaseError(
      `Unable to establish a PostgreSQL connection after ${totalAttempts} attempt(s).`,
      { cause: lastError },
    )
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) {
      this.logger.debug('No active connection to close')
      return
    }

    try {
      await this.client.$disconnect()
      this.connected = false
      this.connectedAt = undefined
      this.logger.info('PostgreSQL connection closed')
    } catch (error) {
      this.logger.error('Failed to close PostgreSQL connection cleanly', {
        reason: error instanceof Error ? error.message : String(error),
      })
      throw new DatabaseError('Failed to close the PostgreSQL connection.', { cause: error })
    }
  }

  public isConnected(): boolean {
    return this.connected
  }

  public async ping(): Promise<ComponentHealth> {
    const startedAt = now()

    if (!this.connected) {
      return { name: 'postgresql', status: 'down', message: 'Connection is disconnected.' }
    }

    try {
      await this.client.$queryRaw`SELECT 1`

      return {
        name: 'postgresql',
        status: 'up',
        latencyMs: elapsedSince(startedAt),
        details: this.getStatus() as unknown as Record<string, unknown>,
      }
    } catch (error) {
      return {
        name: 'postgresql',
        status: 'down',
        latencyMs: elapsedSince(startedAt),
        message: error instanceof Error ? error.message : 'Ping failed.',
      }
    }
  }

  public getStatus(): DatabaseStatus {
    const parsed = this.safeParseUrl(this.config.url)

    return {
      state: this.resolveState(),
      ...(parsed?.hostname ? { host: parsed.hostname } : {}),
      ...(parsed?.port ? { port: Number(parsed.port) } : {}),
      ...(parsed?.pathname ? { name: parsed.pathname.replace(/^\//, '') } : {}),
      ...(this.connectedAt ? { connectedAt: this.connectedAt } : {}),
    }
  }

  private resolveState(): ConnectionState {
    return this.connected ? 'connected' : 'disconnected'
  }

  private safeParseUrl(url: string): URL | null {
    try {
      return new URL(url)
    } catch {
      return null
    }
  }
}
