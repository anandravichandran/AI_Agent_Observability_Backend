# ArmForge AI Backend

Autonomous AI Optimization & Benchmarking Platform for Arm — platform API.

> **Phase 1 — platform foundation only.**
> This build contains the architecture, configuration, logging, database connection, security middleware, response contract, error handling and API documentation. There is no authentication and no business logic, by design. Domain modules land in later phases and slot into the structure already in place.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Runtime | Node.js 22 |
| Framework | Express 4 |
| Language | TypeScript 5 (strict) |
| Database | MongoDB via Mongoose 8 |
| Validation | Zod |
| Logging | Winston + Morgan |
| Security | Helmet, CORS, express-rate-limit |
| Docs | OpenAPI 3.0 + Swagger UI |
| Tooling | tsx, ESLint (type-checked), Prettier |

---

## Getting started

```bash
cp .env.example .env      # MONGO_URI is the only required variable
npm install
npm run dev               # tsx watch, hot reload
```

Or with Docker:

```bash
docker compose up --build   # API on :8080, MongoDB on :27017
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and emit to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run format` | Prettier write |

---

## Endpoints

All routes are mounted under `API_PREFIX/API_VERSION`, which defaults to `/api/v1`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Service banner with links to docs and health |
| GET | `/api/v1/health` | Full report: process metrics + every dependency probe |
| GET | `/api/v1/health/live` | Liveness probe — process only, never touches a dependency |
| GET | `/api/v1/health/ready` | Readiness probe — 503 while a dependency is unavailable |
| GET | `/api/v1/version` | Build and runtime information |
| GET | `/api/v1/docs` | Swagger UI |
| GET | `/api/v1/docs.json` | Raw OpenAPI document |

Liveness and readiness are deliberately separate. A database outage must remove the instance from the load balancer pool without causing the orchestrator to restart an otherwise healthy process.

---

## Architecture

Clean Architecture, dependencies pointing inward. `core` knows nothing about Express or Mongoose; `infrastructure` and `modules` depend on `core` abstractions; only `container.ts` knows about concrete classes.

```
src/
├── server.ts                       # Entry point: bootstrap, listen, shutdown
├── app.ts                          # Express factory (pure over its dependencies)
├── container.ts                    # Composition root — the only place that uses `new`
├── index.ts                        # Library surface for tests and future workers
│
├── config/                         # Central configuration
│   ├── env.ts                      # Zod-validated environment (only reader of process.env)
│   ├── config.types.ts             # AppConfig contract, split into narrow slices
│   ├── package-info.ts             # name/version/description from package.json
│   └── index.ts                    # buildConfig() factory
│
├── core/                           # Framework-agnostic primitives
│   ├── constants/
│   │   ├── http-status.ts          # Status codes + reason phrases
│   │   ├── error-codes.ts          # Stable machine-readable error codes
│   │   └── index.ts                # Header names, observability paths
│   ├── errors/
│   │   ├── app-error.ts            # AppError + typed subclasses
│   │   └── index.ts
│   ├── http/
│   │   ├── api-response.ts         # Envelope builders (pure, no Express types)
│   │   ├── async-handler.ts        # Promise rejection forwarding
│   │   └── index.ts
│   ├── logger/
│   │   ├── logger.interface.ts     # ILogger port
│   │   ├── winston.logger.ts       # Winston adapter
│   │   ├── noop.logger.ts          # Null Object for tests
│   │   └── index.ts
│   ├── types/
│   │   ├── express.d.ts            # req.id, req.logger, res.success augmentation
│   │   ├── common.types.ts         # HealthReporter, ComponentHealth, Disposable
│   │   └── index.ts
│   └── utils/
│       ├── time.ts                 # Monotonic clock, uptime formatting, sleep
│       ├── graceful-shutdown.ts    # Signal handling with a watchdog deadline
│       └── index.ts
│
├── infrastructure/
│   └── database/
│       ├── database.interface.ts   # IDatabaseConnection port
│       ├── mongoose.connection.ts  # Adapter: retry, lifecycle events, ping
│       └── index.ts
│
├── middleware/
│   ├── request-id.middleware.ts    # Correlation id + request-scoped logger
│   ├── response-formatter.middleware.ts
│   ├── security.middleware.ts      # Helmet + CORS
│   ├── compression.middleware.ts
│   ├── http-logger.middleware.ts   # Morgan piped into Winston
│   ├── rate-limiter.middleware.ts  # Factory, envelope-shaped rejection
│   ├── not-found.middleware.ts     # 404 → typed error
│   ├── error-handler.middleware.ts # Terminal handler, normalises every throw
│   └── index.ts
│
├── modules/
│   └── health/
│       ├── health.types.ts
│       ├── health.service.interface.ts
│       ├── health.service.ts
│       ├── health.controller.ts
│       ├── health.routes.ts
│       ├── database.health-reporter.ts
│       └── index.ts
│
├── routes/
│   └── index.ts                    # v1 router — where feature routers mount
│
├── docs/
│   ├── openapi.schemas.ts          # Reusable component schemas
│   ├── openapi.document.ts         # Hand-authored OpenAPI 3.0 document
│   ├── swagger.ts                  # Swagger UI + raw JSON installer
│   └── index.ts
│
└── types/
    └── global.d.ts
```

### Dependency injection

`container.ts` is the composition root and the only module that instantiates concrete classes. Everything else receives its collaborators through a constructor or a factory argument, typed against an interface:

```ts
const logger = createLogger(config.logger)
const database: IDatabaseConnection = new MongooseConnection(config.database, logger)
const reporters: HealthReporter[] = [new DatabaseHealthReporter(database)]
const healthService: IHealthService = new HealthService({ app, http, reporters })
const healthController = new HealthController(healthService)
const app = createApp({ config, logger, healthController })
```

A hand-rolled container rather than a DI framework: the graph is small, construction order is explicit, there is no decorator metadata or runtime reflection, and a missing dependency is a compile error rather than a first-request failure.

### SOLID in practice

- **Single responsibility** — `MongooseConnection` only manages a connection; `HealthService` only aggregates health; `HealthController` only maps a result to a status code.
- **Open/closed** — adding a dependency to the health report means pushing one more `HealthReporter` into the array in the container. `HealthService` is untouched.
- **Liskov** — `NoopLogger` substitutes for `WinstonLogger` anywhere `ILogger` is expected.
- **Interface segregation** — modules take `LoggerConfig` or `DatabaseConfig`, not the whole `AppConfig`.
- **Dependency inversion** — the application depends on `ILogger` and `IDatabaseConnection`; Winston and Mongoose are implementation details confined to their adapters.

---

## Response contract

Every endpoint returns the same envelope, so clients write one parser. `success` is the discriminant.

**Success**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Service is healthy.",
  "data": { "status": "up" },
  "meta": {
    "requestId": "5f0b6b1e-9c2a-4f0a-9a6b-2f6a1f1c1d3e",
    "timestamp": "2026-07-31T01:22:04.118Z",
    "durationMs": 3.812,
    "path": "/api/v1/health",
    "method": "GET"
  }
}
```

**Error**

```json
{
  "success": false,
  "statusCode": 404,
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "Cannot GET /api/v1/unknown",
    "details": [{ "message": "No route matches this method and path." }]
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

Controllers never build an envelope by hand — the response formatter installs `res.success()`, `res.created()`, `res.accepted()`, `res.noContent()` and `res.respond()`. Changing the envelope is a one-file change.

---

## Middleware pipeline

Order is load bearing and documented inline in `app.ts`:

1. `trust proxy` — so `req.ip` is correct before anything reads it
2. Request ID — every later log line needs the correlation id
3. Helmet — security headers before any body is parsed or echoed
4. CORS — must precede routing to answer preflight requests
5. Compression — wraps the response writer before handlers run
6. Body parsers — malformed JSON surfaces in the error handler
7. Response formatter — installs the envelope helpers
8. Morgan — after the id exists, before routing
9. Rate limiter — rejects excess load before real work begins
10. Swagger, then the v1 router, then the root banner
11. 404 handler — throws a typed error rather than responding directly
12. Error handler — always last

---

## Error handling

One terminal handler normalises every thrown value into the error envelope:

| Thrown | Status | Code |
| --- | --- | --- |
| `AppError` subclass | as declared | as declared |
| `ZodError` | 422 | `VALIDATION_ERROR` |
| `mongoose.Error.ValidationError` | 422 | `VALIDATION_ERROR` |
| `mongoose.Error.CastError` | 400 | `INVALID_IDENTIFIER` |
| Duplicate key (11000) | 409 | `DUPLICATE_RESOURCE` |
| `MongooseServerSelectionError` | 503 | `DATABASE_UNAVAILABLE` |
| `entity.too.large` | 413 | `PAYLOAD_TOO_LARGE` |
| `entity.parse.failed` | 400 | `INVALID_JSON` |
| Anything else | 500 | `INTERNAL_ERROR` |

Operational errors (bad input, missing resource) log at `warn`. Non-operational errors and any 5xx log at `error` with a full stack. In production, a non-operational message is replaced with a generic string before it reaches the client — internal messages routinely contain connection strings and file paths. Stacks are only ever serialised outside production.

Because the 404 handler throws instead of responding, an unmatched route produces exactly the same envelope as any other failure.

---

## Configuration

`src/config/env.ts` is the only module permitted to read `process.env`. It validates with Zod, coerces types, and throws `EnvironmentValidationError` listing every problem at once. A misconfigured deployment fails at boot with a readable message rather than at the first request that needed the missing variable.

`buildConfig()` derives an immutable, frozen `AppConfig` split into narrow slices — `app`, `http`, `database`, `logger`, `cors`, `rateLimit`, `swagger` — so each consumer depends only on what it uses.

See `.env.example` for the full list of variables and defaults.

---

## Logging

`ILogger` is the port; Winston is one adapter behind it. Application code never imports Winston.

- Pretty single-line output in development, JSON in production
- Optional daily-rotated file transports (`LOG_TO_FILE`)
- Morgan access logs are piped through the same transport, so access and application logs share one format and one destination
- `req.logger` is a child logger with the request id already bound, so no handler has to remember to include it
- Health probes are skipped from access logs in production to keep signal high

---

## Graceful shutdown

On `SIGTERM` / `SIGINT`, and on an uncaught exception or unhandled rejection:

1. Stop accepting new connections, drain in-flight requests
2. Run teardown callbacks in order (currently: close the MongoDB connection)
3. Exit

A watchdog timer forces exit at `SHUTDOWN_TIMEOUT_MS` so a wedged socket can never stall a rolling deploy. A second signal during shutdown forces an immediate exit.

---

## What Phase 1 deliberately excludes

- Authentication and authorisation
- Domain models, repositories, and business rules
- File upload handling and object storage
- Job queues and background workers

Extension points are already in place: register feature routers in `src/routes/index.ts`, add health probes by pushing a `HealthReporter` into the array in `container.ts`, and tighten limits on expensive endpoints with `createRateLimiter(config.rateLimit, { max: 10 })`.

A horizontally scaled deployment should replace the rate limiter's in-memory store with a shared Redis store — the only change required is the `store` option in `rate-limiter.middleware.ts`.

---

# Phase 3 — Account, Profile & Administration

Phase 3 adds the self-service account surface and administrator user management
on top of the Phase 2 identity layer. Nothing from earlier phases was rewritten;
the router gained two mounts, the container gained avatar storage plus two
services, and the user schema gained profile fields.

## Self-service endpoints

All paths are relative to `/api/v1`. Every id on this surface comes from the
verified access token — never from the URL — which is the IDOR invariant.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/users/profile` | Full profile (avatar, preferences, notifications) |
| PATCH | `/users/profile` | Update first/last name |
| POST | `/users/password` | Change password (other devices signed out) |
| DELETE | `/users/account` | Soft-delete account (password required) |
| PUT | `/users/avatar` | Upload avatar (`multipart/form-data`, field `avatar`) |
| DELETE | `/users/avatar` | Remove avatar |
| PATCH | `/users/preferences` | Update theme (`light` / `dark` / `system`) |
| PATCH | `/users/notifications` | Update notification toggles |
| GET | `/users/devices` | List signed-in devices (parsed UA) |
| DELETE | `/users/devices/:id` | Sign out one device |
| GET | `/users/login-history` | Paginated login history |
| GET | `/users/activity` | Paginated account activity feed |

## Administration endpoints

All require the `admin` role.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/audit-logs` | Query the security audit trail |
| GET | `/admin/users` | List users (search, filter, sort, page) |
| GET | `/admin/users/:id` | User detail + active session count |
| PATCH | `/admin/users/:id/role` | Change role (revokes all sessions) |
| PATCH | `/admin/users/:id/status` | Suspend / reactivate |
| GET | `/admin/users/:id/sessions` | List a user's devices |
| DELETE | `/admin/users/:id/sessions` | Revoke every session |

### Privilege rules

Two rules live in the service, above the route gate:

1. An admin cannot change their **own** role or status through this surface.
2. An admin cannot modify **another** administrator. There is no super-admin tier.

## Pagination, filtering, searching, sorting

Shared plumbing lives in `src/core/http/pagination.ts`.

- **Pagination:** `page` (default 1) and `limit` (default 20, max 100).
- **Search (admin list):** case-insensitive substring on email, first name, last name. Regex metacharacters are escaped so user input is never a ReDoS vector.
- **Filter:** `role`, `status`, `outcome`, `action`, date range (`from`/`to`).
- **Sort:** whitelist only (`createdAt`, `updatedAt`, `email`, `firstName`, `lastName`, `lastLoginAt`, `role`, `status`). Anything else falls back to `createdAt desc`.

List responses put the page of items in `data` and the standard
`pagination` block on the envelope (`page`, `pageSize`, `total`, `pageCount`,
`hasNext`, `hasPrevious`).

## Avatar storage

- Port: `IAvatarStorage` — swap local disk for S3 without touching the service.
- Adapter: `LocalAvatarStorage` writes `<UPLOAD_DIR>/avatars/<userId>.<ext>`.
- Served at `/uploads/...` outside the API rate limiter, with
  `Cross-Origin-Resource-Policy: cross-origin` so the web client can embed them.
- MIME allow-list: PNG, JPEG, WebP. Size ceiling: `UPLOAD_AVATAR_MAX_BYTES`
  (default 2 MB).
- Deep content validation (is the byte stream actually an image?) is a known
  hardening gap for a local deployment and is called out intentionally.

## Soft delete

`DELETE /users/account` stamps `deletedAt`, anonymises the email to
`deleted+<id>@deleted.invalid` so the address can be re-registered, clears the
avatar, and revokes every session. The row is retained so the audit trail stays
resolvable. Admin listings exclude deleted accounts.

## Notification settings

`securityAlerts` cannot be disabled. The Zod schema rejects the field on input,
and the service forces it back to `true` on every write — belt and braces.

## New environment variables

```dotenv
UPLOAD_DIR=uploads
UPLOAD_AVATAR_MAX_BYTES=2097152
```

## Not in this phase

Optimization / benchmark / model endpoints, OAuth/SSO, MFA beyond email OTP,
image-content deep validation, and a shared object-store adapter for multi-instance
avatar storage.

---

# Phase 4 — Model Upload & Management

Phase 4 adds AI model upload, versioning, metadata extraction, virus-scan
integration, and full CRUD management for model records.

## Endpoints

All paths relative to `/api/v1`. All endpoints require authentication.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/models` | Create model record |
| GET | `/models` | List models (search / filter / sort / page) |
| GET | `/models/:id` | Get model + all versions |
| PATCH | `/models/:id` | Update name / description / tags |
| DELETE | `/models/:id` | Delete model + all version files |
| POST | `/models/:id/upload` | Upload a model file (new version) |
| GET | `/models/:id/upload-progress/:uploadId` | Poll upload progress |
| GET | `/models/:id/versions` | List versions |
| GET | `/models/:id/versions/:versionId` | Get one version |
| DELETE | `/models/:id/versions/:versionId` | Delete one version + file |

## Supported frameworks

| Framework | Extensions | Notes |
| --- | --- | --- |
| ONNX | `.onnx` | IR version, op-set, producer extracted from protobuf header |
| PyTorch | `.pt` `.pth` `.bin` | ZIP entries and pickle presence inspected |
| TensorFlow | `.pb` `.h5` `.keras` `.tflite` | Format classified by extension |
| GGUF | `.gguf` | Version, tensor count, KV count, architecture from binary header |

## Upload pipeline

HTTP 202 is returned as soon as the file is received. The client polls for progress:

```
POST /models/:id/upload  ->  202 {uploadId}
  1. Extension check (framework allow-list)
  2. Stream to disk + SHA-256 + MD5 in parallel (single read)
  3. Deduplication: SHA-256 match in same model -> 409
  4. Persist version record (status: uploading)
  5. Virus scan via IVirusChecker (noop by default -> skipped)
  6. Metadata extraction from file header
  7. Version status -> ready | failed, model.versionCount++

GET /models/:id/upload-progress/:uploadId
  phases: receiving -> hashing -> scanning -> extracting -> persisting -> done
```

## File hash & checksum

- **SHA-256** primary identity; used for deduplication
- **MD5** for compatibility with downstream tooling

Both computed in a single streaming pass via a PassThrough tee.

## Metadata extraction

All extractors read only the file header (first 4–64 KB), so even a 5 GB file yields metadata in milliseconds.

| Framework | Fields |
| --- | --- |
| ONNX | `irVersion`, `opsetVersion`, `producerName`, `domain`, `modelVersion` |
| PyTorch | `hasPickle`, `zipEntries` (first 50 entries) |
| TensorFlow | `format` (pb/h5/tflite) |
| GGUF | `version`, `tensorCount`, `kvCount`, `architecture` |

## Virus check hook

Port: `IVirusChecker` in `src/infrastructure/virus/virus-checker.interface.ts`.

Default adapter `NoopVirusChecker` always returns `skipped`. Wire a real scanner in `container.ts`:

```ts
const virusChecker: IVirusChecker = new ClamAvChecker({ socket: '/var/run/clamav/clamd.sock' })
```

An `infected` result removes the file immediately and marks the version `failed`.

## Versioning

Each upload creates a new `ModelVersion` document with a monotonically increasing `versionNumber`. The model record stores denormalised `versionCount` and `latestVersionId`. Deleting a version removes the physical file, soft-deletes the row, and recomputes `latestVersionId` from surviving READY versions.

## MongoDB collections

| Collection | Key indexes |
| --- | --- |
| `ai_models` | `ownerId`, `framework+status`, text on `name+description` |
| `model_versions` | `modelId+versionNumber` (unique), `sha256` |

## New environment variables

```dotenv
MODEL_UPLOAD_DIR=model-uploads
MODEL_UPLOAD_TEMP_DIR=/tmp/armforge-uploads
MODEL_UPLOAD_MAX_BYTES=5368709120   # 5 GB
```

## Not in this phase

Optimization, benchmarking, inference endpoints, object-storage adapter, real-time progress (WebSocket/SSE), content-based deep validation (magic bytes enforcement beyond extension check).
