/** A message ready for delivery. */
export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
}

/**
 * Outbound mail port.
 *
 * `AuthService` depends on this rather than on Nodemailer, which is what allows
 * a test to assert “an OTP was sent to this address” without an SMTP server, and
 * allows a later move to a transactional provider without touching the service.
 */
export interface IMailer {
  /**
   * Delivers a message.
   *
   * Implementations should resolve rather than reject on transport failure, and
   * log instead: a user who registered successfully should not see a 500
   * because the mail relay was briefly unreachable. They can always request a
   * resend.
   */
  send(message: MailMessage): Promise<void>

  /** Verifies transport reachability. Used by the readiness probe. */
  verify(): Promise<boolean>

  /** Releases pooled connections during shutdown. */
  close(): Promise<void>
}
