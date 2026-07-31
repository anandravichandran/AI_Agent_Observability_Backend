import type { PrismaClient } from '@/infrastructure/database/prisma.client'
import { toSkip } from '@/core/http/pagination'
import { UserStatus } from '../auth.constants'
import type {
  CreateUserData,
  LoginFailureState,
  UserEntity,
  UserNotificationsData,
  UserPreferencesData,
  UserWithSecret,
} from '../auth.entities'
import type {
  IUserRepository,
  UpdateProfileData,
  UserListQuery,
  UserListResult,
} from './user.repository.interface'

type UserRow = {
  id: string
  email: string
  passwordHash: string
  firstName: string
  lastName: string
  role: string
  status: string
  isEmailVerified: boolean
  emailVerifiedAt: Date | null
  lastLoginAt: Date | null
  lastLoginIp: string | null
  failedLoginAttempts: number
  lockedUntil: Date | null
  passwordChangedAt: Date | null
  avatarUrl: string | null
  preferencesTheme: string
  notifyProductUpdates: boolean
  notifySecurityAlerts: boolean
  notifyBenchmarkResults: boolean
  notifyWeeklyDigest: boolean
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Prisma adapter for {@link IUserRepository}.
 *
 * All Prisma-shape mapping (row -> domain entity) is confined to this file so
 * no layer above the repository ever imports `@prisma/client` types.
 */
export class PrismaUserRepository implements IUserRepository {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { id } })
    return row ? this.toEntity(row) : null
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { email: this.normalise(email) } })
    return row ? this.toEntity(row) : null
  }

  public async findByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    const row = await this.prisma.user.findUnique({ where: { email: this.normalise(email) } })
    return row ? this.toEntityWithSecret(row) : null
  }

  public async findByIdWithSecret(id: string): Promise<UserWithSecret | null> {
    const row = await this.prisma.user.findUnique({ where: { id } })
    return row ? this.toEntityWithSecret(row) : null
  }

  public async existsByEmail(email: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { email: this.normalise(email) },
      select: { id: true },
    })
    return row !== null
  }

  public async create(data: CreateUserData): Promise<UserEntity> {
    const row = await this.prisma.user.create({
      data: {
        email: this.normalise(data.email),
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        status: data.status,
        isEmailVerified: false,
        failedLoginAttempts: 0,
      },
    })

    return this.toEntity(row)
  }

  public async markEmailVerified(id: string): Promise<UserEntity | null> {
    try {
      const row = await this.prisma.user.update({
        where: { id },
        data: {
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          status: UserStatus.ACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      })
      return this.toEntity(row)
    } catch {
      return null
    }
  }

  public async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
  }

  public async recordSuccessfulLogin(id: string, ip: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
  }

  public async registerFailedLogin(
    id: string,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<LoginFailureState> {
    // A single atomic increment-then-read, exactly like the previous
    // `findByIdAndUpdate($inc)` — so concurrent failed attempts cannot race
    // and under-count the failure tally.
    const row = await this.prisma.user
      .update({
        where: { id },
        data: { failedLoginAttempts: { increment: 1 } },
      })
      .catch(() => null)

    if (!row) {
      return { failedLoginAttempts: 0, lockedUntil: null, isLocked: false }
    }

    const attempts = row.failedLoginAttempts

    if (attempts < maxAttempts) {
      return { failedLoginAttempts: attempts, lockedUntil: null, isLocked: false }
    }

    const lockedUntil = new Date(Date.now() + lockDurationMs)
    await this.prisma.user.update({ where: { id }, data: { lockedUntil } })

    return { failedLoginAttempts: attempts, lockedUntil, isLocked: true }
  }

  public async clearLockout(id: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    })
  }

  public async updateProfile(id: string, data: UpdateProfileData): Promise<UserEntity | null> {
    const update: Record<string, unknown> = {}
    if (data.firstName !== undefined) update['firstName'] = data.firstName
    if (data.lastName !== undefined) update['lastName'] = data.lastName

    if (Object.keys(update).length === 0) {
      return this.findById(id)
    }

    try {
      const row = await this.prisma.user.update({ where: { id }, data: update })
      return this.toEntity(row)
    } catch {
      return null
    }
  }

  public async updatePreferences(
    id: string,
    preferences: UserPreferencesData,
  ): Promise<UserEntity | null> {
    try {
      const row = await this.prisma.user.update({
        where: { id },
        data: { preferencesTheme: preferences.theme },
      })
      return this.toEntity(row)
    } catch {
      return null
    }
  }

  public async updateNotifications(
    id: string,
    notifications: UserNotificationsData,
  ): Promise<UserEntity | null> {
    try {
      const row = await this.prisma.user.update({
        where: { id },
        data: {
          notifyProductUpdates: notifications.productUpdates,
          notifySecurityAlerts: notifications.securityAlerts,
          notifyBenchmarkResults: notifications.benchmarkResults,
          notifyWeeklyDigest: notifications.weeklyDigest,
        },
      })
      return this.toEntity(row)
    } catch {
      return null
    }
  }

  public async setAvatar(id: string, avatarUrl: string | null): Promise<void> {
    await this.prisma.user.updateMany({ where: { id }, data: { avatarUrl } })
  }

  public async softDelete(id: string): Promise<void> {
    const anonymised = `deleted+${id}@deleted.invalid`

    await this.prisma.user.updateMany({
      where: { id },
      data: {
        deletedAt: new Date(),
        email: anonymised,
        avatarUrl: null,
        status: UserStatus.SUSPENDED,
        isEmailVerified: false,
      },
    })
  }

  public async updateRole(id: string, role: UserEntity['role']): Promise<UserEntity | null> {
    try {
      const row = await this.prisma.user.update({ where: { id }, data: { role } })
      return this.toEntity(row)
    } catch {
      return null
    }
  }

  public async updateStatus(
    id: string,
    status: UserEntity['status'],
  ): Promise<UserEntity | null> {
    try {
      const row = await this.prisma.user.update({ where: { id }, data: { status } })
      return this.toEntity(row)
    } catch {
      return null
    }
  }

  public async findMany(query: UserListQuery): Promise<UserListResult> {
    const where: Record<string, unknown> = { deletedAt: null }

    if (query.role) where['role'] = query.role
    if (query.status) where['status'] = query.status
    if (query.search) {
      where['OR'] = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { [query.sort.field]: query.sort.order },
        skip: toSkip({ page: query.page, limit: query.limit }),
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ])

    return { items: items.map((row) => this.toEntity(row)), total }
  }

  private normalise(email: string): string {
    return email.trim().toLowerCase()
  }

  private toEntity(row: UserRow): UserEntity {
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role as UserEntity['role'],
      status: row.status as UserEntity['status'],
      isEmailVerified: row.isEmailVerified,
      emailVerifiedAt: row.emailVerifiedAt,
      lastLoginAt: row.lastLoginAt,
      lastLoginIp: row.lastLoginIp,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedUntil: row.lockedUntil,
      passwordChangedAt: row.passwordChangedAt,
      avatarUrl: row.avatarUrl,
      preferences: { theme: row.preferencesTheme as UserPreferencesData['theme'] },
      notifications: {
        productUpdates: row.notifyProductUpdates,
        securityAlerts: row.notifySecurityAlerts,
        benchmarkResults: row.notifyBenchmarkResults,
        weeklyDigest: row.notifyWeeklyDigest,
      },
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private toEntityWithSecret(row: UserRow): UserWithSecret {
    return { ...this.toEntity(row), passwordHash: row.passwordHash }
  }
}
