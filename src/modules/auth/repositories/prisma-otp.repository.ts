import type { PrismaClient } from '@/infrastructure/database/prisma.client'
import type { OtpPurposeValue } from '../auth.constants'
import type { CreateOtpData, OtpEntity } from '../auth.entities'
import type { IOtpRepository } from './otp.repository.interface'

type OtpRow = {
  id: string
  userId: string
  email: string
  purpose: string
  codeHash: string
  expiresAt: Date
  attempts: number
  maxAttempts: number
  resendCount: number
  maxResends: number
  consumedAt: Date | null
  createdAt: Date
}

/** Prisma adapter for {@link IOtpRepository}. */
export class PrismaOtpRepository implements IOtpRepository {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  public async create(data: CreateOtpData): Promise<OtpEntity> {
    const row = await this.prisma.otp.create({
      data: {
        userId: data.userId,
        email: data.email.trim().toLowerCase(),
        purpose: data.purpose,
        codeHash: data.codeHash,
        expiresAt: data.expiresAt,
        attempts: 0,
        maxAttempts: data.maxAttempts,
        resendCount: data.resendCount,
        maxResends: data.maxResends,
        consumedAt: null,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    })

    return this.toEntity(row)
  }

  public async findActive(userId: string, purpose: OtpPurposeValue): Promise<OtpEntity | null> {
    const row = await this.prisma.otp.findFirst({
      where: {
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    return row ? this.toEntity(row) : null
  }

  public async findLastIssuedAt(userId: string, purpose: OtpPurposeValue): Promise<Date | null> {
    const row = await this.prisma.otp.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    return row?.createdAt ?? null
  }

  public async incrementAttempts(id: string): Promise<number> {
    const row = await this.prisma.otp.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })

    return row.attempts
  }

  public async markConsumed(id: string): Promise<void> {
    await this.prisma.otp.updateMany({ where: { id }, data: { consumedAt: new Date() } })
  }

  public async invalidateAll(userId: string, purpose: OtpPurposeValue): Promise<number> {
    const result = await this.prisma.otp.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    })

    return result.count
  }

  private toEntity(row: OtpRow): OtpEntity {
    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      purpose: row.purpose as OtpPurposeValue,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      resendCount: row.resendCount,
      maxResends: row.maxResends,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    }
  }
}
