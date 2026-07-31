import { z } from 'zod'
import { OTP_PURPOSES, OtpPurpose } from './auth.constants'

/**
 * Request schemas.
 *
 * Every schema uses `.strict()`, which rejects unknown keys outright rather
 * than silently dropping them. On an auth surface that is the difference
 * between ignoring a `{"role": "admin"}` field and telling the caller their
 * request was malformed — and it makes a privilege-escalation attempt visible
 * in the logs instead of invisible.
 */

const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(3, 'Email is too short')
  .max(254, 'Email is too long')
  .email('Enter a valid email address')

/**
 * Password policy.
 *
 * Length is the dominant factor in password strength, so the 12-character floor
 * matters far more than the character-class rules. The composition requirements
 * are kept because they are cheap and widely expected, but the maximum exists
 * for a concrete reason: bcrypt silently truncates input beyond 72 bytes, so
 * accepting a 200-character passphrase would give the user false confidence
 * that all of it was protecting their account.
 */
const password = z
  .string({ required_error: 'Password is required' })
  .min(12, 'Password must be at least 12 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must contain a digit')
  .refine(
    (value) => /[^A-Za-z0-9]/.test(value),
    'Password must contain a symbol',
  )

const personName = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} is too long`)
    .regex(
      /^[\p{L}\p{M}'\- .]+$/u,
      `${label} may only contain letters, spaces, apostrophes, and hyphens`,
    )

/** Digits only. Trimmed first, because copy-paste routinely carries whitespace. */
const otpCode = z
  .string({ required_error: 'Verification code is required' })
  .trim()
  .regex(/^\d{4,10}$/, 'Enter the numeric verification code')

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

export const registerSchema = z
  .object({
    email,
    password,
    firstName: personName('First name'),
    lastName: personName('Last name'),
  })
  .strict()

export const loginSchema = z
  .object({
    email,
    // Not the full policy: an existing credential predating a policy change
    // must still be able to sign in. Only presence is required here.
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  })
  .strict()

export const verifyEmailSchema = z.object({ email, code: otpCode }).strict()

export const resendOtpSchema = z
  .object({
    email,
    purpose: z
      .enum(OTP_PURPOSES as [string, ...string[]], {
        errorMap: () => ({ message: 'Unsupported verification purpose' }),
      })
      .default(OtpPurpose.EMAIL_VERIFICATION),
  })
  .strict()

export const forgotPasswordSchema = z.object({ email }).strict()

export const resetPasswordSchema = z
  .object({ email, code: otpCode, password })
  .strict()

/**
 * Refresh and logout.
 *
 * The body is optional in full: browser clients send the token as a cookie and
 * post nothing at all. The field exists only for clients without a cookie jar.
 */
export const refreshTokenSchema = z
  .object({ refreshToken: z.string().min(1).optional() })
  .strict()
  .optional()
  .default({})

export const logoutSchema = refreshTokenSchema

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const auditQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(64).optional(),
    actorId: z.string().trim().length(24, 'Expected a 24-character id').optional(),
    outcome: z.enum(['success', 'failure']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    // Capped so a client cannot request the entire trail in one query.
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    { message: '`from` must be earlier than `to`', path: ['from'] },
  )

// ---------------------------------------------------------------------------
// Inferred types — the schema is the single source of truth for these shapes.
// ---------------------------------------------------------------------------

export type RegisterBody = z.infer<typeof registerSchema>
export type LoginBody = z.infer<typeof loginSchema>
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>
export type ResendOtpBody = z.infer<typeof resendOtpSchema>
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>
export type AuditQueryParams = z.infer<typeof auditQuerySchema>
