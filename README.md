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

# Phase 2 — Authentication & Identity

Phase 2 adds the identity layer on top of the Phase 1 foundation. Nothing from
Phase 1 was rewritten; the middleware chain gained one step, the router gained
two mounts, and the container gained a subgraph.

## Endpoints

All paths are relative to `/api/v1`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Create a pending account, email a verification code |
| POST | `/auth/verify-email` | — | Consume the OTP, activate the account, sign in |
| POST | `/auth/resend-otp` | — | Re-issue a code (subject to cooldown) |
| POST | `/auth/login` | — | Exchange credentials for a token pair |
| POST | `/auth/refresh` | refresh token | Rotate the refresh token |
| POST | `/auth/logout` | refresh token | Revoke this session |
| POST | `/auth/logout-all` | access token | Revoke every session |
| POST | `/auth/forgot-password` | — | Email a reset code |
| POST | `/auth/reset-password` | — | Set a new password, revoke all sessions |
| GET | `/auth/me` | access token | Current profile |
| GET | `/auth/sessions` | access token | List active sessions |
| GET | `/admin/audit-logs` | access token + `admin` | Query the audit trail |

## Token model

Two tokens, deliberately asymmetric:

- **Access token** — 15 minutes, stateless, carries `sub`, `email`, `role`, and
  `sid`. Verified by signature alone; `authenticate` performs **no database
  read**, which is what keeps authenticated requests cheap.
- **Refresh token** — 7 days, stateful, single-use. Only its SHA-256 hash is
  stored, so a leaked database dump yields no usable tokens.

The short access-token lifetime is the trade for skipping the database check: a
revoked user stays authenticated for at most one token period, and every
refresh re-validates them against the store.

Secrets are separate for the two token types and must differ. Signing both with
one key would let an access token be presented as a refresh token; the `type`
claim is checked on verification as a second line of defence, and `HS256` is
pinned explicitly so a forged `alg: none` header is rejected.

## Refresh token rotation

Each issued refresh token is one `sessions` document. Rotation inserts a
successor sharing the predecessor's `familyId` and marks the predecessor
`revoked`, linked forward via `replacedBySessionId`.

```
login ──> S1 (active, family F)
           │ refresh
           ├──> S1 revoked:rotated ──> S2 (active, family F)
           │                            │ refresh
           │                            ├──> S2 revoked:rotated ──> S3 (active, family F)
```

Revoked rows are **retained until their TTL expires** rather than deleted, and
that is the entire point of the design. A legitimate client never presents the
same refresh token twice, so a hit on a revoked row means the token leaked:

```
attacker replays S1 ──> row found, already revoked
                    ──> revokeFamily(F, 'reuse_detected')
                    ──> S3 dies too; both parties must re-authenticate
```

There is no way to tell the thief from the victim at that moment, so both are
signed out. Briefly inconveniencing the real user is the correct trade against
leaving an attacker holding a live session.

Sessions are also revoked when the password changes, when the account is
suspended, and when the concurrent-session cap is exceeded (oldest first).

## One-time codes

- Generated with `crypto.randomInt` — not `Math.random`, whose output is
  predictable from a handful of observed values.
- Stored as HMAC-SHA256 with a server-side pepper, never in plaintext. A
  database reader cannot mint a verification.
- Compared with `timingSafeEqual`.
- TTL enforced in the document *and* by a MongoDB TTL index, so expired codes
  disappear even if the application never looks at them again.
- Attempt-capped. The counter increments **before** comparison, so a dropped
  connection mid-verification cannot buy a free retry. On exhaustion the code is
  consumed outright rather than merely rejected.
- Issuing a new code invalidates outstanding ones for the same purpose, so a
  resend never multiplies the guessing surface.

## Cookies

Both tokens are set as `HttpOnly` cookies, which is what puts them out of reach
of XSS — a token in `localStorage` is readable by any injected script.

| Attribute | Value |
| --- | --- |
| `httpOnly` | always `true` |
| `secure` | forced `true` in production, or whenever `SameSite=None` |
| `sameSite` | `lax` by default |
| access cookie path | `/` |
| refresh cookie path | `/api/v1/auth` |

The refresh cookie is scoped to the auth path so it is not attached to ordinary
API calls. A credential that travels on every request is a credential exposed on
every request.

The token pair is also returned in the response body — browsers should ignore
it; it exists for CLI and CI clients with no cookie jar.

## Role-based authorization

`viewer (1) < engineer (2) < admin (3)`. New accounts are always `engineer`;
the role is hardcoded at registration and the strict Zod schema rejects an
unexpected `role` field, so self-service signup cannot mint an administrator.

Three guards are available: `requireRoles` (exact membership),
`requireMinimumRole` (rank threshold), and `requireSelfOrRole` (own resource, or
privileged). `authenticate` must always run first — the role check reads
`req.user`.

## Audit logging

Append-only. Every authentication event is recorded with actor, IP, user agent,
and the request id that ties it back to the access log.

Two properties matter. Writes **never** throw: a failed audit insert must not
fail the user's login. And payloads are recursively redacted — passwords, codes,
tokens, cookies, and `Authorization` headers are replaced before they reach the
collection, because a log that captures credentials is a second, less protected
copy of the credential store.

## Anti-enumeration & timing

- Unknown address and wrong password return an identical 401 body and code.
- Login hashes a throwaway password when the address is unknown, so the response
  time does not reveal which addresses exist.
- `forgot-password` always returns 200 with the same shape; even a cooldown
  violation is swallowed rather than surfaced, since "slow down" would itself
  confirm the account.
- Email-verification state is checked *after* the password comparison.

## Account protection

Failed logins increment atomically via `$inc`; after `AUTH_MAX_FAILED_LOGIN_ATTEMPTS`
the account locks for `AUTH_LOCK_DURATION_MS`. The lock is checked before bcrypt
runs, so a locked account costs an attacker a cheap read instead of a full hash.
Credential and OTP endpoints sit behind a tighter rate limiter (20 per 15
minutes) than the general API budget of 300.

## Schemas

| Collection | Notes |
| --- | --- |
| `users` | unique `email`; `passwordHash` is `select: false` so it cannot leak by accident |
| `otps` | TTL on `expiresAt`; `codeHash` is `select: false` |
| `sessions` | unique `tokenHash`; TTL on `expiresAt`; indexed by `{userId, revokedAt, createdAt}` |
| `audit_logs` | `createdAt` only — audit rows are never updated |

`UserWithSecret` is a distinct type from `UserEntity`, so returning a password
hash from a method that promises a plain user is a **compile error** rather than
a code-review catch.

## New environment variables

```dotenv
JWT_ACCESS_SECRET=            # required in production, min 32 chars
JWT_REFRESH_SECRET=           # required in production, must differ from above
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
JWT_ISSUER=armforge-ai
JWT_AUDIENCE=armforge-ai-clients

BCRYPT_SALT_ROUNDS=12
AUTH_MAX_FAILED_LOGIN_ATTEMPTS=5
AUTH_LOCK_DURATION_MS=900000
AUTH_MAX_ACTIVE_SESSIONS=5
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=20

OTP_LENGTH=6
OTP_TTL_MS=600000
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_MS=60000

COOKIE_ACCESS_NAME=armforge_access
COOKIE_REFRESH_NAME=armforge_refresh
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax

MAIL_TRANSPORT=stream         # 'stream' prints to the log; 'smtp' in production
SMTP_HOST=
SMTP_PORT=587
MAIL_FROM="ArmForge AI <no-reply@armforge.ai>"
APP_WEB_URL=http://localhost:3000
```

Startup validation refuses to boot a production process with missing or short
JWT secrets, identical access and refresh secrets, `SameSite=None` without
`Secure`, wildcard CORS with credentials enabled, or the stream mail transport.
Fail at boot, not at 3 a.m.

In development, `MAIL_TRANSPORT=stream` writes the full message to the log, so
OTP flows are testable with no SMTP server.

## Quick walkthrough

```bash
curl -X POST localhost:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@armforge.ai","password":"Str0ng!Passphrase","firstName":"Ada","lastName":"Lovelace"}'

# copy the 6-digit code from the application log
curl -X POST localhost:8080/api/v1/auth/verify-email -c jar.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@armforge.ai","code":"481920"}'

curl localhost:8080/api/v1/auth/me -b jar.txt
curl -X POST localhost:8080/api/v1/auth/refresh -b jar.txt -c jar.txt
```

## Not in this phase

Optimization, benchmarking, and model endpoints; OAuth/SSO; TOTP or WebAuthn
MFA; admin user management; a shared rate-limit store for horizontal scaling
(the limiter is in-memory and expects a Redis store before running multiple
instances).
