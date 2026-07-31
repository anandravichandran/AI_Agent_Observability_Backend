import os from 'node:os'
import type { AppMetaConfig, HttpConfig } from '@/config/config.types'
import type { ComponentHealth, HealthReporter, HealthState } from '@/core/types/common.types'
import { formatUptime } from '@/core/utils/time'
import type { IHealthService } from './health.service.interface'
import type {
  HealthReport,
  LivenessReport,
  ReadinessReport,
  SystemSnapshot,
  VersionReport,
} from './health.types'

export interface HealthServiceDependencies {
  readonly app: AppMetaConfig
  readonly http: HttpConfig
  /**
   * Dependencies to probe. Injected as a collection so future phases can
   * register a cache, object store, or queue reporter without editing this
   * class — the Open/Closed Principle applied to health checks.
   */
  readonly reporters: HealthReporter[]
  /** Injected clock, keeping the service deterministic under test. */
  readonly clock?: () => Date
}

const toMb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 100) / 100

/**
 * Aggregates process and dependency health.
 *
 * Contains no business logic — it reports on the platform itself, which is the
 * whole remit of Phase 1.
 */
export class HealthService implements IHealthService {
  private readonly app: AppMetaConfig
  private readonly http: HttpConfig
  private readonly reporters: HealthReporter[]
  private readonly clock: () => Date
  private readonly startedAt: Date

  constructor(dependencies: HealthServiceDependencies) {
    this.app = dependencies.app
    this.http = dependencies.http
    this.reporters = dependencies.reporters
    this.clock = dependencies.clock ?? ((): Date => new Date())
    this.startedAt = this.clock()
  }

  public async getHealth(): Promise<HealthReport> {
    const checks = await this.runChecks()

    return {
      status: this.deriveOverallStatus(checks),
      service: this.app.name,
      version: this.app.version,
      environment: this.app.env,
      uptimeSeconds: Math.round(process.uptime()),
      uptime: formatUptime(process.uptime()),
      timestamp: this.clock().toISOString(),
      checks,
      system: this.getSystemSnapshot(),
    }
  }

  public getLiveness(): LivenessReport {
    return {
      status: 'up',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: this.clock().toISOString(),
    }
  }

  public async getReadiness(): Promise<ReadinessReport> {
    const checks = await this.runChecks()
    const status = this.deriveOverallStatus(checks)

    return {
      status,
      ready: status === 'up',
      checks,
      timestamp: this.clock().toISOString(),
    }
  }

  public getVersion(): VersionReport {
    return {
      service: this.app.name,
      version: this.app.version,
      apiVersion: this.http.version,
      environment: this.app.env,
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      startedAt: this.startedAt.toISOString(),
    }
  }

  /**
   * Probes every reporter concurrently. A reporter that throws is recorded as
   * `down` rather than failing the whole report — a health endpoint that 500s
   * tells an operator nothing.
   */
  private async runChecks(): Promise<ComponentHealth[]> {
    const results = await Promise.allSettled(
      this.reporters.map((reporter) => reporter.check()),
    )

    return results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value

      return {
        name: this.reporters[index]?.name ?? 'unknown',
        status: 'down' as const,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : 'The health check threw an unexpected error.',
      }
    })
  }

  private deriveOverallStatus(checks: ComponentHealth[]): HealthState {
    if (checks.length === 0) return 'up'
    if (checks.some((check) => check.status === 'down')) return 'down'
    if (checks.some((check) => check.status === 'degraded')) return 'degraded'
    if (checks.every((check) => check.status === 'up')) return 'up'
    return 'unknown'
  }

  private getSystemSnapshot(): SystemSnapshot {
    const memory = process.memoryUsage()

    return {
      memory: {
        rssMb: toMb(memory.rss),
        heapUsedMb: toMb(memory.heapUsed),
        heapTotalMb: toMb(memory.heapTotal),
      },
      cpu: {
        loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
        cores: os.cpus().length,
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
      },
    }
  }
}
