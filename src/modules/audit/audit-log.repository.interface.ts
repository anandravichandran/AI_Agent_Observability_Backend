import type { AuditEvent, AuditQuery, AuditQueryResult } from './audit.types'

/**
 * Audit persistence port.
 *
 * Append and read only. There is no update or delete method, and that omission
 * is the point — the type system refuses to express tampering.
 */
export interface IAuditLogRepository {
  append(event: AuditEvent): Promise<void>

  query(query: AuditQuery): Promise<AuditQueryResult>
}
