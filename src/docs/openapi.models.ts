import { ALLOWED_EXTENSIONS, MODEL_FRAMEWORKS, MODEL_SORT_FIELDS, MODEL_STATUSES, VERSION_STATUSES } from '@/modules/models/model.constants'

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

export const modelSchemas: Record<string, unknown> = {
  ModelVersion: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      modelId: { type: 'string' },
      versionNumber: { type: 'integer', example: 1 },
      versionLabel: { type: 'string', example: 'v1' },
      status: { type: 'string', enum: VERSION_STATUSES },
      originalFilename: { type: 'string', example: 'resnet50.onnx' },
      extension: { type: 'string', example: '.onnx' },
      sizeBytes: { type: 'integer', example: 102400000 },
      sha256: { type: 'string', example: 'a3f5...c8d1' },
      md5: { type: 'string', example: '9e10...4f2b' },
      virusScan: { type: 'string', enum: ['clean', 'infected', 'skipped'] },
      virusScanDetail: { type: 'string', nullable: true },
      metadata: { type: 'object', additionalProperties: true, nullable: true,
        description: 'Framework-specific header metadata (ONNX op-set, GGUF tensor count, etc.).' },
      uploadedAt: { type: 'string', format: 'date-time' },
      deletedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Model: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      ownerId: { type: 'string' },
      name: { type: 'string', example: 'ResNet-50 Arm Optimized' },
      description: { type: 'string' },
      framework: { type: 'string', enum: MODEL_FRAMEWORKS },
      tags: { type: 'array', items: { type: 'string' }, example: ['classification', 'arm'] },
      status: { type: 'string', enum: MODEL_STATUSES },
      versionCount: { type: 'integer' },
      latestVersionId: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  ModelDetail: {
    allOf: [
      { $ref: '#/components/schemas/Model' },
      { type: 'object', properties: {
          versions: { type: 'array', items: { $ref: '#/components/schemas/ModelVersion' } },
      } },
    ],
  },
  ModelWithLatestVersion: {
    allOf: [
      { $ref: '#/components/schemas/Model' },
      { type: 'object', properties: {
          latestVersion: {
            oneOf: [{ $ref: '#/components/schemas/ModelVersion' }, { type: 'null' }],
          },
      } },
    ],
  },
  ModelList: {
    type: 'object',
    properties: {
      models: { type: 'array', items: { $ref: '#/components/schemas/ModelWithLatestVersion' } },
    },
  },
  ModelWrapper: {
    type: 'object',
    properties: { model: { $ref: '#/components/schemas/ModelDetail' } },
  },
  ModelMutationWrapper: {
    type: 'object',
    properties: { model: { $ref: '#/components/schemas/Model' } },
  },
  VersionWrapper: {
    type: 'object',
    properties: { version: { $ref: '#/components/schemas/ModelVersion' } },
  },
  VersionList: {
    type: 'object',
    properties: {
      versions: { type: 'array', items: { $ref: '#/components/schemas/ModelVersion' } },
      count: { type: 'integer' },
    },
  },
  UploadProgress: {
    type: 'object',
    properties: {
      uploadId: { type: 'string', format: 'uuid' },
      modelId: { type: 'string' },
      phase: {
        type: 'string',
        enum: ['receiving', 'hashing', 'scanning', 'extracting', 'persisting', 'done', 'failed'],
      },
      percent: { type: 'integer', minimum: 0, maximum: 100 },
      bytesReceived: { type: 'integer' },
      bytesTotal: { type: 'integer' },
      error: { type: 'string', nullable: true },
      versionId: { type: 'string', nullable: true },
    },
  },
  UploadProgressWrapper: {
    type: 'object',
    properties: { progress: { $ref: '#/components/schemas/UploadProgress' } },
  },
  UploadAccepted: {
    type: 'object',
    properties: { uploadId: { type: 'string', format: 'uuid' } },
  },
  CreateModelRequest: {
    type: 'object',
    required: ['name', 'framework'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', maxLength: 200, example: 'ResNet-50' },
      description: { type: 'string', maxLength: 2000 },
      framework: { type: 'string', enum: MODEL_FRAMEWORKS },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    },
  },
  UpdateModelRequest: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    },
  },
}

export const modelPaths: Record<string, unknown> = {
  '/models': {
    post: {
      tags: ['Models'],
      summary: 'Create a model record',
      description: 'Creates the model metadata record. Upload the actual file with `POST /models/{id}/upload`.',
      operationId: 'createModel',
      requestBody: jsonBody('#/components/schemas/CreateModelRequest'),
      responses: {
        201: successResponse('Model created.', '#/components/schemas/ModelMutationWrapper'),
        401: errorResponse('Authentication required.'),
        422: errorResponse('Validation failed.'),
      },
    },
    get: {
      tags: ['Models'],
      summary: 'List models',
      operationId: 'listModels',
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'framework', in: 'query', schema: { type: 'string', enum: MODEL_FRAMEWORKS } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: MODEL_STATUSES } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: MODEL_SORT_FIELDS } },
        { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        200: successResponse('Models retrieved.', '#/components/schemas/ModelList'),
        401: errorResponse('Authentication required.'),
      },
    },
  },
  '/models/{id}': {
    get: {
      tags: ['Models'],
      summary: 'Get model with all versions',
      operationId: 'getModel',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: successResponse('Model retrieved.', '#/components/schemas/ModelWrapper'),
        401: errorResponse('Authentication required.'),
        404: errorResponse('Model not found.'),
      },
    },
    patch: {
      tags: ['Models'],
      summary: 'Update model metadata',
      operationId: 'updateModel',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody('#/components/schemas/UpdateModelRequest'),
      responses: {
        200: successResponse('Model updated.', '#/components/schemas/ModelMutationWrapper'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Not the owner or admin.'),
        404: errorResponse('Model not found.'),
      },
    },
    delete: {
      tags: ['Models'],
      summary: 'Delete model and all versions',
      operationId: 'deleteModel',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: successResponse('Model deleted.', '#/components/schemas/SuccessFlag'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Not the owner or admin.'),
        404: errorResponse('Model not found.'),
      },
    },
  },
  '/models/{id}/upload': {
    post: {
      tags: ['Models'],
      summary: 'Upload a model file (new version)',
      description: [
        'Accepts a model file as `multipart/form-data` in the `file` field.',
        '',
        `Supported extensions: ${ALLOWED_EXTENSIONS.join(', ')}.`,
        '',
        'Returns HTTP 202 immediately with an `uploadId`. Poll',
        '`GET /models/{id}/upload-progress/{uploadId}` until `phase` is `done` or `failed`.',
        '',
        '**Upload pipeline:**',
        '1. Stream to disk + compute SHA-256/MD5',
        '2. Deduplication check (SHA-256)',
        '3. Virus scan (pluggable; `skipped` if no AV configured)',
        '4. Framework metadata extraction (ONNX op-set, GGUF header, etc.)',
        '5. Mark version `ready`',
      ].join('\n'),
      operationId: 'uploadModelVersion',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: {
                file: { type: 'string', format: 'binary', description: 'The model file.' },
                versionLabel: { type: 'string', maxLength: 100, description: 'Human label, e.g. `v2-quantized`. Defaults to `v<N>`.' },
              },
            },
          },
        },
      },
      responses: {
        202: {
          description: 'Upload accepted. Poll progress endpoint.',
          content: { 'application/json': { schema: {
            allOf: [
              { $ref: '#/components/schemas/SuccessEnvelope' },
              { type: 'object', properties: { data: { $ref: '#/components/schemas/UploadAccepted' } } },
            ],
          } } },
        },
        400: errorResponse('Missing file, unsupported extension, or duplicate detected.'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Not the owner or admin.'),
        404: errorResponse('Model not found.'),
        413: errorResponse('File exceeds the configured size limit.'),
      },
    },
  },
  '/models/{id}/upload-progress/{uploadId}': {
    get: {
      tags: ['Models'],
      summary: 'Poll upload progress',
      operationId: 'getUploadProgress',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'uploadId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: successResponse('Upload progress.', '#/components/schemas/UploadProgressWrapper'),
        401: errorResponse('Authentication required.'),
        404: errorResponse('Upload not found or expired (TTL: 30 min).'),
      },
    },
  },
  '/models/{id}/versions': {
    get: {
      tags: ['Models'],
      summary: 'List all versions for a model',
      operationId: 'listModelVersions',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: successResponse('Versions retrieved.', '#/components/schemas/VersionList'),
        401: errorResponse('Authentication required.'),
        404: errorResponse('Model not found.'),
      },
    },
  },
  '/models/{id}/versions/{versionId}': {
    get: {
      tags: ['Models'],
      summary: 'Get a specific version',
      operationId: 'getModelVersion',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'versionId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: successResponse('Version retrieved.', '#/components/schemas/VersionWrapper'),
        401: errorResponse('Authentication required.'),
        404: errorResponse('Model or version not found.'),
      },
    },
    delete: {
      tags: ['Models'],
      summary: 'Delete a version',
      description: 'Removes the stored file and soft-deletes the version record.',
      operationId: 'deleteModelVersion',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'versionId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: successResponse('Version deleted.', '#/components/schemas/FlagResult'),
        401: errorResponse('Authentication required.'),
        403: errorResponse('Not the owner or admin.'),
        404: errorResponse('Model or version not found.'),
      },
    },
  },
}

export const modelTags: Array<Record<string, unknown>> = [
  {
    name: 'Models',
    description: 'AI model upload, versioning, metadata extraction, and management.',
  },
]
