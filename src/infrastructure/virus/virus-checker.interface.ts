/**
 * Virus scanner port.
 *
 * The service depends on this interface rather than on a specific AV library,
 * so a real ClamAV or cloud scanner can be wired in as an adapter without
 * touching the service or any other module.
 */
export interface VirusScanInput {
  /** Absolute filesystem path of the file to scan. */
  readonly filePath: string
  /** Original filename, for logging and for scanners that check by name. */
  readonly originalFilename: string
  readonly sizeBytes: number
}

export interface VirusScanOutput {
  /** `clean` | `infected` | `skipped` */
  readonly result: 'clean' | 'infected' | 'skipped'
  /** Human-readable detail, e.g. the virus name if infected. */
  readonly detail: string | null
  readonly scannedAt: Date
}

export interface IVirusChecker {
  /**
   * Scans a file for malware.
   *
   * Must resolve, never reject. If the scanner is unavailable, return
   * `result: 'skipped'` and log the failure internally rather than propagating
   * it — a missing AV service must not block every upload.
   */
  scan(input: VirusScanInput): Promise<VirusScanOutput>

  /**
   * Returns true when the scanner is reachable and capable of scanning.
   * Used by the readiness probe.
   */
  isAvailable(): Promise<boolean>
}
