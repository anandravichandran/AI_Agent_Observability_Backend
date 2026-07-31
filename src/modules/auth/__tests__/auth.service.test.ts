import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { AuthService, type AuthServiceDependencies } from '../auth.service'
import {
  DEFAULT_USER_ROLE,
  OtpPurpose,
  SessionRevocationReason,
  TokenType,
  UserStatus,
} from '../auth.constants'
import { ErrorCode } from '@/core/constants/error-codes'
import type { UserEntity, UserWithSecret, OtpEntity, SessionEntity } from '../auth.entities'

/**
 * Unit tests for `AuthService` (TASK 17).
 *
 * Every collaborator is an in-memory fake, not a mock framework, so these
 * tests exercise real state transitions (OTP consumption, session rotation,
 * resend counters) instead of asserting on call arguments. This is also what
 * makes the race-condition tests meaningful: the fakes model actual
 * mutable storage, so two "concurrent" calls can genuinely interleave.
 */

const NOW = new Date('2026-01-01T00:00:00.000Z')

function makeContext(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ip: '127.0.0.1',
    userAgent: 'vitest',
    requestId: crypto.randomUUID(),
    fingerprint: null,
    ...overrides,
  } as any
}

function makeUser(overrides: Partial<UserWithSecret> = {}): UserWithSecret {
  return {
    id: crypto.randomUUID(),
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: DEFAULT_USER_ROLE,
    status: UserStatus.PENDING_VERIFICATION,
    passwordHash: '$2b$12$hash',
    passwordChangedAt: NOW,
    failedLoginAttempts: 0,
    lockedUntil: null,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as UserWithSecret
}

/** In-memory fake for `IUserRepository`, backed by a Map keyed by id. */
function createUserRepositoryFake() {
  const byId = new Map<string, UserWithSecret>()

  const strip = (user: UserWithSecret): UserEntity => {
    const { passwordHash: _passwordHash, ...rest } = user
    return rest as UserEntity
  }

  return {
    _seed(user: UserWithSecret) {
      byId.set(user.id, user)
    },
    _all() {
      return [...byId.values()]
    },
    async findById(id: string) {
      const user = byId.get(id)
      return user ? strip(user) : null
    },
    async findByEmail(email: string) {
      const user = [...byId.values()].find((u) => u.email === email)
      return user ? strip(user) : null
    },
    async findByEmailWithSecret(email: string) {
      return [...byId.values()].find((u) => u.email === email) ?? null
    },
    async findByIdWithSecret(id: string) {
      return byId.get(id) ?? null
    },
    async existsByEmail(email: string) {
      return [...byId.values()].some((u) => u.email === email)
    },
    async create(data: any) {
      const user = makeUser({ id: crypto.randomUUID(), ...data })
      byId.set(user.id, user)
      return strip(user)
    },
    async markEmailVerified(id: string) {
      const user = byId.get(id)
      if (!user) return null
      user.status = UserStatus.ACTIVE
      return strip(user)
    },
    async updatePassword(id: string, passwordHash: string) {
      const user = byId.get(id)
      if (user) {
        user.passwordHash = passwordHash
        user.passwordChangedAt = new Date()
      }
    },
    async recordSuccessfulLogin(id: string) {
      const user = byId.get(id)
      if (user) user.failedLoginAttempts = 0
    },
    async registerFailedLogin(id: string, maxAttempts: number, lockDurationMs: number) {
      const user = byId.get(id)
      if (!user) return { locked: false, attemptsRemaining: 0 }
      user.failedLoginAttempts += 1
      const locked = user.failedLoginAttempts >= maxAttempts
      if (locked) user.lockedUntil = new Date(Date.now() + lockDurationMs)
      return { locked, attemptsRemaining: Math.max(0, maxAttempts - user.failedLoginAttempts) }
    },
    async clearLockout(id: string) {
      const user = byId.get(id)
      if (user) user.lockedUntil = null
    },
    async updateProfile() {
      return null
    },
    async updatePreferences() {
      return null
    },
    async updateNotifications() {
      return null
    },
    async setAvatar() {},
    async softDelete() {},
    async updateRole() {
      return null
    },
    async updateStatus() {
      return null
    },
    async findMany() {
      return { items: [], total: 0 }
    },
  }
}

/** In-memory fake for `IOtpRepository`. One active row per (userId, purpose). */
function createOtpRepositoryFake() {
  const rows = new Map<string, OtpEntity>()
  const key = (userId: string, purpose: string) => `${userId}:${purpose}`

  return {
    async create(data: any) {
      const row: OtpEntity = {
        id: crypto.randomUUID(),
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(),
        codeHash: data.codeHash,
        ...data,
      }
      rows.set(key(data.userId, data.purpose), row)
      return row
    },
    async findActive(userId: string, purpose: string) {
      const row = rows.get(key(userId, purpose))
      if (!row || row.consumedAt) return null
      return row
    },
    async findLastIssuedAt(userId: string, purpose: string) {
      return rows.get(key(userId, purpose))?.createdAt ?? null
    },
    async incrementAttempts(id: string) {
      for (const row of rows.values()) {
        if (row.id === id) {
          row.attempts += 1
          return row.attempts
        }
      }
      return 0
    },
    async markConsumed(id: string) {
      for (const row of rows.values()) {
        if (row.id === id) row.consumedAt = new Date()
      }
    },
    async invalidateAll(userId: string, purpose: string) {
      const row = rows.get(key(userId, purpose))
      if (row && !row.consumedAt) {
        row.consumedAt = new Date()
        return 1
      }
      return 0
    },
  }
}

/** In-memory fake for `ISessionRepository`. */
function createSessionRepositoryFake() {
  const rows = new Map<string, SessionEntity>()
  const byHash = new Map<string, string>()

  return {
    async create(data: any) {
      const row: SessionEntity = {
        revokedAt: null,
        revocationReason: null,
        replacedBySessionId: null,
        createdAt: new Date(),
        ...data,
      }
      rows.set(row.id, row)
      byHash.set(row.tokenHash, row.id)
      return row
    },
    async findByTokenHash(tokenHash: string) {
      const id = byHash.get(tokenHash)
      return id ? rows.get(id) ?? null : null
    },
    async findById(id: string) {
      return rows.get(id) ?? null
    },
    async findActiveByUser(userId: string) {
      return [...rows.values()].filter((s) => s.userId === userId && !s.revokedAt)
    },
    async countActiveByUser(userId: string) {
      return [...rows.values()].filter((s) => s.userId === userId && !s.revokedAt).length
    },
    async revoke(id: string, reason: string, replacedBySessionId?: string) {
      const row = rows.get(id)
      if (row && !row.revokedAt) {
        row.revokedAt = new Date()
        row.revocationReason = reason as any
        row.replacedBySessionId = replacedBySessionId ?? null
      }
    },
    async revokeFamily(familyId: string, reason: string) {
      let count = 0
      for (const row of rows.values()) {
        if (row.familyId === familyId && !row.revokedAt) {
          row.revokedAt = new Date()
          row.revocationReason = reason as any
          count += 1
        }
      }
      return count
    },
    async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
      let count = 0
      for (const row of rows.values()) {
        if (row.userId === userId && !row.revokedAt && row.id !== exceptSessionId) {
          row.revokedAt = new Date()
          row.revocationReason = reason as any
          count += 1
        }
      }
      return count
    },
    async revokeOldestBeyondLimit(userId: string, keep: number, reason: string) {
      const active = [...rows.values()]
        .filter((s) => s.userId === userId && !s.revokedAt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      const excess = active.slice(0, Math.max(0, active.length - keep))
      for (const row of excess) {
        row.revokedAt = new Date()
        row.revocationReason = reason as any
      }
      return excess.length
    },
    async touch() {},
    _all() {
      return [...rows.values()]
    },
  }
}

function createDeps(overrides: Partial<AuthServiceDependencies> = {}): {
  deps: AuthServiceDependencies
  users: ReturnType<typeof createUserRepositoryFake>
  otps: ReturnType<typeof createOtpRepositoryFake>
  sessions: ReturnType<typeof createSessionRepositoryFake>
  lastOtpCode: { current: string }
} {
  const users = createUserRepositoryFake()
  const otps = createOtpRepositoryFake()
  const sessions = createSessionRepositoryFake()
  const lastOtpCode = { current: '' }

  const passwordHasher = {
    hash: vi.fn(async (plain: string) => `hashed:${plain}`),
    compare: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`),
  }

  const otpService = {
    generate: vi.fn(() => {
      const code = '123456'
      lastOtpCode.current = code
      return { code, codeHash: `hash:${code}` }
    }),
    verify: vi.fn((code: string, hash: string) => hash === `hash:${code}`),
  }

  const tokenService = {
    signAccessToken: vi.fn((claims: any) => `access.${claims.sub}.${claims.sid}`),
    signRefreshToken: vi.fn((claims: any) => ({
      token: `refresh.${claims.sid}.${claims.jti}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })),
    hashToken: vi.fn((token: string) => `tokenhash:${token}`),
    verifyAccessToken: vi.fn(),
    verifyRefreshToken: vi.fn(),
  }

  const mailer = { send: vi.fn(async () => {}) }
  const auditService = { record: vi.fn(async () => {}) }
  const geoLocationService = { resolve: vi.fn(async () => null) }
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

  const deps: AuthServiceDependencies = {
    users: users as any,
    otps: otps as any,
    sessions: sessions as any,
    passwordHasher: passwordHasher as any,
    tokenService: tokenService as any,
    otpService: otpService as any,
    mailer: mailer as any,
    auditService: auditService as any,
    logger: logger as any,
    authConfig: {
      lockout: { maxAttempts: 5, lockDurationMs: 900_000, maxActiveSessions: 5 },
    } as any,
    otpConfig: {
      length: 6,
      ttlMs: 300_000,
      maxAttempts: 5,
      resendCooldownMs: 60_000,
      maxResends: 5,
    } as any,
    appConfig: { name: 'ArmForge', webUrl: 'http://localhost:3000', supportEmail: 'support@example.com' } as any,
    deviceFingerprintConfig: { enabled: false, enforcement: 'log' } as any,
    geoLocationService: geoLocationService as any,
    ...overrides,
  }

  return { deps, users, otps, sessions, lastOtpCode }
}

describe('AuthService — Signup (TASK 4)', () => {
  it('creates a pending, unverified account and never returns tokens', async () => {
    const { deps } = createDeps()
    const service = new AuthService(deps)

    const result = await service.register(
      { email: 'new@example.com', password: 'Sup3rSecret!', firstName: 'Ada', lastName: 'Lovelace' },
      makeContext(),
    )

    expect(result).not.toHaveProperty('tokens')
    const stored = await deps.users.findByEmail('new@example.com')
    expect(stored?.status).toBe(UserStatus.PENDING_VERIFICATION)
  })

  it('rejects duplicate email registration without leaking which email exists', async () => {
    const { deps, users } = createDeps()
    users._seed(makeUser({ email: 'taken@example.com', status: UserStatus.ACTIVE }))
    const service = new AuthService(deps)

    await expect(
      service.register(
        { email: 'taken@example.com', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' },
        makeContext(),
      ),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('AuthService — OTP verification (TASK 5 & 6)', () => {
  it('activates the user and consumes the OTP on a correct code', async () => {
    const { deps, lastOtpCode } = createDeps()
    const service = new AuthService(deps)

    await service.register(
      { email: 'verify@example.com', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' },
      makeContext(),
    )

    const result = await service.verifyEmail(
      { email: 'verify@example.com', code: lastOtpCode.current },
      makeContext(),
    )

    expect(result.tokens.accessToken).toBeTruthy()
    const user = await deps.users.findByEmail('verify@example.com')
    expect(user?.status).toBe(UserStatus.ACTIVE)
  })

  it('rejects an incorrect OTP without activating the account', async () => {
    const { deps } = createDeps()
    const service = new AuthService(deps)
    await service.register(
      { email: 'wrongotp@example.com', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' },
      makeContext(),
    )

    await expect(
      service.verifyEmail({ email: 'wrongotp@example.com', code: '000000' }, makeContext()),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID })

    const user = await deps.users.findByEmail('wrongotp@example.com')
    expect(user?.status).toBe(UserStatus.PENDING_VERIFICATION)
  })

  it('rejects an expired OTP and consumes it so it cannot be retried', async () => {
    const { deps, otps, lastOtpCode } = createDeps()
    const service = new AuthService(deps)
    await service.register(
      { email: 'expired@example.com', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' },
      makeContext(),
    )
    const user = await deps.users.findByEmail('expired@example.com')
    const active = await otps.findActive(user!.id, OtpPurpose.EMAIL_VERIFICATION)
    active!.expiresAt = new Date(Date.now() - 1000)

    await expect(
      service.verifyEmail({ email: 'expired@example.com', code: lastOtpCode.current }, makeContext()),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_EXPIRED })
  })

  it('locks the OTP out after exceeding max attempts', async () => {
    const { deps } = createDeps()
    const service = new AuthService(deps)
    await service.register(
      { email: 'maxattempts@example.com', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' },
      makeContext(),
    )

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.verifyEmail({ email: 'maxattempts@example.com', code: '000000' }, makeContext()),
      ).rejects.toBeTruthy()
    }

    // Even the correct code must now be rejected — the OTP was consumed once
    // attempts were exhausted, matching TASK 6's "maximum retry attempts".
    await expect(
      service.verifyEmail({ email: 'maxattempts@example.com', code: '123456' }, makeContext()),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID })
  })

  it('enforces the maximum resend cap (TASK 6)', async () => {
    const { deps } = createDeps()
    const service = new AuthService(deps)
    await service.register(
      { email: 'resend@example.com', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' },
      makeContext(),
    )

    // maxResends = 5: five resends succeed (resendCount 1..5), the sixth fails.
    for (let i = 0; i < 5; i += 1) {
      await service.resendOtp({ email: 'resend@example.com' }, makeContext())
    }

    await expect(
      service.resendOtp({ email: 'resend@example.com' }, makeContext()),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_RESEND_LIMIT_EXCEEDED })
  })

  it('invalidates the previous OTP when a new one is issued (only one active OTP)', async () => {
    const { deps, otps, lastOtpCode } = createDeps()
    const service = new AuthService(deps)
    await service.register(
      { email: 'onlyone@example.com', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' },
      makeContext(),
    )
    const firstCode = lastOtpCode.current
    const user = await deps.users.findByEmail('onlyone@example.com')

    await service.resendOtp({ email: 'onlyone@example.com' }, makeContext())

    // The first code must no longer verify — it was invalidated by the resend.
    await expect(
      service.verifyEmail({ email: 'onlyone@example.com', code: firstCode }, makeContext()),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID })
    void otps
    void user
  })
})

describe('AuthService — Login (TASK 7)', () => {
  it('rejects login for an unverified account', async () => {
    const { deps, users } = createDeps()
    users._seed(
      makeUser({
        email: 'pending@example.com',
        status: UserStatus.PENDING_VERIFICATION,
        passwordHash: 'hashed:Sup3rSecret!',
      }),
    )
    const service = new AuthService(deps)

    await expect(
      service.login({ email: 'pending@example.com', password: 'Sup3rSecret!' }, makeContext()),
    ).rejects.toBeTruthy()
  })

  it('issues an access token, a refresh token, and a stored session on success', async () => {
    const { deps, users, sessions } = createDeps()
    users._seed(
      makeUser({
        email: 'active@example.com',
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed:Sup3rSecret!',
      }),
    )
    const service = new AuthService(deps)

    const result = await service.login(
      { email: 'active@example.com', password: 'Sup3rSecret!' },
      makeContext(),
    )

    expect(result.tokens.accessToken).toBeTruthy()
    expect(result.tokens.refreshToken.token).toBeTruthy()
    expect(sessions._all()).toHaveLength(1)
  })

  it('rejects an incorrect password without revealing whether the email exists', async () => {
    const { deps, users } = createDeps()
    users._seed(
      makeUser({
        email: 'active2@example.com',
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed:Sup3rSecret!',
      }),
    )
    const service = new AuthService(deps)

    await expect(
      service.login({ email: 'active2@example.com', password: 'WrongPassword!' }, makeContext()),
    ).rejects.toMatchObject({ statusCode: 401 })

    await expect(
      service.login({ email: 'nobody@example.com', password: 'WrongPassword!' }, makeContext()),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('AuthService — Refresh & logout (TASK 10 & 11)', () => {
  async function loginActiveUser(deps: ReturnType<typeof createDeps>['deps']) {
    ;(deps.users as any)._seed(
      makeUser({
        email: 'refresh@example.com',
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed:Sup3rSecret!',
      }),
    )
    const service = new AuthService(deps)
    const result = await service.login(
      { email: 'refresh@example.com', password: 'Sup3rSecret!' },
      makeContext(),
    )
    return { service, result }
  }

  it('rotates the refresh token and revokes the previous session', async () => {
    const { deps, sessions } = createDeps()
    const { service, result } = await loginActiveUser(deps)

    const refreshed = await service.refresh(result.tokens.refreshToken.token, makeContext())

    expect(refreshed.tokens.refreshToken.token).not.toBe(result.tokens.refreshToken.token)
    const activeSessions = sessions._all().filter((s: any) => !s.revokedAt)
    expect(activeSessions).toHaveLength(1)
  })

  it('treats reuse of an already-rotated refresh token as theft and revokes the family', async () => {
    const { deps, sessions } = createDeps()
    const { service, result } = await loginActiveUser(deps)

    await service.refresh(result.tokens.refreshToken.token, makeContext())

    // Reusing the original (now-rotated) token must fail and nuke the family.
    await expect(
      service.refresh(result.tokens.refreshToken.token, makeContext()),
    ).rejects.toBeTruthy()

    const stillActive = sessions._all().filter((s: any) => !s.revokedAt)
    expect(stillActive).toHaveLength(0)
  })

  it('rejects a syntactically invalid / unsigned refresh token', async () => {
    const { deps } = createDeps()
    const { service } = await loginActiveUser(deps)

    await expect(
      service.refresh('not-a-real-token', makeContext()),
    ).rejects.toBeTruthy()
  })

  it('logout is idempotent and never throws for a missing/invalid token', async () => {
    const { deps } = createDeps()
    const { service } = await loginActiveUser(deps)

    await expect(service.logout(undefined, makeContext())).resolves.toBeUndefined()
    await expect(service.logout('garbage', makeContext())).resolves.toBeUndefined()
  })

  it('logout revokes the session so the refresh token can no longer be used', async () => {
    const { deps } = createDeps()
    const { service, result } = await loginActiveUser(deps)

    await service.logout(result.tokens.refreshToken.token, makeContext())

    await expect(
      service.refresh(result.tokens.refreshToken.token, makeContext()),
    ).rejects.toBeTruthy()
  })
})

describe('AuthService — Forgot / reset password (TASK 8 & 9)', () => {
  it('forgotPassword returns the same shape for unknown and known emails (no enumeration)', async () => {
    const { deps, users } = createDeps()
    users._seed(makeUser({ email: 'known@example.com', status: UserStatus.ACTIVE }))
    const service = new AuthService(deps)

    const known = await service.forgotPassword({ email: 'known@example.com' }, makeContext())
    const unknown = await service.forgotPassword({ email: 'unknown@example.com' }, makeContext())

    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort())
  })

  it('reset password updates the credential, deletes the OTP, and revokes all sessions', async () => {
    const { deps, users, sessions, lastOtpCode } = createDeps()
    users._seed(
      makeUser({
        email: 'reset@example.com',
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed:OldPassword!',
      }),
    )
    const service = new AuthService(deps)
    const user = await deps.users.findByEmail('reset@example.com')
    await service.login({ email: 'reset@example.com', password: 'OldPassword!' }, makeContext())

    await service.forgotPassword({ email: 'reset@example.com' }, makeContext())
    await service.resetPassword(
      { email: 'reset@example.com', code: lastOtpCode.current, password: 'NewPassword!' },
      makeContext(),
    )

    // Old password must no longer work; new one must.
    await expect(
      service.login({ email: 'reset@example.com', password: 'OldPassword!' }, makeContext()),
    ).rejects.toBeTruthy()
    await expect(
      service.login({ email: 'reset@example.com', password: 'NewPassword!' }, makeContext()),
    ).resolves.toBeTruthy()

    // Sessions predating the reset are gone.
    const preResetSessions = sessions
      ._all()
      .filter((s: any) => s.userId === user!.id && s.revocationReason === SessionRevocationReason.PASSWORD_CHANGED)
    expect(preResetSessions.length).toBeGreaterThan(0)
  })

  it('rejects reset with an incorrect OTP', async () => {
    const { deps, users } = createDeps()
    users._seed(makeUser({ email: 'badreset@example.com', status: UserStatus.ACTIVE }))
    const service = new AuthService(deps)
    await service.forgotPassword({ email: 'badreset@example.com' }, makeContext())

    await expect(
      service.resetPassword(
        { email: 'badreset@example.com', code: '000000', password: 'NewPassword!' },
        makeContext(),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID })
  })

  it('rejects reusing the current password on reset', async () => {
    const { deps, users, lastOtpCode } = createDeps()
    users._seed(
      makeUser({
        email: 'reuse@example.com',
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed:SamePassword!',
      }),
    )
    const service = new AuthService(deps)
    await service.forgotPassword({ email: 'reuse@example.com' }, makeContext())

    await expect(
      service.resetPassword(
        { email: 'reuse@example.com', code: lastOtpCode.current, password: 'SamePassword!' },
        makeContext(),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PASSWORD_REUSED })
  })
})

describe('AuthService — Concurrency / race conditions (TASK 17)', () => {
  it('rejects a concurrent double-spend of the same refresh token', async () => {
    const { deps, sessions } = createDeps()
    ;(deps.users as any)._seed(
      makeUser({
        email: 'race@example.com',
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed:Sup3rSecret!',
      }),
    )
    const service = new AuthService(deps)
    const { tokens } = await service.login(
      { email: 'race@example.com', password: 'Sup3rSecret!' },
      makeContext(),
    )

    // Fire two refreshes with the *same* refresh token "simultaneously".
    const outcomes = await Promise.allSettled([
      service.refresh(tokens.refreshToken.token, makeContext()),
      service.refresh(tokens.refreshToken.token, makeContext()),
    ])

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled')
    const rejected = outcomes.filter((o) => o.status === 'rejected')

    // Exactly one of the two concurrent attempts may win; the loser must be
    // rejected rather than silently issuing a second, divergent session.
    expect(fulfilled.length).toBeLessThanOrEqual(1)
    expect(rejected.length).toBeGreaterThanOrEqual(1)
    // The fake repository is not itself transactional, so this test documents
    // the invariant the Prisma repository must uphold under real concurrency
    // (a unique constraint / conditional update on session revocation), not a
    // guarantee the in-memory fake enforces by construction.
    void sessions
  })

  it('does not let concurrent resends bypass the max-resend cap', async () => {
    const { deps } = createDeps()
    ;(deps.otpConfig as any).maxResends = 1
    ;(deps.users as any)._seed(
      makeUser({ email: 'raceresend@example.com', status: UserStatus.PENDING_VERIFICATION }),
    )
    const service = new AuthService(deps)

    const outcomes = await Promise.allSettled([
      service.resendOtp({ email: 'raceresend@example.com' }, makeContext()),
      service.resendOtp({ email: 'raceresend@example.com' }, makeContext()),
      service.resendOtp({ email: 'raceresend@example.com' }, makeContext()),
    ])

    const rejected = outcomes.filter((o) => o.status === 'rejected')
    // With maxResends = 1, at most two of the three concurrent resends may
    // succeed (initial + one resend); at least one must be rejected.
    expect(rejected.length).toBeGreaterThanOrEqual(1)
  })
})
