import path from 'node:path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import type { LoggerConfig } from '@/config/config.types'
import type { ILogger, LogContext, LogStream } from './logger.interface'

const LEVELS: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
}

const COLOURS: Record<string, string> = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
}

winston.addColors(COLOURS)

/** Human-friendly single-line format for local development. */
const prettyFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ level: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, service: _service, ...rest } = info

    const requestId = typeof rest.requestId === 'string' ? ` [${rest.requestId}]` : ''
    delete rest.requestId

    const meta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : ''
    const trace = typeof stack === 'string' ? `\n${stack}` : ''

    return `${String(timestamp)} ${level}${requestId} ${String(message)}${meta}${trace}`
  }),
)

/** Machine-readable JSON format for production log shipping. */
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
)

const buildTransports = (config: LoggerConfig): winston.transport[] => {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: config.pretty ? prettyFormat : jsonFormat,
      handleExceptions: false,
      handleRejections: false,
    }),
  ]

  if (config.toFile) {
    transports.push(
      new DailyRotateFile({
        dirname: path.resolve(process.cwd(), config.dir),
        filename: 'application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: config.maxFiles,
        zippedArchive: true,
        format: jsonFormat,
      }),
      new DailyRotateFile({
        dirname: path.resolve(process.cwd(), config.dir),
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: config.maxFiles,
        level: 'error',
        zippedArchive: true,
        format: jsonFormat,
      }),
    )
  }

  return transports
}

/**
 * Winston-backed implementation of the {@link ILogger} port.
 *
 * Wrapping rather than exporting winston directly keeps the vendor type out of
 * every consumer's signature and guarantees the `child()` contract behaves
 * consistently regardless of the underlying library.
 */
export class WinstonLogger implements ILogger {
  private readonly logger: winston.Logger

  constructor(config: LoggerConfig)
  constructor(logger: winston.Logger)
  constructor(configOrLogger: LoggerConfig | winston.Logger) {
    if ('log' in configOrLogger && typeof configOrLogger.log === 'function') {
      this.logger = configOrLogger as winston.Logger
      return
    }

    const config = configOrLogger as LoggerConfig

    this.logger = winston.createLogger({
      levels: LEVELS,
      level: config.level,
      defaultMeta: {
        service: config.serviceName,
        env: config.env,
      },
      transports: buildTransports(config),
      exitOnError: false,
      silent: config.env === 'test',
    })
  }

  public error(message: string, context: LogContext = {}): void {
    this.logger.error(message, context)
  }

  public warn(message: string, context: LogContext = {}): void {
    this.logger.warn(message, context)
  }

  public info(message: string, context: LogContext = {}): void {
    this.logger.info(message, context)
  }

  public http(message: string, context: LogContext = {}): void {
    this.logger.http(message, context)
  }

  public debug(message: string, context: LogContext = {}): void {
    this.logger.debug(message, context)
  }

  public child(context: LogContext): ILogger {
    return new WinstonLogger(this.logger.child(context))
  }

  /** Stream adapter consumed by morgan. */
  public get stream(): LogStream {
    return {
      write: (message: string): void => {
        this.logger.http(message.trim())
      },
    }
  }
}

/** Factory used by the composition root. */
export const createLogger = (config: LoggerConfig): WinstonLogger => new WinstonLogger(config)
