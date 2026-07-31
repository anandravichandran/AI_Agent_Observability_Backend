export type {
  IUserRepository,
  UpdateProfileData,
  UserListQuery,
  UserListResult,
} from './user.repository.interface'
export type { IOtpRepository } from './otp.repository.interface'
export type { ISessionRepository } from './session.repository.interface'

export { PrismaUserRepository } from './prisma-user.repository'
export { PrismaOtpRepository } from './prisma-otp.repository'
export { PrismaSessionRepository } from './prisma-session.repository'
