import { REDACTED_FIELDS } from '@/core/constants'
import type { ILogger } from '@/core/logger/logger.interface'
import type { IAuditLogRepository } from './audit-log.repository.interface'
import type { IAuditService } from './audit.service.interface'
import type { AuditEvent, AuditQuery, AuditQueryResult } from './audit.types'

export interface AuditServiceDependencies {
  readonly repository: IAuditLogRepository
  readonly logger: ILogger
}

const REDACTION_PLACEHOLDER = '[REDACTED]'

/**
 * Writes the security audit trail.
 *
 * Two behaviours define this class:
 *
 * 1. **It never throws.** Auditing observes a business operation rather than
 *    participating in it. If the audit write fails, the user's login still
 *    succeeded, and turning that into a 500 would be both wrong and confusing.
 *    The failure is logged at `error` so it surfaces in monitoring.
 * 2. **It redacts before persisting.** Callers pass metadata freely; this is the
 *    single chokepoint that guarantees a password or OTP never lands in a
 *    long-lived collection.
 */
export class AuditService implements IAuditService {
  private readonly repository: IAuditLogRepository
  private readonly logger: ILogger

  constructor(dependencies: AuditServiceDependencies) {
    this.repository = dependencies.repository
    this.logger = dependencies.logger.child({ component: 'AuditService' })
  }

  public async record(event: AuditEvent): Promise<void> {
    try {
      await this.repository.append({
        ...event,
        metadata: this.redact(event.metadata ?? {}),
      })
    } catch (error) {
      // Deliberately swallowed. A dropped audit record is a monitoring problem,
      // not a reason to fail the user's request.
      this.logger.error('Failed to write audit record', {
        action: event.action,
        requestId: event.requestId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  public async query(query: AuditQuery): Promise<AuditQueryResult> {
    return this.repository.query(query)
  }

  /**
   * Recursively replaces sensitive keys.
   *
   * Depth-limited because metadata originates from request payloads, and an
   * attacker-supplied deeply nested object should not be able to exhaust the
   * stack inside the audit path.
   */
  private redact(value: Record<string, unknown>, depth = 0): Record<string, unknown> {
    if (depth > 4) return { truncated: true }

    const result: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(value)) {
      const isSensitive = (REDACTED_FIELDS as readonly string[]).includes(
        key.toLowerCase(),
      )

      if (isSensitive) {
        result[key] = REDACTION_PLACEHOLDER
        continue
      }

      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        result[key] = this.redact(entry as Record<string, unknown>, depth + 1)
        continue
      }

      result[key] = entry
    }

    return result
  }
}
