export * from './http-status'
export * from './error-codes'

/** Canonical header names used across middleware. */
export const Headers = {
  REQUEST_ID: 'x-request-id',
  CORRELATION_ID: 'x-correlation-id',
  RESPONSE_TIME: 'x-response-time',
  API_VERSION: 'x-api-version',
  AUTHORIZATION: 'authorization',
} as const

/** Paths excluded from HTTP access logging and rate limiting. */
export const OBSERVABILITY_PATHS = ['/health', '/health/live', '/health/ready'] as const

/**
 * Request body fields that must never reach a log sink or an audit record.
 * Consumed by the audit service and the HTTP logger.
 */
export const REDACTED_FIELDS = [
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'code',
  'otp',
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'cookie',
] as const
