import { API_KEY_SCOPES, API_KEY_SORT_FIELDS, API_KEY_STATUSES } from '@/modules/apiKeys/api-key.constants'

const errorResponse = (description: string): Record<string, unknown> => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
})

const successResponse = (description: string, dataSchemaRef: string): Record<string, unknown> => ({
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

export const apiKeySchemas: Record<string, unknown> = {
  ApiKey: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string', example: 'CI pipeline' },
      keyPrefix: { type: 'string', example: 'afk_3fA9c1D02e' },
      scopes: { type: 'array', items: { type: 'string', enum: API_KEY_SCOPES } },
      status: { type: 'string', enum: API_KEY_STATUSES },
      lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
      lastUsedIp: { type: 'string', nullable: true },
      expiresAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  ApiKeyWithSecret: {
    allOf: [
      { $ref: '#/components/schemas/ApiKey' },
      {
        type: 'object',
        properties: {
          secret: {
            type: 'string',
            description: 'Returned exactly once. Copy it now — it cannot be retrieved again.',
            example: 'afk_3fA9c1D02e_9f1c2b6a4e7d8091c3b5a2f6e8d0c4b7',
          },
        },
      },
    ],
  },
  ApiKeyList: {
    type: 'object',
    properties: {
      apiKeys: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } },
    },
  },
  ApiKeyCreatedWrapper: {
    type: 'object',
    properties: { apiKey: { $ref: '#/components/schemas/ApiKeyWithSecret' } },
  },
  CreateApiKeyRequest: {
    type: 'object',
    required: ['name', 'scopes'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', maxLength: 120, example: 'CI pipeline' },
      scopes: {
        type: 'array',
        items: { type: 'string', enum: API_KEY_SCOPES },
        minItems: 1,
      },
      expiresInDays: { type: 'integer', minimum: 1, maximum: 3650, example: 90 },
    },
  },
}

export const apiKeyPaths: Record<string, unknown> = {
  '/api-keys': {
    post: {
      tags: ['API Keys'],
      summary: 'Create an API key',
      description:
        'Mints a new self-service API key scoped to the caller. The raw secret is returned once, in this response only, and is never persisted or retrievable again.',
      operationId: 'createApiKey',
      requestBody: jsonBody('#/components/schemas/CreateApiKeyRequest'),
      responses: {
        201: successResponse('API key created.', '#/components/schemas/ApiKeyCreatedWrapper'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('CSRF token missing or invalid.'),
        422: errorResponse('Validation failed.'),
      },
    },
    get: {
      tags: ['API Keys'],
      summary: 'List API keys',
      description: 'Lists the caller\'s own API keys. Never returns key hashes or secrets.',
      operationId: 'listApiKeys',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: API_KEY_STATUSES } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: API_KEY_SORT_FIELDS } },
        { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        200: successResponse('API keys retrieved.', '#/components/schemas/ApiKeyList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },
  '/api-keys/{id}': {
    delete: {
      tags: ['API Keys'],
      summary: 'Revoke an API key',
      description: 'Immediately revokes the key. Revocation cannot be undone; issue a new key instead.',
      operationId: 'revokeApiKey',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: successResponse('API key revoked.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('CSRF token missing or invalid, or not the key owner.'),
        404: errorResponse('API key not found.'),
      },
    },
  },
}

export const apiKeyTags: Array<Record<string, unknown>> = [
  {
    name: 'API Keys',
    description:
      'Self-service, scoped machine credentials. Management endpoints require a browser session; verification of the issued key itself is handled separately by API-key middleware.',
  },
]
