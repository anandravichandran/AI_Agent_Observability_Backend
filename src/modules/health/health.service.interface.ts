import type {
  HealthReport,
  LivenessReport,
  ReadinessReport,
  VersionReport,
} from './health.types'

/**
 * Health module service port.
 *
 * The controller depends on this interface, never on the concrete class, so the
 * HTTP layer can be tested against a stub with no database in sight.
 */
export interface IHealthService {
  /** Full diagnostic report including every registered dependency. */
  getHealth(): Promise<HealthReport>

  /**
   * Liveness: is the process running? Never touches a dependency — a failing
   * database must not cause an orchestrator to restart a healthy process.
   */
  getLiveness(): LivenessReport

  /** Readiness: can this instance serve traffic right now? */
  getReadiness(): Promise<ReadinessReport>

  /** Build and runtime identification. */
  getVersion(): VersionReport
}
