import type { MailMessage } from './mailer.interface'

/**
 * Transactional email templates.
 *
 * Rendered as plain functions rather than through a templating engine: there
 * are four messages, they are pure data-in/markup-out, and a dependency-free
 * implementation keeps them trivially unit-testable.
 *
 * Every message ships a text alternative. Some clients refuse HTML, and a
 * verification code that renders as a blank message is a support ticket.
 */

export interface TemplateContext {
  readonly appName: string
  readonly webUrl: string
  readonly supportEmail?: string
}

export interface OtpTemplateInput {
  readonly firstName: string
  readonly code: string
  /** Minutes until the code expires, for the copy. */
  readonly expiresInMinutes: number
}

const BRAND = {
  background: '#0A0A0F',
  surface: '#16181D',
  border: '#252932',
  text: '#FFFFFF',
  muted: '#8A91A2',
  accent: '#4F46E5',
} as const

/** Shared chrome. Inline styles only — mail clients strip `<style>` blocks. */
const layout = (context: TemplateContext, heading: string, body: string): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.accent};font-weight:600;">${context.appName}</div>
                <h1 style="margin:12px 0 0 0;font-size:22px;line-height:1.3;color:${BRAND.text};font-weight:600;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px 32px;color:${BRAND.muted};font-size:15px;line-height:1.6;">
                ${body}
              </td>
            </tr>
          </table>
          <div style="max-width:560px;margin-top:20px;color:${BRAND.muted};font-size:12px;line-height:1.6;text-align:center;">
            Sent by ${context.appName}. If you did not expect this message you can safely ignore it.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
`

/** Large, monospaced, letter-spaced — built to be read off a phone screen. */
const codeBlock = (code: string): string => `
  <div style="margin:24px 0;padding:20px;background:${BRAND.background};border:1px solid ${BRAND.border};border-radius:12px;text-align:center;">
    <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;letter-spacing:10px;color:${BRAND.text};font-weight:600;">${code}</div>
  </div>
`

export const buildVerificationEmail = (
  context: TemplateContext,
  input: OtpTemplateInput,
): MailMessage => ({
  to: '',
  subject: `${input.code} is your ${context.appName} verification code`,
  html: layout(
    context,
    'Verify your email address',
    `<p style="margin:0;">Hi ${input.firstName}, welcome to ${context.appName}.</p>
     <p style="margin:12px 0 0 0;">Enter this code to finish setting up your account.</p>
     ${codeBlock(input.code)}
     <p style="margin:0;">This code expires in ${String(input.expiresInMinutes)} minutes and can be used once.</p>`,
  ),
  text: [
    `Hi ${input.firstName}, welcome to ${context.appName}.`,
    '',
    `Your verification code is: ${input.code}`,
    '',
    `It expires in ${String(input.expiresInMinutes)} minutes and can be used once.`,
    'If you did not create this account, you can ignore this message.',
  ].join('\n'),
})

export const buildPasswordResetEmail = (
  context: TemplateContext,
  input: OtpTemplateInput,
): MailMessage => ({
  to: '',
  subject: `${input.code} is your ${context.appName} password reset code`,
  html: layout(
    context,
    'Reset your password',
    `<p style="margin:0;">Hi ${input.firstName}, we received a request to reset your password.</p>
     ${codeBlock(input.code)}
     <p style="margin:0;">This code expires in ${String(input.expiresInMinutes)} minutes.</p>
     <p style="margin:12px 0 0 0;color:${BRAND.muted};">If you did not request a reset, no action is needed — your password has not changed.</p>`,
  ),
  text: [
    `Hi ${input.firstName},`,
    '',
    `Your password reset code is: ${input.code}`,
    '',
    `It expires in ${String(input.expiresInMinutes)} minutes.`,
    'If you did not request a reset, no action is needed.',
  ].join('\n'),
})

export const buildWelcomeEmail = (
  context: TemplateContext,
  input: { firstName: string },
): MailMessage => ({
  to: '',
  subject: `Welcome to ${context.appName}`,
  html: layout(
    context,
    'Your account is ready',
    `<p style="margin:0;">Hi ${input.firstName}, your email is verified and your account is active.</p>
     <p style="margin:12px 0 0 0;">You can now upload models, run Arm benchmarks, and review optimization results.</p>
     <p style="margin:24px 0 0 0;">
       <a href="${context.webUrl}" style="display:inline-block;padding:12px 22px;background:${BRAND.accent};color:#FFFFFF;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Open the dashboard</a>
     </p>`,
  ),
  text: [
    `Hi ${input.firstName}, your ${context.appName} account is active.`,
    '',
    `Open the dashboard: ${context.webUrl}`,
  ].join('\n'),
})

/**
 * Sent after a successful password reset.
 *
 * This is a security control, not a courtesy: if the reset was not the account
 * owner's doing, this message is how they find out.
 */
export const buildPasswordChangedEmail = (
  context: TemplateContext,
  input: { firstName: string; ip: string; at: Date },
): MailMessage => ({
  to: '',
  subject: `Your ${context.appName} password was changed`,
  html: layout(
    context,
    'Your password was changed',
    `<p style="margin:0;">Hi ${input.firstName}, your password was changed on ${input.at.toUTCString()} from ${input.ip}.</p>
     <p style="margin:12px 0 0 0;">All existing sessions were signed out.</p>
     <p style="margin:12px 0 0 0;color:#FF6B6B;">If this was not you, reset your password immediately and contact support.</p>`,
  ),
  text: [
    `Hi ${input.firstName},`,
    '',
    `Your password was changed on ${input.at.toUTCString()} from ${input.ip}.`,
    'All existing sessions were signed out.',
    '',
    'If this was not you, reset your password immediately and contact support.',
  ].join('\n'),
})
