import type { AppConfig } from '@/config/config.types'
import { componentSchemas } from './openapi.schemas'
import { authPaths, authSchemas, authSecuritySchemes, authTags } from './openapi.auth'
import { userPaths, userSchemas, userTags } from './openapi.users'
import { modelPaths, modelSchemas, modelTags } from './openapi.models'
import { apiKeyPaths, apiKeySchemas, apiKeyTags } from './openapi.apiKeys'

/**
 * Hand-authored OpenAPI 3.0 document.
 *
 * Per-phase fragments are merged here so each phase owns its own file and this
 * module stays a thin composition root for the contract.
 */
export const buildOpenApiDocument = (config: AppConfig): Record<string, unknown> => {
  const errorResponse = (description: string): Record<string, unknown> => ({
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorEnvelope' },
      },
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
            {
              type: 'object',
              properties: { data: { $ref: dataSchemaRef } },
            },
          ],
        },
      },
    },
  })

  return {
    openapi: '3.0.3',

    info: {
      title: config.app.title,
      version: config.app.version,
      description: [
        '## ArmForge AI — Platform API',
        '',
        'Autonomous AI optimization and benchmarking platform for Arm.',
        '',
        '### Response contract',
        '',
        'Every endpoint returns a uniform envelope. Success responses carry a',
        '`data` payload; failures carry an `error` object with a stable',
        '`error.code`. Both always include a `meta.requestId` that matches the',
        '`X-Request-Id` response header.',
        '',
        '### Authentication',
        '',
        'Sign in at `POST /auth/login`. Tokens are set as `HttpOnly` cookies and',
        'also returned in the body for non-browser clients. Refresh tokens are',
        'single-use; replaying a consumed token revokes the entire rotation family.',
        '',
        '### Account & administration',
        '',
        'Self-service account routes live under `/users/*`. Administrative user',
        'management and the audit trail live under `/admin/*` and require the',
        '`admin` role.',
        '',
        '### Phase',
        '',
        'This build exposes the platform foundation, identity, and account layer.',
        'Domain endpoints (models, optimization, benchmarks) arrive later.',
      ].join('\n'),
      contact: {
        name: 'ArmForge AI Platform Team',
        email: 'platform@armforge.ai',
      },
      license: { name: 'Proprietary' },
    },

    servers: [
      {
        url: config.http.basePath,
        description: `${config.app.env} — current instance`,
      },
    ],

    tags: [
      {
        name: 'System',
        description: 'Health, readiness, liveness and build metadata.',
      },
      ...authTags,
      ...userTags,
      ...modelTags,
      ...apiKeyTags,
    ],

    security: [{ bearerAuth: [] }, { cookieAuth: [] }],

    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Full health report',
          description:
            'Aggregates process metrics and probes every registered dependency. Returns 503 when any dependency is down or degraded.',
          operationId: 'getHealth',
          security: [],
          responses: {
            200: successResponse('Service is healthy.', '#/components/schemas/HealthReport'),
            429: errorResponse('Rate limit exceeded.'),
            503: errorResponse('A dependency is unavailable or degraded.'),
          },
        },
      },

      '/health/live': {
        get: {
          tags: ['System'],
          summary: 'Liveness probe',
          description:
            'Reports whether the process is running. Never touches a dependency, so a database outage cannot trigger a container restart.',
          operationId: 'getLiveness',
          security: [],
          responses: {
            200: successResponse('Process is live.', '#/components/schemas/LivenessReport'),
          },
        },
      },

      '/health/ready': {
        get: {
          tags: ['System'],
          summary: 'Readiness probe',
          description:
            'Reports whether this instance can serve traffic. Returns 503 while a dependency is unavailable so the instance is removed from the load balancer pool.',
          operationId: 'getReadiness',
          security: [],
          responses: {
            200: successResponse('Instance is ready.', '#/components/schemas/ReadinessReport'),
            503: errorResponse('Instance is not ready to accept traffic.'),
          },
        },
      },

      '/version': {
        get: {
          tags: ['System'],
          summary: 'Build and runtime information',
          operationId: 'getVersion',
          security: [],
          responses: {
            200: successResponse(
              'Version information retrieved.',
              '#/components/schemas/VersionReport',
            ),
          },
        },
      },

      ...authPaths,
      ...userPaths,
      ...modelPaths,
      ...apiKeyPaths,
    },

    components: {
      schemas: {
        ...componentSchemas,
        ...authSchemas,
        ...userSchemas,
        ...modelSchemas,
        ...apiKeySchemas,
      },
      securitySchemes: authSecuritySchemes(config.cookie.accessName),
      headers: {
        'X-Request-Id': {
          description: 'Correlation id for this request.',
          schema: { type: 'string' },
        },
        'X-Response-Time': {
          description: 'Server-side processing duration.',
          schema: { type: 'string', example: '12.418ms' },
        },
      },
      responses: {
        Unauthorized: errorResponse('Authentication is required or the token is invalid.'),
        Forbidden: errorResponse('The authenticated user lacks the required role.'),
        NotFound: errorResponse('The requested route or resource does not exist.'),
        TooManyRequests: errorResponse('Rate limit exceeded.'),
        InternalServerError: errorResponse('An unexpected error occurred.'),
      },
    },
  }
}
