import mongoose, { type ConnectOptions, type Mongoose } from 'mongoose'
import type { DatabaseConfig } from '@/config/config.types'
import type { ILogger } from '@/core/logger/logger.interface'
import type { ComponentHealth } from '@/core/types/common.types'
import { DatabaseError } from '@/core/errors/app-error'
import { elapsedSince, now, sleep } from '@/core/utils/time'
import type {
  ConnectionState,
  DatabaseStatus,
  IDatabaseConnection,
} from './database.interface'

/** Mongoose `readyState` numeric codes mapped to a readable union. */
const READY_STATE: Record<number, ConnectionState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
}

/**
 * Mongoose adapter implementing the {@link IDatabaseConnection} port.
 *
 * Responsibilities are deliberately narrow: establish, observe, and tear down
 * the connection. It performs no queries and knows nothing about domain models,
 * which keeps it stable as business features land in later phases.
 */
export class MongooseConnection implements IDatabaseConnection {
  private readonly config: DatabaseConfig
  private readonly logger: ILogger
  private client: Mongoose | null = null
  private connectedAt: string | undefined
  private listenersBound = false

  constructor(config: DatabaseConfig, logger: ILogger) {
    this.config = config
    this.logger = logger.child({ component: 'MongooseConnection' })
  }

  public async connect(): Promise<void> {
    if (this.isConnected()) {
      this.logger.debug('Connection already established, skipping connect')
      return
    }

    this.bindLifecycleListeners()

    // Fail fast on malformed queries rather than silently dropping fields.
    mongoose.set('strictQuery', true)

    const options: ConnectOptions = {
      dbName: this.config.dbName,
      maxPoolSize: this.config.maxPoolSize,
      minPoolSize: this.config.minPoolSize,
      serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMs,
      socketTimeoutMS: this.config.socketTimeoutMs,
      autoIndex: this.config.autoIndex,
      retryWrites: true,
    }

    const totalAttempts = this.config.retryAttempts + 1
    let lastError: unknown

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        this.logger.info('Connecting to MongoDB', {
          attempt,
          totalAttempts,
          dbName: this.config.dbName,
        })

        this.client = await mongoose.connect(this.config.uri, options)
        this.connectedAt = new Date().toISOString()

        const status = this.getStatus()
        this.logger.info('MongoDB connection established', {
          host: status.host,
          port: status.port,
          dbName: status.name,
        })

        return
      } catch (error) {
        lastError = error
        const isFinalAttempt = attempt === totalAttempts

        this.logger.error('MongoDB connection attempt failed', {
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
      `Unable to establish a MongoDB connection after ${totalAttempts} attempt(s).`,
      { cause: lastError },
    )
  }

  public async disconnect(): Promise<void> {
    if (!this.client && mongoose.connection.readyState === 0) {
      this.logger.debug('No active connection to close')
      return
    }

    try {
      await mongoose.disconnect()
      this.client = null
      this.connectedAt = undefined
      this.logger.info('MongoDB connection closed')
    } catch (error) {
      this.logger.error('Failed to close MongoDB connection cleanly', {
        reason: error instanceof Error ? error.message : String(error),
      })
      throw new DatabaseError('Failed to close the MongoDB connection.', {
        cause: error,
      })
    }
  }

  public isConnected(): boolean {
    return mongoose.connection.readyState === 1
  }

  public async ping(): Promise<ComponentHealth> {
    const startedAt = now()

    if (!this.isConnected()) {
      return {
        name: 'mongodb',
        status: 'down',
        message: `Connection is ${this.resolveState()}.`,
      }
    }

    try {
      const admin = mongoose.connection.db?.admin()

      if (!admin) {
        return {
          name: 'mongodb',
          status: 'down',
          message: 'Database handle is not available.',
        }
      }

      await admin.ping()

      return {
        name: 'mongodb',
        status: 'up',
        latencyMs: elapsedSince(startedAt),
        details: this.getStatus() as unknown as Record<string, unknown>,
      }
    } catch (error) {
      return {
        name: 'mongodb',
        status: 'down',
        latencyMs: elapsedSince(startedAt),
        message: error instanceof Error ? error.message : 'Ping failed.',
      }
    }
  }

  public getStatus(): DatabaseStatus {
    const { host, port, name } = mongoose.connection

    return {
      state: this.resolveState(),
      ...(host ? { host } : {}),
      ...(port ? { port } : {}),
      ...(name ? { name } : {}),
      ...(this.connectedAt ? { connectedAt: this.connectedAt } : {}),
    }
  }

  private resolveState(): ConnectionState {
    return READY_STATE[mongoose.connection.readyState] ?? 'uninitialized'
  }

  /**
   * Driver-level events are bound once. Reconnection itself is handled by the
   * driver; these listeners exist purely for observability.
   */
  private bindLifecycleListeners(): void {
    if (this.listenersBound) return
    this.listenersBound = true

    mongoose.connection.on('connected', () => {
      this.logger.debug('Driver event: connected')
    })

    mongoose.connection.on('disconnected', () => {
      this.logger.warn('Driver event: disconnected')
    })

    mongoose.connection.on('reconnected', () => {
      this.connectedAt = new Date().toISOString()
      this.logger.info('Driver event: reconnected')
    })

    mongoose.connection.on('error', (error: Error) => {
      this.logger.error('Driver event: error', { reason: error.message })
    })
  }
}
