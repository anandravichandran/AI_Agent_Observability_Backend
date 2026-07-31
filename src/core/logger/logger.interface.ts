/** Arbitrary structured context merged into a log entry. */
export type LogContext = Record<string, unknown>

/**
 * The logging port.
 *
 * Application code depends on this interface only — never on winston directly.
 * That inverts the dependency (DIP) and means swapping to pino, or to a no-op
 * logger in tests, touches exactly one file in the composition root.
 */
export interface ILogger {
  error(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  http(message: string, context?: LogContext): void
  debug(message: string, context?: LogContext): void

  /**
   * Returns a logger that automatically merges `context` into every entry.
   * Used to bind a request id for the lifetime of a request.
   */
  child(context: LogContext): ILogger
}

/** Sink shape morgan writes into. */
export interface LogStream {
  write(message: string): void
}
