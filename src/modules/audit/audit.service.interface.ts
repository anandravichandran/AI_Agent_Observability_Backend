import type { AuditEvent, AuditQuery, AuditQueryResult } from './audit.types'

/** Audit trail service port. */
export interface IAuditService {
  /**
   * Records a security event.
   *
   * Never rejects. Auditing is an observation of a business operation, not part
   * of it — a failed write is logged loudly but must not turn a successful
   * login into a 500 for the user.
   */
  record(event: AuditEvent): Promise<void>

  query(query: AuditQuery): Promise<AuditQueryResult>
}
