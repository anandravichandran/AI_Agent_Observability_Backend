import { USER_ROLES, USER_STATUSES } from '@/modules/auth/auth.constants'
import { THEME_PREFERENCES, USER_SORT_FIELDS } from '@/modules/users/user.constants'

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

export const userSchemas: Record<string, unknown> = {
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
      avatarUrl: { type: 'string', nullable: true, example: '/uploads/avatars/665f....webp' },
      preferences: {
        type: 'object',
        properties: { theme: { type: 'string', enum: THEME_PREFERENCES } },
      },
      notifications: {
        type: 'object',
        properties: {
          productUpdates: { type: 'boolean' },
          securityAlerts: { type: 'boolean' },
          benchmarkResults: { type: 'boolean' },
          weeklyDigest: { type: 'boolean' },
        },
      },
      lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  ProfileWrapper: {
    type: 'object',
    properties: { profile: { $ref: '#/components/schemas/Profile' } },
  },
  NotificationsWrapper: {
    type: 'object',
    properties: {
      notifications: {
        type: 'object',
        properties: {
          productUpdates: { type: 'boolean' },
          securityAlerts: { type: 'boolean' },
          benchmarkResults: { type: 'boolean' },
          weeklyDigest: { type: 'boolean' },
        },
      },
    },
  },
  DeviceSession: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      ip: { type: 'string' },
      browser: { type: 'string', example: 'Chrome' },
      os: { type: 'string', example: 'macOS' },
      device: { type: 'string', example: 'Desktop' },
      userAgent: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      lastUsedAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' },
      current: { type: 'boolean' },
    },
  },
  DeviceSessionList: {
    type: 'object',
    properties: {
      sessions: { type: 'array', items: { $ref: '#/components/schemas/DeviceSession' } },
      count: { type: 'integer' },
    },
  },
  LoginHistoryEntry: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      at: { type: 'string', format: 'date-time' },
      ip: { type: 'string' },
      browser: { type: 'string' },
      os: { type: 'string' },
      device: { type: 'string' },
      userAgent: { type: 'string' },
      outcome: { type: 'string', enum: ['success', 'failure'] },
      detail: { type: 'string', nullable: true },
    },
  },
  LoginHistoryList: {
    type: 'object',
    properties: {
      entries: { type: 'array', items: { $ref: '#/components/schemas/LoginHistoryEntry' } },
    },
  },
  ActivityEntry: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      action: { type: 'string' },
      category: { type: 'string' },
      outcome: { type: 'string', enum: ['success', 'failure'] },
      at: { type: 'string', format: 'date-time' },
      ip: { type: 'string' },
      browser: { type: 'string' },
      os: { type: 'string' },
      device: { type: 'string' },
      message: { type: 'string', nullable: true },
    },
  },
  ActivityList: {
    type: 'object',
    properties: {
      entries: { type: 'array', items: { $ref: '#/components/schemas/ActivityEntry' } },
    },
  },
  UpdateProfileRequest: {
    type: 'object',
    additionalProperties: false,
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
      newPassword: { type: 'string', minLength: 12, maxLength: 72 },
    },
  },
  DeleteAccountRequest: {
    type: 'object',
    required: ['password'],
    additionalProperties: false,
    properties: { password: { type: 'string' } },
  },
  UpdatePreferencesRequest: {
    type: 'object',
    additionalProperties: false,
    properties: { theme: { type: 'string', enum: THEME_PREFERENCES } },
  },
  UpdateNotificationsRequest: {
    type: 'object',
    additionalProperties: false,
    description: 'securityAlerts is not editable and is always forced true server-side.',
    properties: {
      productUpdates: { type: 'boolean' },
      benchmarkResults: { type: 'boolean' },
      weeklyDigest: { type: 'boolean' },
    },
  },
  AdminUser: {
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
      lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  AdminUserDetail: {
    allOf: [
      { $ref: '#/components/schemas/AdminUser' },
      {
        type: 'object',
        properties: {
          failedLoginAttempts: { type: 'integer' },
          lockedUntil: { type: 'string', format: 'date-time', nullable: true },
          lastLoginIp: { type: 'string', nullable: true },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          activeSessions: { type: 'integer' },
        },
      },
    ],
  },
  AdminUserList: {
    type: 'object',
    properties: {
      users: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
    },
  },
  AdminUserWrapper: {
    type: 'object',
    properties: { user: { $ref: '#/components/schemas/AdminUserDetail' } },
  },
  AdminUserMutationWrapper: {
    type: 'object',
    properties: { user: { $ref: '#/components/schemas/AdminUser' } },
  },
  UpdateRoleRequest: {
    type: 'object',
    required: ['role'],
    additionalProperties: false,
    properties: { role: { type: 'string', enum: USER_ROLES } },
  },
  UpdateStatusRequest: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: { status: { type: 'string', enum: USER_STATUSES } },
  },
  FlagResult: {
    type: 'object',
    additionalProperties: true,
    properties: {
      passwordChanged: { type: 'boolean' },
      deleted: { type: 'boolean' },
      revoked: { type: 'boolean' },
      revokedSessions: { type: 'integer' },
    },
  },
}

export const userPaths: Record<string, unknown> = {
  '/users/profile': {
    get: {
      tags: ['Account'],
      summary: 'Get own profile',
      operationId: 'getProfile',
      responses: {
        200: successResponse('Profile retrieved.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
      },
    },
    patch: {
      tags: ['Account'],
      summary: 'Update own profile',
      operationId: 'updateProfile',
      requestBody: jsonBody('#/components/schemas/UpdateProfileRequest'),
      responses: {
        200: successResponse('Profile updated.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },
  '/users/password': {
    post: {
      tags: ['Account'],
      summary: 'Change password',
      description: 'Revokes every other session; the current session stays signed in.',
      operationId: 'changePassword',
      requestBody: jsonBody('#/components/schemas/ChangePasswordRequest'),
      responses: {
        200: successResponse('Password updated.', '#/components/schemas/FlagResult'),
        401: errorResponse('Current password incorrect or authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },
  '/users/account': {
    delete: {
      tags: ['Account'],
      summary: 'Delete own account',
      description: 'Soft-deletes the account, anonymises the email, clears the avatar, and revokes every session.',
      operationId: 'deleteAccount',
      requestBody: jsonBody('#/components/schemas/DeleteAccountRequest'),
      responses: {
        200: successResponse('Account deleted.', '#/components/schemas/FlagResult'),
        401: errorResponse('Password incorrect or authentication required.'),
      },
    },
  },
  '/users/avatar': {
    put: {
      tags: ['Account'],
      summary: 'Upload avatar',
      operationId: 'uploadAvatar',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['avatar'],
              properties: {
                avatar: { type: 'string', format: 'binary', description: 'PNG, JPEG, or WebP image.' },
              },
            },
          },
        },
      },
      responses: {
        200: successResponse('Avatar updated.', '#/components/schemas/ProfileWrapper'),
        400: errorResponse('Missing file or unsupported type.'),
        413: errorResponse('Avatar exceeds the configured size limit.'),
        401: errorResponse('Authentication required.'),
      },
    },
    delete: {
      tags: ['Account'],
      summary: 'Remove avatar',
      operationId: 'removeAvatar',
      responses: {
        200: successResponse('Avatar removed.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
      },
    },
  },
  '/users/preferences': {
    patch: {
      tags: ['Account'],
      summary: 'Update preferences',
      operationId: 'updatePreferences',
      requestBody: jsonBody('#/components/schemas/UpdatePreferencesRequest'),
      responses: {
        200: successResponse('Preferences updated.', '#/components/schemas/ProfileWrapper'),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },
  '/users/notifications': {
    patch: {
      tags: ['Account'],
      summary: 'Update notification settings',
      description: 'securityAlerts cannot be disabled and is always forced true.',
      operationId: 'updateNotifications',
      requestBody: jsonBody('#/components/schemas/UpdateNotificationsRequest'),
      responses: {
        200: successResponse('Notification settings updated.', '#/components/schemas/NotificationsWrapper'),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
  },
  '/users/devices': {
    get: {
      tags: ['Account'],
      summary: 'List signed-in devices',
      operationId: 'listDeviceSessions',
      responses: {
        200: successResponse('Devices retrieved.', '#/components/schemas/DeviceSessionList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },
  '/users/devices/{id}': {
    delete: {
      tags: ['Account'],
      summary: 'Sign out a device',
      operationId: 'revokeDeviceSession',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 24, maxLength: 24 } },
      ],
      responses: {
        200: successResponse('Device signed out.', '#/components/schemas/FlagResult'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Session belongs to another user.'),
        404: errorResponse('Session not found.'),
      },
    },
  },
  '/users/login-history': {
    get: {
      tags: ['Account'],
      summary: 'Login history',
      operationId: 'getLoginHistory',
      parameters: [
        { name: 'outcome', in: 'query', schema: { type: 'string', enum: ['success', 'failure'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        200: successResponse('Login history retrieved.', '#/components/schemas/LoginHistoryList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },
  '/users/activity': {
    get: {
      tags: ['Account'],
      summary: 'Account activity feed',
      operationId: 'getActivity',
      parameters: [
        { name: 'action', in: 'query', schema: { type: 'string' } },
        { name: 'outcome', in: 'query', schema: { type: 'string', enum: ['success', 'failure'] } },
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        200: successResponse('Account activity retrieved.', '#/components/schemas/ActivityList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },
  '/admin/users': {
    get: {
      tags: ['Administration'],
      summary: 'List users',
      description: 'Paginated, filterable, searchable, and sortable directory of non-deleted accounts.',
      operationId: 'adminListUsers',
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Substring match on email, first name, last name.' },
        { name: 'role', in: 'query', schema: { type: 'string', enum: USER_ROLES } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: USER_STATUSES } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt','updatedAt','email','firstName','lastName','lastLoginAt','role','status'] } },
        { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        200: successResponse('Users retrieved.', '#/components/schemas/AdminUserList'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required.'),
      },
    },
  },
  '/admin/users/{id}': {
    get: {
      tags: ['Administration'],
      summary: 'Get user detail',
      operationId: 'adminGetUser',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 24, maxLength: 24 } },
      ],
      responses: {
        200: successResponse('User retrieved.', '#/components/schemas/AdminUserWrapper'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required.'),
        404: errorResponse('User not found.'),
      },
    },
  },
  '/admin/users/{id}/role': {
    patch: {
      tags: ['Administration'],
      summary: 'Change user role',
      description: 'Cannot target self or another administrator. Revokes all sessions so the new role takes effect immediately.',
      operationId: 'adminUpdateRole',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 24, maxLength: 24 } },
      ],
      requestBody: jsonBody('#/components/schemas/UpdateRoleRequest'),
      responses: {
        200: successResponse('Role updated.', '#/components/schemas/AdminUserMutationWrapper'),
        403: errorResponse('Self-mutation or admin-on-admin blocked.'),
        404: errorResponse('User not found.'),
      },
    },
  },
  '/admin/users/{id}/status': {
    patch: {
      tags: ['Administration'],
      summary: 'Change user status',
      description: 'Suspending an account revokes every active session.',
      operationId: 'adminUpdateStatus',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 24, maxLength: 24 } },
      ],
      requestBody: jsonBody('#/components/schemas/UpdateStatusRequest'),
      responses: {
        200: successResponse('Status updated.', '#/components/schemas/AdminUserMutationWrapper'),
        403: errorResponse('Self-mutation or admin-on-admin blocked.'),
        404: errorResponse('User not found.'),
      },
    },
  },
  '/admin/users/{id}/sessions': {
    get: {
      tags: ['Administration'],
      summary: 'List a user\'s active sessions',
      operationId: 'adminListUserSessions',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 24, maxLength: 24 } },
      ],
      responses: {
        200: successResponse('Sessions retrieved.', '#/components/schemas/DeviceSessionList'),
        404: errorResponse('User not found.'),
      },
    },
    delete: {
      tags: ['Administration'],
      summary: 'Revoke every session for a user',
      operationId: 'adminRevokeUserSessions',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 24, maxLength: 24 } },
      ],
      responses: {
        200: successResponse('Sessions revoked.', '#/components/schemas/FlagResult'),
        403: errorResponse('Self-mutation or admin-on-admin blocked.'),
        404: errorResponse('User not found.'),
      },
    },
  },
}

export const userTags: Array<Record<string, unknown>> = [
  {
    name: 'Account',
    description: 'Self-service profile, security, devices, preferences, and activity.',
  },
]
