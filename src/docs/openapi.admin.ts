import { USER_ROLES, USER_STATUSES } from '@/modules/auth/auth.constants'

/**
 * OpenAPI fragments for the administrator user-management surface
 * (`/admin/users`). The audit-trail path lives with the auth fragment.
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

export const adminSchemas: Record<string, unknown> = {
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
      deletedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },

  AdminUserList: {
    type: 'object',
    properties: {
      users: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
    },
  },

  AdminUserWrapper: {
    type: 'object',
    properties: { user: { $ref: '#/components/schemas/AdminUser' } },
  },

  AdminUpdateUserRequest: {
    type: 'object',
    additionalProperties: false,
    description: 'Provide a role, a status, or both. Suspending revokes live sessions.',
    properties: {
      role: { type: 'string', enum: USER_ROLES },
      status: { type: 'string', enum: ['active', 'suspended'] },
    },
  },
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const adminPaths: Record<string, unknown> = {
  '/admin/users': {
    get: {
      tags: ['Administration'],
      summary: 'List users',
      description:
        'Administrator only. Paginated, filterable (role, status, verified), searchable (email and name), and sortable.',
      operationId: 'listUsers',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        {
          name: 'sort',
          in: 'query',
          description: 'Comma-separated fields; prefix with `-` for descending.',
          schema: { type: 'string', example: '-createdAt,email' },
        },
        { name: 'role', in: 'query', schema: { type: 'string', enum: USER_ROLES } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: USER_STATUSES } },
        {
          name: 'verified',
          in: 'query',
          schema: { type: 'string', enum: ['true', 'false', '1', '0'] },
        },
        {
          name: 'search',
          in: 'query',
          description: 'Case-insensitive substring match on email, first name, and last name.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: successResponse('Users retrieved.', '#/components/schemas/AdminUserList'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required.'),
      },
    },
  },

  '/admin/users/{userId}': {
    get: {
      tags: ['Administration'],
      summary: 'Get a user',
      operationId: 'getUser',
      parameters: [
        { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: successResponse('User retrieved.', '#/components/schemas/AdminUserWrapper'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required.'),
        404: errorResponse('User not found.'),
      },
    },
    patch: {
      tags: ['Administration'],
      summary: 'Update a user',
      description: 'Change a user’s role or status. An administrator cannot target their own account.',
      operationId: 'updateUser',
      parameters: [
        { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      requestBody: jsonBody('#/components/schemas/AdminUpdateUserRequest'),
      responses: {
        200: successResponse('User updated.', '#/components/schemas/AdminUserWrapper'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required, or self-targeting.'),
        404: errorResponse('User not found.'),
        422: errorResponse('Validation failed.'),
      },
    },
    delete: {
      tags: ['Administration'],
      summary: 'Close a user account',
      description: 'Soft-deletes the account and revokes its sessions.',
      operationId: 'adminDeleteUser',
      parameters: [
        { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: successResponse('User account closed.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required, or self-targeting.'),
        404: errorResponse('User not found.'),
      },
    },
  },

  '/admin/users/{userId}/revoke-sessions': {
    post: {
      tags: ['Administration'],
      summary: 'Revoke a user’s sessions',
      description: 'Signs a user out of every device.',
      operationId: 'revokeUserSessions',
      parameters: [
        { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: successResponse('Sessions revoked.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Administrator role required.'),
        404: errorResponse('User not found.'),
      },
    },
  },
}
