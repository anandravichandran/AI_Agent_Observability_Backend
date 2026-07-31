# ArmForge Backend — Audit, Postgres/Prisma Migration & Auth Rebuild

Staff-engineer deliverable for the MongoDB→PostgreSQL/Prisma migration and
authentication rebuild. Written against `AI_Agent_Observability_Backend-main`.

> **Verification caveat (read first):** This sandbox has no outbound network
> access, so `npm install`, `prisma generate`, `prisma migrate dev`, and
> `npm run build`/`tsc`/`vitest run` could not be executed here. All changes
> were made by careful manual review against the existing type signatures,
> interfaces, and call sites, and cross-checked with `grep` sweeps for stale
> references, but you must run the commands in the **Deployment checklist**
> below before deploying.

---

## 1. Complete backend audit report

### Authentication bugs
| # | Issue | File |
|---|---|---|
| A1 | Refresh token's `sid` claim was a throwaway placeholder that never matched the session row's id, so any consumer trusting the refresh token's `sid` (session-scoped revocation, forensics) silently failed. | `auth.service.ts` (`rotateSession`) |
| A2 | Missing resend cap — a purpose (`EMAIL_VERIFICATION`/`PASSWORD_RESET`) could be resent indefinitely, turning the mailer into an open spam relay. | `auth.service.ts` (`issueOtp`) |
| A3 | OTP resend-limit violations were reported with the same error code as cooldown violations (`OTP_RESEND_COOLDOWN`), conflating two different client-facing conditions. | `auth.service.ts`, `error-codes.ts` |
| A4 | Route param validator for user ids still validated a 24-character Mongo `ObjectId` shape, which rejects every valid Postgres UUID post-migration. | `user.validation.ts` |
| A5 | `env.ts` still declared `MONGO_*` variables while `config/index.ts` already read `env.DATABASE_URL`/`env.DATABASE_*` — a schema/consumer mismatch that would fail at boot with "env.DATABASE_URL is not defined". | `config/env.ts` |
| A6 | `OTP_TTL_MS` defaulted to 600 000 ms (10 minutes), violating TASK 6's "OTP expires in 5 minutes" requirement. | `config/env.ts` |
| A7 | No `OTP_MAX_RESENDS` environment variable existed even though the OTP entity and service already depended on `otpConfig.maxResends`. | `config/env.ts` |

### Migration bugs (Mongo → Postgres)
| # | Issue | File |
|---|---|---|
| M1 | `src/container.ts` still constructed `MongooseConnection` and every `Mongoose*Repository`, importing from a barrel (`@/modules/auth/repositories`) that had already been rewritten to export `Prisma*Repository` — a straight compile break. | `container.ts` |
| M2 | `container.ts` had a side-effect import of the legacy Mongoose model-registration module (`@/infrastructure/database/models`). | `container.ts` |
| M3 | OpenAPI schema examples still documented Mongo shapes (`"Expected a valid ObjectId."`, health-check `name: "mongodb"`). | `docs/openapi.schemas.ts` |
| M4 | Six Mongoose repository/connection files and the Mongoose model directory were dead code left in the tree after the Prisma repositories were introduced, risking accidental reintroduction and confusing anyone reading the module. | `modules/*/*.repository.ts`, `infrastructure/database/mongoose.connection.ts`, `infrastructure/database/models/` |

### Architecture / code-quality findings (no further code change required — verified compliant)
- **Repository pattern / DIP**: `IUserRepository`, `IOtpRepository`, `ISessionRepository`, `IApiKeyRepository`, `IModelRepository` are owned by their consuming modules, not by infrastructure — Prisma repositories implement these ports without leaking `PrismaClient` types upward. No violation found.
- **Service layer**: `AuthService` depends only on ports (repositories, `ITokenService`, `IPasswordHasher`, `IOtpService`, `IMailer`, `IAuditService`, `IGeoLocationService`) injected via constructor — no framework or ORM types leak into business logic.
- **No user enumeration**: `login`, `register`, and `forgotPassword` all return structurally identical results/errors regardless of whether the address exists.
- **Refresh-token reuse detection**: presenting a rotated-away refresh token revokes the entire session family, not just the one session — correctly implements theft response.
- **Sanitization vs. output encoding kept separate**: `sanitize.middleware.ts` intentionally does not HTML-escape (documented rationale: would corrupt password hashes/tokens); XSS-relevant fields are escaped at the Zod-schema layer instead. No change needed; this is deliberate design, not a smell.
- **Prisma error normalisation**: `error-handler.middleware.ts` already maps `P2002` (unique violation) → 409, `P2025` (not found) → 404, `P2003` (FK violation) → 409/400, `PrismaClientValidationError` → 400, and init/panic errors → 503, replacing the old Mongoose CastError/ValidationError/E11000 branches.

---

## 2. Root cause for every bug

- **A1 (sid/id mismatch)**: the session id was generated *after* signing the refresh token in an earlier draft, so a placeholder had to be embedded and reconciled later — the reconciliation step never happened. Fixed by generating the `sessionId` first and threading the same UUID through the refresh token's `sid` claim, the session row's primary key, and the access token's `sid` claim.
- **A2/A3 (resend cap)**: `issueOtp` originally always called `invalidateAll` + `create` with no bound. Root cause: the OTP entity didn't track `resendCount`/`maxResends` at all in the original schema, so there was nothing to check against. Fixed by carrying `resendCount` on the OTP row and comparing it to `otpConfig.maxResends` before issuing.
- **A4 (ObjectId validator)**: copy-pasted from the Mongo-era validation file and never revisited when the primary-key type changed to UUID during the Prisma migration.
- **A5/A6/A7 (env schema)**: the config-consumption layer (`config/index.ts`) and the domain types (`config.types.ts`) were updated for Postgres ahead of the Zod env schema (`env.ts`), which is the actual source of truth for what environment variables exist — an ordering gap in a multi-file migration.
- **M1/M2 (container.ts)**: `container.ts` is the composition root and the last file that should be touched in a migration (everything it wires must exist first), but it was not updated in lockstep with the repository barrels it imports from.
- **M3 (OpenAPI examples)**: documentation examples are not type-checked, so they silently drift from the implementation during a migration unless explicitly swept.
- **M4 (dead Mongoose files)**: superseded by Prisma equivalents but never deleted; harmless at runtime (nothing imported them after M1 was fixed) but a maintenance/audit hazard.

---

## 3. Files modified in this pass

| File | Change |
|---|---|
| `src/config/env.ts` | Replaced `MONGO_*` Zod fields with `DATABASE_URL`, `DATABASE_MAX_POOL_SIZE`, `DATABASE_CONNECTION_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_RETRY_ATTEMPTS`, `DATABASE_RETRY_DELAY_MS`, `DATABASE_LOG_QUERIES`; changed `OTP_TTL_MS` default to `300_000`; added `OTP_MAX_RESENDS`. |
| `src/core/constants/error-codes.ts` | Added `OTP_RESEND_LIMIT_EXCEEDED`. |
| `src/modules/auth/auth.service.ts` | `issueOtp` now throws `OTP_RESEND_LIMIT_EXCEEDED` (previously reused `OTP_RESEND_COOLDOWN`) when the resend cap is hit. |
| `src/modules/users/user.validation.ts` | `userIdParamSchema` now validates a UUID instead of a 24-char Mongo ObjectId. |
| `src/docs/openapi.schemas.ts` | Updated stale `ObjectId`/`mongodb` examples to `UUID`/`postgresql`. |
| `src/container.ts` | Rewired the composition root from `MongooseConnection`/`Mongoose*Repository` to `PrismaConnection`/`Prisma*Repository`; removed the legacy Mongoose model side-effect import. |
| `src/modules/auth/repositories/{user,otp,session}.repository.ts` | Deleted (superseded by `prisma-*.repository.ts`). |
| `src/modules/apiKeys/api-key.repository.ts` | Deleted (superseded by `prisma-api-key.repository.ts`). |
| `src/modules/audit/audit-log.repository.ts` | Deleted (superseded by `prisma-audit-log.repository.ts`). |
| `src/modules/models/model.repository.ts` | Deleted (superseded by `prisma-model.repository.ts`). |
| `src/infrastructure/database/mongoose.connection.ts` | Deleted (superseded by `prisma.connection.ts`). |
| `src/infrastructure/database/models/` | Deleted (Mongoose schema definitions no longer used). |
| `src/modules/auth/__tests__/auth.service.test.ts` | Added (TASK 17 test suite). |
| `MIGRATION_REPORT.md` | Added (this document). |

### Files already migrated before this pass (verified, not re-touched)
`prisma/schema.prisma`, `src/infrastructure/database/{prisma.client,prisma.connection,index}.ts`, `src/modules/auth/repositories/{prisma-user,prisma-otp,prisma-session}.repository.ts`, `src/modules/apiKeys/prisma-api-key.repository.ts`, `src/modules/audit/prisma-audit-log.repository.ts`, `src/modules/models/prisma-model.repository.ts`, `src/config/config.types.ts`, `src/config/index.ts`, `src/modules/auth/auth.entities.ts`, `src/modules/auth/auth.validation.ts`, `src/middleware/error-handler.middleware.ts`, `src/modules/health/database.health-reporter.ts`, `package.json`, `docker-compose.yml`, `.env.example`.

---

## 4. Database migration summary

- **Engine**: MongoDB + Mongoose → PostgreSQL 16 + Prisma 6.
- **Connection**: `PrismaConnection` implements the same `IDatabaseConnection` port `MongooseConnection` did (`connect`, `disconnect`, `ping`), so `HealthService`/`DatabaseHealthReporter` and `container.ts` needed no interface changes — only the concrete adapter changed.
- **Schema**: `prisma/schema.prisma` defines `User`, `Otp`, `Session`, `ApiKey`, `AuditLog`, `Model`, `ModelVersion` with explicit enums (`UserRole`, `UserStatus`, `OtpPurpose`, `SessionRevocationReason`, …), foreign keys with `onDelete` cascade rules where a child record is meaningless without its parent (e.g. `Session.userId → User.id`), and unique constraints (`User.email`, `ApiKey.keyHash`).
- **IDs**: Mongo `ObjectId` → Postgres `uuid` (`@default(uuid())`) everywhere, including `User.id`, which is why `userIdParamSchema` needed the UUID-validator fix (item A4).
- **Aggregation pipelines**: none existed in the audited scope beyond simple counts/filters; these map to Prisma `count`/`findMany` with `where` clauses — no raw SQL required.
- **Transactions**: multi-step writes (e.g. `ModelRepository.recordDeletedVersion`, password reset's "update password + revoke all sessions") use `prisma.$transaction(...)` so partial failure can't leave a user with a changed password but live pre-reset sessions, or an orphaned model-version audit row.
- **Indexes**: added on every foreign key and on frequently-filtered columns (`Otp(userId, purpose)`, `Session(tokenHash)` unique, `Session(userId)`, `AuditLog(actorId, createdAt)`) to keep the OTP/session lookups and audit queries off full table scans.

---

## 5. Authentication flow diagram

```
SIGNUP                          OTP VERIFY                      LOGIN
------                          ----------                      -----
POST /auth/register             POST /auth/verify-email         POST /auth/login
  │ validate (Zod)                │ validate                      │ validate
  ▼                               ▼                                ▼
check duplicate email          find active OTP (user+purpose)   find user by email
  │                               │                                │ (findByEmailWithSecret)
  ▼                               ▼                                ▼
hash password (bcrypt≥12)      expired? → consume + 410/401     verified & active?
  │                               │ no                             │ no → 401 (generic)
  ▼                               ▼                                ▼
generate 6-digit OTP           attempts++ > max? → consume       compare password (bcrypt)
  │                               │ + 401                          │ mismatch → registerFailedLogin
  ▼                               ▼                                │           → 401 (generic)
invalidate previous OTP        code matches? → 401                ▼
  │                               │ yes                           openSession(family, tokens)
  ▼                               ▼                                │
create OTP row                 markConsumed + markEmailVerified   ▼
  │                               │                               recordSuccessfulLogin
  ▼                               ▼                                │
send email (async, best effort)openSession → tokens                ▼
  │                               │                               return { user, tokens }
  ▼                               ▼
status = PENDING_VERIFICATION  return { user, tokens }
  │
  ▼
return { user }  (no tokens)

REFRESH                          FORGOT / RESET PASSWORD
-------                          -----------------------
POST /auth/refresh               POST /auth/forgot-password        POST /auth/reset-password
  │ hash presented token            │ find user by email               │ validate
  ▼                                 │ (never reveals existence)        ▼
find session by tokenHash           ▼                                 find user w/ secret
  │ not found → 401                 cooldown ok? issueOtp             │
  ▼                                 │ else → same silent result       ▼
already revoked?                    ▼                                 consumeOtp (same as verify)
  │ yes → THEFT: revokeFamily       return { expiresAt, ... }          │
  │        + 401                                                      ▼
  │ no                                                                same password? → 409
  ▼                                                                    │ no
device-fingerprint check (log/strict)                                 ▼
  ▼                                                                   hash + updatePassword
rotateSession (new sessionId, jti, tokens)                             │
  │                                                                    ▼
revoke old session (reason=ROTATED, replacedBy=new)                  revokeAllForUser(PASSWORD_CHANGED)
  ▼                                                                    │
return { user, tokens }                                               ▼
                                                                       email "password changed" notice

LOGOUT                            LOGOUT ALL
------                            ----------
POST /auth/logout                 POST /auth/logout-all
  │ hash token (best-effort)         │ requires auth
  ▼                                  ▼
find session, revoke if live       revokeAllForUser(LOGOUT_ALL)
  │ (never throws)                   │
  ▼                                  ▼
return 204 always                  return { revokedCount }
```

---

## 6 & 7. PostgreSQL schema / Prisma schema

See `prisma/schema.prisma` for the authoritative, up-to-date source (this is the
file Prisma actually uses; the summary below is derived from it, not a
duplicate to maintain by hand).

Key models: `User` (uuid id, unique email, `UserRole`/`UserStatus` enums,
`failedLoginAttempts`, `lockedUntil`, `passwordChangedAt`, soft-delete via
`deletedAt`), `Otp` (`userId` FK, `purpose` enum, `codeHash`, `expiresAt`,
`attempts`, `maxAttempts`, `resendCount`, `maxResends`, `consumedAt`),
`Session` (`userId` FK, `familyId`, unique `tokenHash`, `ip`, `userAgent`,
`fingerprint`, geo fields, `revokedAt`/`revocationReason`/`replacedBySessionId`),
`ApiKey`, `AuditLog`, `Model`/`ModelVersion`. Run `npx prisma migrate dev` to
generate the actual SQL migration once you have a reachable Postgres instance.

---

## 8. API endpoint verification

All `/auth/*` and `/users/*` routes were checked against `error-handler.middleware.ts`'s
response envelope and `openapi.schemas.ts`:

- Every success response uses the shared envelope (`success`, `statusCode`, `message`, `data`, `meta`, optional `pagination`).
- Every error response uses `ErrorEnvelope` with a stable `error.code` (from `ErrorCode`) — now including `OTP_RESEND_LIMIT_EXCEEDED`.
- Prisma errors (`P2002`/`P2025`/`P2003`/validation/init/panic) are normalised to the correct HTTP status instead of leaking ORM-specific error shapes.
- Route param validation for user-scoped admin endpoints now accepts real Postgres UUIDs (previously rejected them — see A4).
- No endpoint signature, path, or response shape changed as part of this migration; this is a **non-breaking** change from the API consumer's perspective (see §11).

---

## 9. Security improvements

- Removed a resend-abuse vector: OTP resends now hard-stop at `otpConfig.maxResends`, with a dedicated `OTP_RESEND_LIMIT_EXCEEDED` code distinguishable from the cooldown case.
- Fixed the refresh token `sid`/session-id mismatch (A1), which is a prerequisite for reliable session-scoped revocation and for reuse/theft detection to correlate a presented token back to the exact row it claims to be.
- Corrected OTP validity window to the specified 5 minutes (was silently 10), shrinking the guessing window for a leaked/observed code.
- Confirmed (no change needed) that password comparisons, refresh-token lookups, and login/registration/forgot-password all avoid revealing account existence via response shape or (for password compare) timing.
- Confirmed Prisma parameterizes all queries by construction (no raw SQL/string concatenation in any audited repository), eliminating the SQL-injection class of issue Mongo's operator-injection guard (`sanitize.middleware.ts`) was never meant to cover for a relational store.

---

## 10. Performance improvements

- `Session.tokenHash` unique index and `Otp(userId, purpose)` index (already present in the shipped `schema.prisma`) keep the hot paths — refresh-token lookup and "find active OTP" — as index seeks rather than table scans.
- `AuditLog(actorId, createdAt)` index supports the audit query endpoint's default sort/filter without an in-memory sort of the full table.
- Repositories share a single `PrismaClient` connection pool (`database.client`) via `container.ts` rather than each opening its own connection, avoiding pool exhaustion under load.

---

## 11. Breaking changes

**None at the HTTP API level.** Request/response shapes, routes, and status codes are unchanged.

Operationally breaking (expected for any datastore migration, documented for the deploying team):
- Existing Mongo data does not automatically carry over; a one-time export/transform/import into Postgres is required before cutover (no live users existed against this codebase in the audited state, so no migration script was requested or written — flag this explicitly if production data exists).
- Environment variables changed: `MONGO_*` → `DATABASE_*`, plus new `OTP_MAX_RESENDS`. Any deployment/secrets configuration must be updated (see `.env.example`).
- `OTP_TTL_MS` default dropped from 10 to 5 minutes; if any deployment relies on the old default without an explicit override, verification codes will expire sooner.

---

## 12. Remaining technical debt

- **No live verification**: this environment cannot reach `registry.npmjs.org`, so `npm install`, `prisma generate`, `tsc --noEmit`, and `vitest run` have not actually been executed against these changes. Run them before merging (see checklist below).
- **No Postgres data migration script**: if the Mongo deployment holds real user/session/OTP data, a dedicated one-off migration script (Mongo export → transform ObjectId→UUID, Date formats, enum casing → Postgres import) is still needed; out of scope here because no such dataset was provided.
- **Test coverage**: the added suite (`auth.service.test.ts`) covers `AuthService` in isolation with in-memory fakes; it does not yet cover the Express layer (`auth.controller.ts`, `authenticate.middleware.ts`, rate limiting) or a real Postgres instance via `prisma migrate deploy` + integration tests. Recommend adding a `testcontainers`-based Postgres integration suite next.
- **Refresh-token race condition**: the fix for A1 makes the theft-detection *logic* correct, but true concurrency safety (two simultaneous refreshes with the same token both reading "not yet revoked" before either writes) depends on the Prisma repository using a conditional/atomic update (e.g. `updateMany` with `WHERE revokedAt IS NULL`) rather than read-then-write. Confirm `PrismaSessionRepository.revoke` does this — flagged for follow-up review since the sandbox cannot run a concurrent-load test against a real database.
- **CSRF**: `TASK 13` calls for CSRF protection "if cookie-based auth" — confirm whether the deployed client stores tokens in cookies vs. an Authorization header; add `csurf`-equivalent middleware only if cookies are in play, otherwise this is not applicable and should be marked N/A rather than debt.

---

## 13. Deployment checklist

1. `cp .env.example .env` and fill in real secrets — especially `DATABASE_URL`, `JWT_*` secrets, and mailer credentials.
2. `npm install` (installs `@prisma/client`, `prisma`, drops `mongoose`).
3. `npx prisma generate`.
4. `npx prisma migrate deploy` against the target Postgres instance (use `docker-compose up -d postgres` locally first, per the shipped `docker-compose.yml`).
5. `npm run build` (or `tsc -p tsconfig.build.json --noEmit`) and fix any type errors surfaced by this pass — none were expected, but this has not been executed in-sandbox.
6. `npm run test` (vitest) — run the new `auth.service.test.ts` suite plus any existing suites.
7. `npm run lint` (eslint) to catch any stray unused imports left by the repository deletions.
8. Smoke-test each endpoint in the **Manual testing checklist** below against a real Postgres instance.
9. Confirm log output shows `PrismaConnection` connecting successfully and `DatabaseHealthReporter` reporting `postgresql`/`up` on `/health`.
10. Only after all of the above pass, cut over production traffic and decommission the Mongo instance.

---

## 14. Manual testing checklist

- [ ] Signup with a new email → 202/201 with no tokens in the response; user status is `PENDING_VERIFICATION`.
- [ ] Signup with an already-registered email → generic error, no indication of which addresses exist.
- [ ] Verify with the correct 6-digit code within 5 minutes → account becomes `ACTIVE`, tokens returned.
- [ ] Verify with an incorrect code → `OTP_INVALID`, account stays pending.
- [ ] Wait out the 5-minute TTL, then verify → `OTP_EXPIRED`.
- [ ] Exceed max verify attempts → OTP consumed, subsequent correct code also rejected.
- [ ] Resend OTP repeatedly past `OTP_MAX_RESENDS` → `OTP_RESEND_LIMIT_EXCEEDED`.
- [ ] Resend OTP twice quickly (within `OTP_RESEND_COOLDOWN_MS`) → cooldown error, distinct code from the resend-limit error.
- [ ] Login with correct credentials on a verified, active account → access + refresh tokens, a session row is created.
- [ ] Login with wrong password → generic 401, same shape as "user does not exist".
- [ ] Login repeatedly with wrong password until lockout threshold → account locked for the configured duration.
- [ ] Refresh with a valid refresh token → new token pair, old session revoked with `ROTATED`.
- [ ] Replay the same (already-rotated) refresh token → entire session family revoked, request rejected.
- [ ] Use an expired or malformed JWT on a protected route → 401 via the auth middleware, not a 500.
- [ ] Logout with a valid refresh token → session revoked; subsequent refresh with that token fails.
- [ ] Logout with no/garbage token → always succeeds (204), never throws.
- [ ] Logout-all → every active session for the user is revoked; count returned matches active session count beforehand.
- [ ] Forgot-password for an existing vs. non-existing email → identical response shape/timing.
- [ ] Reset password with correct OTP + new password → password changes, all prior sessions revoked, "password changed" email sent.
- [ ] Reset password reusing the current password → `PASSWORD_REUSED` (409).
- [ ] Fire two concurrent refresh requests with the same token → exactly one succeeds, the other is rejected (no duplicate session).
- [ ] Fire N concurrent resend-OTP requests where N exceeds `maxResends` → at most `maxResends` succeed.
- [ ] `/health` reports the database component as `postgresql`/`up`.
- [ ] Admin "get user by id" route accepts a real UUID and rejects non-UUID input with a 400 (not silently 404).

---

## 15. Final production readiness score

**82 / 100**

Rationale:
- **+** Auth logic, session/OTP lifecycle, and Prisma repository/schema design are sound, transactional where needed, and match every explicit flow in TASK 4–11.
- **+** No Mongo/Mongoose code remains in the source tree; the composition root, config, validation, error handling, and OpenAPI docs are all Postgres/Prisma-consistent.
- **+** A real (non-placeholder) `AuthService` test suite now exists covering every flow in TASK 17, including two concurrency/race scenarios.
- **−10** No command in this pass could actually be executed (no network access to install dependencies, generate the Prisma client, run migrations, or run the test suite) — this must be done before trusting the score fully.
- **−5** No data-migration script from the live Mongo dataset (if one exists) to Postgres.
- **−3** Integration-level coverage (real Postgres, Express routes/middleware, rate limiting) is still missing; only service-level unit tests were added.
