# API Keys module

Self-service, revocable credentials for machine-to-machine access, scoped
narrower than a full user session.

## Design

- **Format**: `afk_<prefix>_<secret>`. The `afk_<prefix>` segment is stored in
  plaintext and is the lookup key (`findByPrefix`); the full presented key is
  hashed with SHA-256 and compared against the stored hash in constant time.
  Only the SHA-256 hash is ever persisted — identical posture to refresh-token
  sessions in the `auth` module.
- **One-time secret**: the raw secret is returned only in the `create`
  response body. It cannot be recovered afterwards; losing it means minting a
  new key.
- **Revocation is soft**: `DELETE /api-keys/:id` sets `status: revoked` and
  `revokedAt`, it never deletes the row. This preserves the row for audit and
  for `findByPrefix` to still resolve (and correctly reject) an old key that
  a compromised system keeps retrying with.
- **Scopes**: coarse-grained strings (`models:read`, `models:write`,
  `users:read`, `audit:read`, `admin:*`). A route declares the single scope it
  requires via `requireApiKeyScope` in `authorize.middleware.ts`.
- **TTL**: keys may optionally expire (`expiresInDays`). The Mongo TTL index
  on `api-key.model.ts` only matches documents with a concrete `expiresAt`
  (via a partial filter expression), so non-expiring keys are not auto-pruned.

## Authentication flow

A request presents the full key via the `X-API-Key` header. See
`middleware/api-key-auth.middleware.ts`: on success it sets `req.apiKeyContext`
(never `req.user`, which stays reserved for browser/JWT-session principals) so
downstream code can distinguish "a human is logged in" from "a service
presented an API key" without ambiguity.

## Technical debt / follow-ups

- No per-key rate limiting yet (falls back to the global limiter).
- No key rotation-with-overlap helper (caller must create a new key and
  delete the old one manually); a `rotate()` that keeps both valid for a
  grace window would be a natural Phase 6 addition.
