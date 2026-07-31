import type { ILogger, LogContext } from './logger.interface'

/**
 * Null Object implementation of {@link ILogger}.
 *
 * Useful in unit tests and in any bootstrap path that runs before the real
 * logger exists, so collaborators never need a null check on their logger.
 */
export class NoopLogger implements ILogger {
  public error(_message: string, _context?: LogContext): void {}
  public warn(_message: string, _context?: LogContext): void {}
  public info(_message: string, _context?: LogContext): void {}
  public http(_message: string, _context?: LogContext): void {}
  public debug(_message: string, _context?: LogContext): void {}

  public child(_context: LogContext): ILogger {
    return this
  }
}
