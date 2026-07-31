import type { ComponentHealth } from '@/core/types/common.types'

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'uninitialized'

export interface DatabaseStatus {
  readonly state: ConnectionState
  readonly host?: string
  readonly port?: number
  readonly name?: string
  readonly connectedAt?: string
}

/**
 * Persistence port.
 *
 * The application depends on this abstraction, not on Mongoose. Swapping the
 * driver, or substituting an in-memory double in tests, requires no change
 * outside `infrastructure/database` and the composition root.
 */
export interface IDatabaseConnection {
  /** Establishes the connection, retrying per configuration. Idempotent. */
  connect(): Promise<void>

  /** Closes the connection cleanly. Safe to call when already disconnected. */
  disconnect(): Promise<void>

  /** Synchronous readiness check — no I/O. */
  isConnected(): boolean

  /** Issues a real round trip to the server and reports latency. */
  ping(): Promise<ComponentHealth>

  /** Current connection metadata, for the health endpoint. */
  getStatus(): DatabaseStatus
}
