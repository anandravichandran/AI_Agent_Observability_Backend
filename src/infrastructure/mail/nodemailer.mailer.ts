import nodemailer, { type Transporter } from 'nodemailer'
import type { MailConfig } from '@/config/config.types'
import type { ILogger } from '@/core/logger/logger.interface'
import type { IMailer, MailMessage } from './mailer.interface'

/**
 * Nodemailer adapter for {@link IMailer}.
 *
 * Supports two transports:
 *
 * - `smtp` — a real relay, connection-pooled.
 * - `stream` — renders the message to the log instead of sending it. This is
 *   the local development default so a developer can read the OTP straight out
 *   of the console without configuring a mail server. `env.ts` refuses to let
 *   this transport start in production.
 */
export class NodemailerMailer implements IMailer {
  private readonly transporter: Transporter
  private readonly config: MailConfig
  private readonly logger: ILogger
  private readonly isStreamTransport: boolean

  constructor(config: MailConfig, logger: ILogger) {
    this.config = config
    this.logger = logger.child({ component: 'Mailer' })
    this.isStreamTransport = config.transport === 'stream'

    this.transporter = this.isStreamTransport
      ? nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true })
      : nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          ...(config.user
            ? { auth: { user: config.user, pass: config.password ?? '' } }
            : {}),
          // Pooling avoids a TLS handshake per message, which dominates latency
          // on a burst of OTP sends.
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
  }

  public async send(message: MailMessage): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        ...(this.config.replyTo ? { replyTo: this.config.replyTo } : {}),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })

      if (this.isStreamTransport) {
        // The whole point of this transport: make the message readable locally.
        this.logger.info('Mail captured (stream transport — not delivered)', {
          to: message.to,
          subject: message.subject,
          body: message.text,
        })
        return
      }

      this.logger.info('Mail dispatched', {
        to: message.to,
        subject: message.subject,
        messageId: info.messageId,
      })
    } catch (error) {
      // Swallowed by design — see IMailer.send. Registration must not fail
      // because the relay hiccuped; the user can request a resend.
      this.logger.error('Mail delivery failed', {
        to: message.to,
        subject: message.subject,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  public async verify(): Promise<boolean> {
    if (this.isStreamTransport) return true

    try {
      await this.transporter.verify()
      return true
    } catch (error) {
      this.logger.warn('Mail transport verification failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  public async close(): Promise<void> {
    this.transporter.close()
    return Promise.resolve()
  }
}
