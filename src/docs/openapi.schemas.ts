/**
 * Reusable OpenAPI component schemas.
 *
 * Kept separate from the document itself so path definitions stay readable and
 * so feature modules added in later phases can reference these envelopes rather
 * than redeclaring them.
 */
export const componentSchemas: Record<string, unknown> = {
  ResponseMeta: {
    type: 'object',
    required: ['requestId', 'timestamp'],
    properties: {
      requestId: {
        type: 'string',
        description: 'Correlation id echoed in the X-Request-Id header.',
        example: '5f0b6b1e-9c2a-4f0a-9a6b-2f6a1f1c1d3e',
      },
      timestamp: { type: 'string', format: 'date-time' },
      durationMs: { type: 'number', example: 12.418 },
      path: { type: 'string', example: '/api/v1/health' },
      method: { type: 'string', example: 'GET' },
    },
  },

  PaginationMeta: {
    type: 'object',
    required: ['page', 'pageSize', 'total', 'pageCount', 'hasNext', 'hasPrevious'],
    properties: {
      page: { type: 'integer', example: 1 },
      pageSize: { type: 'integer', example: 20 },
      total: { type: 'integer', example: 137 },
      pageCount: { type: 'integer', example: 7 },
      hasNext: { type: 'boolean' },
      hasPrevious: { type: 'boolean' },
    },
  },

  SuccessEnvelope: {
    type: 'object',
    required: ['success', 'statusCode', 'message', 'data', 'meta'],
    properties: {
      success: { type: 'boolean', enum: [true] },
      statusCode: { type: 'integer', example: 200 },
      message: { type: 'string', example: 'Request completed successfully.' },
      data: { description: 'Endpoint specific payload.' },
      meta: { $ref: '#/components/schemas/ResponseMeta' },
      pagination: { $ref: '#/components/schemas/PaginationMeta' },
    },
  },

  ErrorDetail: {
    type: 'object',
    required: ['message'],
    properties: {
      field: { type: 'string', example: 'modelId' },
      message: { type: 'string', example: 'Expected a valid UUID.' },
      code: { type: 'string', example: 'invalid_type' },
    },
  },

  ErrorEnvelope: {
    type: 'object',
    required: ['success', 'statusCode', 'error', 'meta'],
    properties: {
      success: { type: 'boolean', enum: [false] },
      statusCode: { type: 'integer', example: 404 },
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            description: 'Stable machine-readable error code.',
            example: 'ROUTE_NOT_FOUND',
          },
          message: { type: 'string', example: 'Cannot GET /api/v1/unknown' },
          details: {
            type: 'array',
            items: { $ref: '#/components/schemas/ErrorDetail' },
          },
          stack: {
            type: 'string',
            description: 'Present only outside production.',
          },
        },
      },
      meta: { $ref: '#/components/schemas/ResponseMeta' },
    },
  },

  ComponentHealth: {
    type: 'object',
    required: ['name', 'status'],
    properties: {
      name: { type: 'string', example: 'postgresql' },
      status: {
        type: 'string',
        enum: ['up', 'down', 'degraded', 'unknown'],
      },
      latencyMs: { type: 'number', example: 1.732 },
      message: { type: 'string' },
      details: { type: 'object', additionalProperties: true },
    },
  },

  HealthReport: {
    type: 'object',
    required: ['status', 'service', 'version', 'environment', 'uptimeSeconds', 'checks'],
    properties: {
      status: { type: 'string', enum: ['up', 'down', 'degraded', 'unknown'] },
      service: { type: 'string', example: 'armforge-ai-backend' },
      version: { type: 'string', example: '1.0.0' },
      environment: { type: 'string', example: 'production' },
      uptimeSeconds: { type: 'integer', example: 84_213 },
      uptime: { type: 'string', example: '23h 23m 33s' },
      timestamp: { type: 'string', format: 'date-time' },
      checks: {
        type: 'array',
        items: { $ref: '#/components/schemas/ComponentHealth' },
      },
      system: {
        type: 'object',
        properties: {
          memory: {
            type: 'object',
            properties: {
              rssMb: { type: 'number' },
              heapUsedMb: { type: 'number' },
              heapTotalMb: { type: 'number' },
            },
          },
          cpu: {
            type: 'object',
            properties: {
              loadAverage: { type: 'array', items: { type: 'number' } },
              cores: { type: 'integer' },
            },
          },
          process: {
            type: 'object',
            properties: {
              pid: { type: 'integer' },
              nodeVersion: { type: 'string', example: 'v22.13.0' },
            },
          },
        },
      },
    },
  },

  LivenessReport: {
    type: 'object',
    required: ['status', 'uptimeSeconds', 'timestamp'],
    properties: {
      status: { type: 'string', enum: ['up'] },
      uptimeSeconds: { type: 'integer' },
      timestamp: { type: 'string', format: 'date-time' },
    },
  },

  ReadinessReport: {
    type: 'object',
    required: ['status', 'ready', 'checks', 'timestamp'],
    properties: {
      status: { type: 'string', enum: ['up', 'down', 'degraded', 'unknown'] },
      ready: { type: 'boolean' },
      checks: {
        type: 'array',
        items: { $ref: '#/components/schemas/ComponentHealth' },
      },
      timestamp: { type: 'string', format: 'date-time' },
    },
  },

  VersionReport: {
    type: 'object',
    required: ['service', 'version', 'apiVersion', 'environment', 'runtime'],
    properties: {
      service: { type: 'string', example: 'armforge-ai-backend' },
      version: { type: 'string', example: '1.0.0' },
      apiVersion: { type: 'string', example: 'v1' },
      environment: { type: 'string', example: 'production' },
      runtime: {
        type: 'object',
        properties: {
          node: { type: 'string', example: 'v22.13.0' },
          platform: { type: 'string', example: 'linux' },
          arch: { type: 'string', example: 'arm64' },
        },
      },
      startedAt: { type: 'string', format: 'date-time' },
    },
  },
}
