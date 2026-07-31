import type { ComponentHealth, HealthState } from '@/core/types/common.types'

/** Payload of `GET /health`. */
export interface HealthReport {
  readonly status: HealthState
  readonly service: string
  readonly version: string
  readonly environment: string
  readonly uptimeSeconds: number
  readonly uptime: string
  readonly timestamp: string
  readonly checks: ComponentHealth[]
  readonly system: SystemSnapshot
}

/** Payload of `GET /health/live`. */
export interface LivenessReport {
  readonly status: 'up'
  readonly uptimeSeconds: number
  readonly timestamp: string
}

/** Payload of `GET /health/ready`. */
export interface ReadinessReport {
  readonly status: HealthState
  readonly ready: boolean
  readonly checks: ComponentHealth[]
  readonly timestamp: string
}

/** Payload of `GET /version`. */
export interface VersionReport {
  readonly service: string
  readonly version: string
  readonly apiVersion: string
  readonly environment: string
  readonly runtime: {
    readonly node: string
    readonly platform: string
    readonly arch: string
  }
  readonly startedAt: string
}

export interface SystemSnapshot {
  readonly memory: {
    readonly rssMb: number
    readonly heapUsedMb: number
    readonly heapTotalMb: number
  }
  readonly cpu: {
    readonly loadAverage: number[]
    readonly cores: number
  }
  readonly process: {
    readonly pid: number
    readonly nodeVersion: string
  }
}
