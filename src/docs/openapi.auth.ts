import { USER_ROLES, USER_STATUSES, OTP_PURPOSES } from '@/modules/auth/auth.constants'

/**
 * OpenAPI fragments for the authentication surface.
 *
 * Kept in its own module so the document builder stays readable as the API
 * grows, and so each phase can contribute its own paths without one enormous
 * merge conflict.
 */

const errorResponse = (description: string): Record<string, unknown> => ({
  description,
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
  },
})

const successResponse = (
  description: string,
  dataSchemaRef: string,
): Record<string, unknown> => ({
  description,
  content: {
    'application/json': {
      schema: {
        allOf: [
          { $ref: '#/components/schemas/SuccessEnvelope' },
          { type: 'object', properties: { data: { $ref: dataSchemaRef } } },
        ],
      },
    },
  },
})

const jsonBody = (schemaRef: string): Record<string, unknown> => ({
  required: true,
  content: { 'application/json': { schema: { $ref: schemaRef } } },
})

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const authSchemas: Record<string, unknown> = {
  User: {
    type: 'object',
    properties: {
      id: { type: 'string', example: '665f1c2a9b1e4a3d8c0f1234' },
      email: { type: 'string', format: 'email', example: 'ada@armforge.ai' },
      firstName: { type: 'string', example: 'Ada' },
      lastName: { type: 'string', example: 'Lovelace' },
      fullName: { type: 'string', example: 'Ada Lovelace' },
      role: { type: 'string', enum: USER_ROLES },
      status: { type: 'string', enum: USER_STATUSES },
      isEmailVerified: { type: 'boolean' },
      lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  TokenBundle: {
    type: 'object',
    description:
      'Also delivered as HttpOnly cookies. Browser clients should ignore these fields and rely on the cookies; the body copy exists for CLI and CI clients without a cookie jar.',
    properties: {
      accessToken: { type: 'string' },
      accessTokenExpiresAt: { type: 'string', format: 'date-time' },
      refreshToken: { type: 'string' },
      refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
      tokenType: { type: 'string', example: 'Bearer' },
    },
  },

  AuthSession: {
    type: 'object',
    properties: {
      user: { $ref: '#/components/schemas/User' },
      tokens: { $ref: '#/components/schemas/TokenBundle' },
    },
  },

  RegistrationResult: {
    type: 'object',
    properties: {
      user: { $ref: '#/components/schemas/User' },
      otpExpiresAt: { type: 'string', format: 'date-time' },
      message: { type: 'string' },
    },
  },

  OtpDispatch: {
    type: 'object',
    properties: {
      expiresAt: { type: 'string', format: 'date-time' },
      resendAvailableAt: { type: 'string', format: 'date-time' },
    },
  },

  SessionSummary: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      ip: { type: 'string' },
      userAgent: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      lastUsedAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' },
      current: { type: 'boolean' },
    },
  },

  SessionList: {
    type: 'object',
    properties: {
      sessions: {
        type: 'array',
        items: { $ref: '#/components/schemas/SessionSummary' },
      },
      count: { type: 'integer' },
    },
  },

  AuditEvent: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      action: { type: 'string', example: 'auth.login' },
      category: { type: 'string', example: 'authentication' },
      outcome: { type: 'string', enum: ['success', 'failure'] },
      actorId: { type: 'string', nullable: true },
      actorEmail: { type: 'string', nullable: true },
      actorRole: { type: 'string', nullable: true },
      ip: { type: 'string' },
      userAgent: { type: 'string' },
      requestId: { type: 'string' },
      message: { type: 'string', nullable: true },
      metadata: { type: 'object', additionalProperties: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  AuditEventList: {
    type: 'object',
    properties: {
      events: { type: 'array', items: { $ref: '#/components/schemas/AuditEvent' } },
    },
  },

  // --- Request bodies ------------------------------------------------------

  RegisterRequest: {
    type: 'object',
    required: ['email', 'password', 'firstName', 'lastName'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: {
        type: 'string',
        minLength: 12,
        maxLength: 72,
        description:
          'At least 12 characters with an uppercase letter, a lowercase letter, a digit, and a symbol. Capped at 72 bytes because bcrypt silently truncates beyond that.',
      },
      firstName: { type: 'string', maxLength: 80 },
      lastName: { type: 'string', maxLength: 80 },
    },
  },

  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },

  VerifyEmailRequest: {
    type: 'object',
    required: ['email', 'code'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      code: { type: 'string', example: '481920' },
    },
  },

  ResendOtpRequest: {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      purpose: { type: 'string', enum: OTP_PURPOSES, default: 'email_verification' },
    },
  },

  ForgotPasswordRequest: {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: { email: { type: 'string', format: 'email' } },
  },

  ResetPasswordRequest: {
    type: 'object',
    required: ['email', 'code', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      code: { type: 'string' },
      password: { type: 'string', minLength: 12, maxLength: 72 },
    },
  },

  RefreshRequest: {
    type: 'object',
    additionalProperties: false,
    description:
      'Body is optional. Browser clients send the refresh token as a cookie and post nothing.',
    properties: { refreshToken: { type: 'string' } },
  },
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const authPaths: Record<string, unknown> = {
  '/auth/register': {
    post: {
      tags: ['Authentication'],
      summary: 'Create an account',
      description:
        'Creates a pending account and emails a verification code. No tokens are issued until the address is verified. Registering again with an unverified address re-sends the code instead of creating a duplicate.',
      operationId: 'register',
      security: [],
      requestBody: jsonBody('#/components/schemas/RegisterRequest'),
      responses: {
        201: successResponse('Account created.', '#/components/schemas/RegistrationResult'),
        409: errorResponse('An account with this email already exists.'),
        422: errorResponse('Validation failed.'),
        429: errorResponse('Rate limit exceeded.'),
      },
    },
  },

  '/auth/verify-email': {
    post: {
      tags: ['Authentication'],
      summary: 'Verify an email address',
      description:
        'Consumes the emailed OTP, activates the account, and signs the user in. The code is single-use and expires after the configured TTL.',
      operationId: 'verifyEmail',
      security: [],
      requestBody: jsonBody('#/components/schemas/VerifyEmailRequest'),
      responses: {
        200: successResponse('Email verified and signed in.', '#/components/schemas/AuthSession'),
        401: errorResponse('Invalid or expired verification code.'),
        409: errorResponse('This email is already verified.'),
        429: errorResponse('Too many incorrect attempts.'),
      },
    },
  },

  '/auth/resend-otp': {
    post: {
      tags: ['Authentication'],
      summary: 'Re-send a one-time code',
      description:
        'Invalidates any outstanding code and issues a new one. Subject to a resend cooldown. Responds identically for unknown addresses.',
      operationId: 'resendOtp',
      security: [],
      requestBody: jsonBody('#/components/schemas/ResendOtpRequest'),
      responses: {
        200: successResponse('Code dispatched.', '#/components/schemas/OtpDispatch'),
        409: errorResponse('This email is already verified.'),
        429: errorResponse('Resend cooldown in effect.'),
      },
    },
  },

  '/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'Sign in',
      description:
        'Exchanges credentials for a token pair and sets HttpOnly cookies. Repeated failures lock the account for a configured window. Unknown addresses and wrong passwords return an identical error.',
      operationId: 'login',
      security: [],
      requestBody: jsonBody('#/components/schemas/LoginRequest'),
      responses: {
        200: successResponse('Signed in.', '#/components/schemas/AuthSession'),
        401: errorResponse('Invalid email or password.'),
        403: errorResponse('Email not verified, account locked, or suspended.'),
        429: errorResponse('Rate limit exceeded.'),
      },
    },
  },

  '/auth/refresh': {
    post: {
      tags: ['Authentication'],
      summary: 'Rotate the refresh token',
      description:
        'Consumes the presented refresh token and issues a replacement. Tokens are single-use: presenting one twice is treated as theft and revokes every session in the same rotation family.',
      operationId: 'refreshToken',
      security: [],
      requestBody: {
        required: false,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } } },
      },
      responses: {
        200: successResponse('Session refreshed.', '#/components/schemas/AuthSession'),
        401: errorResponse('Token missing, invalid, expired, or replayed.'),
      },
    },
  },

  '/auth/logout': {
    post: {
      tags: ['Authentication'],
      summary: 'Sign out of this session',
      description:
        'Revokes the session behind the presented refresh token and clears both cookies. Idempotent — always succeeds, even without a valid token.',
      operationId: 'logout',
      security: [],
      responses: {
        200: successResponse('Signed out.', '#/components/schemas/SuccessFlag'),
      },
    },
  },

  '/auth/logout-all': {
    post: {
      tags: ['Authentication'],
      summary: 'Sign out of every device',
      operationId: 'logoutAll',
      responses: {
        200: successResponse('All sessions revoked.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Authentication required.'),
      },
    },
  },

  '/auth/forgot-password': {
    post: {
      tags: ['Authentication'],
      summary: 'Begin password recovery',
      description:
        'Emails a reset code. Always returns 200 with the same body whether or not the address is registered, so the endpoint cannot be used to enumerate accounts.',
      operationId: 'forgotPassword',
      security: [],
      requestBody: jsonBody('#/components/schemas/ForgotPasswordRequest'),
      responses: {
        200: successResponse('Reset code dispatched if the account exists.', '#/components/schemas/OtpDispatch'),
        429: errorResponse('Rate limit exceeded.'),
      },
    },
  },

  '/auth/reset-password': {
    post: {
      tags: ['Authentication'],
      summary: 'Complete password recovery',
      description:
        'Verifies the reset code, sets the new password, and revokes every existing session. Rejects a password identical to the current one.',
      operationId: 'resetPassword',
      security: [],
      requestBody: jsonBody('#/components/schemas/ResetPasswordRequest'),
      responses: {
        200: successResponse('Password updated.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Invalid or expired reset code.'),
        409: errorResponse('The new password matches the current one.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },

  '/auth/me': {
    get: {
      tags: ['Authentication'],
      summary: 'Current user profile',
      operationId: 'getProfile',
      responses: {
        200: successResponse('Profile retrieved.', '#/components/schemas/UserWrapper'),
        401: errorResponse('Authentication required.'),
      },
    },
  },

  '/auth/sessions': {
    get: {
      tags: ['Authentication'],
      summary: 'List active sessions',
      description: 'Every unexpired, unrevoked session for the current user.',
      operationId: 'listSessions',
      responses: {
        200: successResponse('Sessions retrieved.', '#/components/schemas/SessionList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },

  '/admin/audit-logs': {
    get: {
      tags: ['Administration'],
      summary: 'Query the security audit trail',
      description: 'Administrator only. Paginated, newest first.',
      operationId: 'listAuditLogs',
      parameters: [
        { name: 'action', in: 'query', schema: { type: 'string' }, example: 'auth.login' },
        { name: 'actorId', in: 'query', schema: { type: 'string' } },
        { name: 'outcome', in: 'query', schema: { type: 'string', enum: ['success', 'failure'] } },
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: {
        200: successResponse('Audit events retrieved.', '#/components/schemas/AuditEventList'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required.'),
      },
    },
  },
}

/** Small wrappers referenced by the responses above. */
export const authWrapperSchemas: Record<string, unknown> = {
  UserWrapper: {
    type: 'object',
    properties: { user: { $ref: '#/components/schemas/User' } },
  },
  SuccessFlag: {
    type: 'object',
    additionalProperties: true,
    properties: {
      signedOut: { type: 'boolean' },
      passwordReset: { type: 'boolean' },
      revokedSessions: { type: 'integer' },
    },
  },
}

export const authTags: Array<Record<string, unknown>> = [
  {
    name: 'Authentication',
    description:
      'Registration, sign-in, OTP verification, password recovery, and refresh-token rotation.',
  },
  {
    name: 'Administration',
    description: 'Administrator-only operations.',
  },
]

/**
 * Security schemes.
 *
 * Both are declared because both work. The cookie is what a browser uses; the
 * bearer header is for CLI and CI clients, and is what makes the Swagger UI
 * “Authorize” button usable.
 */
export const authSecuritySchemes = (accessCookieName: string): Record<string, unknown> => ({
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Send `Authorization: Bearer <accessToken>`.',
  },
  cookieAuth: {
    type: 'apiKey',
    in: 'cookie',
    name: accessCookieName,
    description: 'HttpOnly access-token cookie, set automatically on sign-in.',
  },
})
