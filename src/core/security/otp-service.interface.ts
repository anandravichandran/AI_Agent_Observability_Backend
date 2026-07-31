/** Generated one-time password and its hash. */
export interface GeneratedOtp {
  /** Sent to the user. Never persisted, never logged. */
  readonly code: string
  /** Persisted. */
  readonly codeHash: string
}

/**
 * OTP generation and verification port.
 *
 * Separated from `AuthService` so the randomness source and the comparison are
 * independently testable, and so a future move to TOTP is an adapter swap.
 */
export interface IOtpService {
  /** Generates a cryptographically random numeric code of the configured length. */
  generate(): GeneratedOtp

  /** Constant-time comparison of a submitted code against a stored hash. */
  verify(code: string, codeHash: string): boolean
}
