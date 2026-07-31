export type { IMailer, MailMessage } from './mailer.interface'
export { NodemailerMailer } from './nodemailer.mailer'
export {
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildWelcomeEmail,
  buildPasswordChangedEmail,
  type TemplateContext,
  type OtpTemplateInput,
} from './mail.templates'
