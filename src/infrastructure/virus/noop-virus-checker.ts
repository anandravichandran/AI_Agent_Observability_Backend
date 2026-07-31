import type { IVirusChecker, VirusScanInput, VirusScanOutput } from './virus-checker.interface'

/**
 * No-op virus checker.
 *
 * Returns `skipped` for every file. This is the default adapter for local
 * development and for deployments that have not yet integrated a real scanner.
 *
 * Replace this with a ClamAV or cloud-AV adapter in production:
 *
 * ```ts
 * // container.ts
 * const virusChecker: IVirusChecker = new ClamAvChecker(config.clamAv)
 * ```
 *
 * The service records the scan result in the database regardless, so the audit
 * trail always shows what actually happened (including `skipped`).
 */
export class NoopVirusChecker implements IVirusChecker {
  public async scan(input: VirusScanInput): Promise<VirusScanOutput> {
    return {
      result: 'skipped',
      detail: 'Virus scanning is not configured for this deployment.',
      scannedAt: new Date(),
    }
  }

  public async isAvailable(): Promise<boolean> {
    // The noop checker is always "available" — it never fails.
    return true
  }
}
