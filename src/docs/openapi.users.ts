import { USER_ROLES, USER_STATUSES, USER_THEMES } from '@/modules/auth/auth.constants'

/**
 * OpenAPI fragments for the account self-service surface (`/users/me`).
 *
 * Kept in its own module so the document builder stays readable, mirroring the
 * split already used for the authentication surface.
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

/** Shared pagination + sorting query parameters. */
const listParams = (sortExample: string): Array<Record<string, unknown>> => [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  {
    name: 'sort',
    in: 'query',
    description:
      'Comma-separated fields; prefix a field with `-` for descending order.',
    schema: { type: 'string', example: sortExample },
  },
]

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const userSchemas: Record<string, unknown> = {
  Preferences: {
    type: 'object',
    properties: {
      theme: { type: 'string', enum: USER_THEMES },
      language: { type: 'string', example: 'en' },
      timezone: { type: 'string', example: 'UTC' },
    },
  },

  NotificationSettings: {
    type: 'object',
    properties: {
      productUpdates: { type: 'boolean' },
      securityAlerts: {
        type: 'boolean',
        description: 'Always true — security notifications cannot be disabled.',
      },
      benchmarkComplete: { type: 'boolean' },
      weeklyReport: { type: 'boolean' },
    },
  },

  Profile: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      email: { type: 'string', format: 'email' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      fullName: { type: 'string' },
      role: { type: 'string', enum: USER_ROLES },
      status: { type: 'string', enum: USER_STATUSES },
      isEmailVerified: { type: 'boolean' },
      avatarUrl: { type: 'string', nullable: true },
      preferences: { $ref: '#/components/schemas/Preferences' },
      notificationSettings: { $ref: '#/components/schemas/NotificationSettings' },
      lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  ActivityEvent: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      action: { type: 'string', example: 'account.profile.update' },
      category: { type: 'string', example: 'account' },
      outcome: { type: 'string', enum: ['success', 'failure'] },
      ip: { type: 'string' },
      userAgent: { type: 'string' },
      message: { type: 'string', nullable: true },
      at: { type: 'string', format: 'date-time' },
    },
  },

  LoginHistoryEntry: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      outcome: { type: 'string', enum: ['success', 'failure'] },
      ip: { type: 'string' },
      userAgent: { type: 'string' },
      message: { type: 'string', nullable: true },
      at: { type: 'string', format: 'date-time' },
    },
  },

  // --- Wrappers ------------------------------------------------------------

  ProfileWrapper: {
    type: 'object',
    properties: { profile: { $ref: '#/components/schemas/Profile' } },
  },
  PreferencesWrapper: {
    type: 'object',
    properties: { preferences: { $ref: '#/components/schemas/Preferences' } },
  },
  NotificationSettingsWrapper: {
    type: 'object',
    properties: {
      notificationSettings: { $ref: '#/components/schemas/NotificationSettings' },
    },
  },
  ActivityList: {
    type: 'object',
    properties: {
      activity: { type: 'array', items: { $ref: '#/components/schemas/ActivityEvent' } },
    },
  },
  LoginHistoryList: {
    type: 'object',
    properties: {
      logins: { type: 'array', items: { $ref: '#/components/schemas/LoginHistoryEntry' } },
    },
  },

  // --- Request bodies ------------------------------------------------------

  UpdateProfileRequest: {
    type: 'object',
    additionalProperties: false,
    description: 'Provide at least one field.',
    properties: {
      firstName: { type: 'string', maxLength: 80 },
      lastName: { type: 'string', maxLength: 80 },
    },
  },

  ChangePasswordRequest: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    additionalProperties: false,
    properties: {
      currentPassword: { type: 'string' },
      newPassword: {
        type: 'string',
        minLength: 12,
        maxLength: 72,
        description: 'Same policy as registration; must differ from the current password.',
      },
    },
  },

  DeleteAccountRequest: {
    type: 'object',
    required: ['password'],
    additionalProperties: false,
    description: 'Re-authentication for an irreversible action.',
    properties: { password: { type: 'string' } },
  },

  UploadAvatarRequest: {
    type: 'object',
    required: ['image'],
    additionalProperties: false,
    properties: {
      image: {
        type: 'string',
        description:
          'A base64 `data:image/(png|jpeg|webp|gif);base64,...` URI (max 512 KB decoded) or an absolute https URL.',
      },
    },
  },

  UpdatePreferencesRequest: {
    type: 'object',
    additionalProperties: false,
    description: 'Provide at least one field; omitted fields are left unchanged.',
    properties: {
      theme: { type: 'string', enum: USER_THEMES },
      language: { type: 'string', example: 'en-GB' },
      timezone: { type: 'string', example: 'Europe/London' },
    },
  },

  UpdateNotificationSettingsRequest: {
    type: 'object',
    additionalProperties: false,
    description:
      'Provide at least one flag. `securityAlerts` is ignored — it is always on.',
    properties: {
      productUpdates: { type: 'boolean' },
      securityAlerts: { type: 'boolean' },
      benchmarkComplete: { type: 'boolean' },
      weeklyReport: { type: 'boolean' },
    },
  },
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const userPaths: Record<string, unknown> = {
  '/users/me': {
    get: {
      tags: ['Account'],
      summary: 'Get the current profile',
      operationId: 'getProfile',
      responses: {
        200: successResponse('Profile retrieved.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
      },
    },
    patch: {
      tags: ['Account'],
      summary: 'Update the current profile',
      operationId: 'updateProfile',
      requestBody: jsonBody('#/components/schemas/UpdateProfileRequest'),
      responses: {
        200: successResponse('Profile updated.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
    delete: {
      tags: ['Account'],
      summary: 'Close the current account',
      description:
        'Soft-deletes the account, revokes every session, and clears the auth cookies. Requires the current password.',
      operationId: 'deleteAccount',
      requestBody: jsonBody('#/components/schemas/DeleteAccountRequest'),
      responses: {
        200: successResponse('Account closed.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Password incorrect or authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },

  '/users/me/change-password': {
    post: {
      tags: ['Account'],
      summary: 'Change the password',
      description:
        'Verifies the current password, sets the new one, and revokes every session. The client must sign in again afterwards.',
      operationId: 'changePassword',
      requestBody: jsonBody('#/components/schemas/ChangePasswordRequest'),
      responses: {
        200: successResponse('Password changed.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Current password incorrect.'),
        409: errorResponse('New password matches the current one.'),
        422: errorResponse('Validation failed.'),
        429: errorResponse('Rate limit exceeded.'),
      },
    },
  },

  '/users/me/avatar': {
    put: {
      tags: ['Account'],
      summary: 'Upload or replace the avatar',
      operationId: 'uploadAvatar',
      requestBody: jsonBody('#/components/schemas/UploadAvatarRequest'),
      responses: {
        200: successResponse('Avatar updated.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Unsupported or oversized image.'),
      },
    },
    delete: {
      tags: ['Account'],
      summary: 'Remove the avatar',
      operationId: 'removeAvatar',
      responses: {
        200: successResponse('Avatar removed.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
      },
    },
  },

  '/users/me/preferences': {
    get: {
      tags: ['Account'],
      summary: 'Get preferences',
      operationId: 'getPreferences',
      responses: {
        200: successResponse('Preferences retrieved.', '#/components/schemas/PreferencesWrapper'),
        401: errorResponse('Authentication required.'),
      },
    },
    put: {
      tags: ['Account'],
      summary: 'Update preferences',
      operationId: 'updatePreferences',
      requestBody: jsonBody('#/components/schemas/UpdatePreferencesRequest'),
      responses: {
        200: successResponse('Preferences updated.', '#/components/schemas/PreferencesWrapper'),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },

  '/users/me/notification-settings': {
    get: {
      tags: ['Account'],
      summary: 'Get notification settings',
      operationId: 'getNotificationSettings',
      responses: {
        200: successResponse(
          'Notification settings retrieved.',
          '#/components/schemas/NotificationSettingsWrapper',
        ),
        401: errorResponse('Authentication required.'),
      },
    },
    put: {
      tags: ['Account'],
      summary: 'Update notification settings',
      operationId: 'updateNotificationSettings',
      requestBody: jsonBody('#/components/schemas/UpdateNotificationSettingsRequest'),
      responses: {
        200: successResponse(
          'Notification settings updated.',
          '#/components/schemas/NotificationSettingsWrapper',
        ),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },

  '/users/me/activity': {
    get: {
      tags: ['Account'],
      summary: 'List account activity',
      description: 'The current user’s own audit events. Paginated, newest first.',
      operationId: 'getActivity',
      parameters: [
        ...listParams('-createdAt'),
        { name: 'action', in: 'query', schema: { type: 'string' } },
        { name: 'category', in: 'query', schema: { type: 'string' } },
        {
          name: 'outcome',
          in: 'query',
          schema: { type: 'string', enum: ['success', 'failure'] },
        },
      ],
      responses: {
        200: successResponse('Activity retrieved.', '#/components/schemas/ActivityList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },

  '/users/me/login-history': {
    get: {
      tags: ['Account'],
      summary: 'List login history',
      description: 'Successful and blocked sign-in attempts for the current user.',
      operationId: 'getLoginHistory',
      parameters: [
        ...listParams('-createdAt'),
        {
          name: 'outcome',
          in: 'query',
          schema: { type: 'string', enum: ['success', 'failure'] },
        },
      ],
      responses: {
        200: successResponse('Login history retrieved.', '#/components/schemas/LoginHistoryList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },

  '/users/me/sessions': {
    get: {
      tags: ['Account'],
      summary: 'List device sessions',
      operationId: 'listMySessions',
      responses: {
        200: successResponse('Sessions retrieved.', '#/components/schemas/SessionList'),
        401: errorResponse('Authentication required.'),
      },
    },
    delete: {
      tags: ['Account'],
      summary: 'Revoke every other session',
      description: 'Signs out of all devices except the one making the request.',
      operationId: 'revokeOtherSessions',
      responses: {
        200: successResponse('Other sessions revoked.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Authentication required.'),
      },
    },
  },

  '/users/me/sessions/{sessionId}': {
    delete: {
      tags: ['Account'],
      summary: 'Revoke one device session',
      operationId: 'revokeMySession',
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: successResponse('Session revoked.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Authentication required.'),
        404: errorResponse('Session not found.'),
      },
    },
  },
}

export const userTags: Array<Record<string, unknown>> = [
  {
    name: 'Account',
    description:
      'Self-service profile, credentials, avatar, preferences, notifications, activity, and device sessions.',
  },
]
