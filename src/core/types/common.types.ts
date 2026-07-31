/** Shared structural types used across layers. */

/** A component that owns a resource requiring an orderly shutdown. */
export interface Disposable {
  dispose(): Promise<void>
}

/** A component reporting liveness/readiness to the health module. */
export interface HealthReporter {
  readonly name: string
  check(): Promise<ComponentHealth>
}

export type HealthState = 'up' | 'down' | 'degraded' | 'unknown'

export interface ComponentHealth {
  readonly name: string
  readonly status: HealthState
  /** Round-trip latency of the check, in milliseconds. */
  readonly latencyMs?: number
  readonly message?: string
  readonly details?: Record<string, unknown>
}

/** Deeply readonly utility for immutable configuration objects. */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T[K] extends object
      ? DeepReadonly<T[K]>
      : T[K]
}
