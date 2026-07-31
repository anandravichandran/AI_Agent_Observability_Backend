import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { Express, RequestHandler } from 'express'
import { buildConfig } from '@/config'
import type { AppConfig } from '@/config/config.types'
import { createLogger, type WinstonLogger } from '@/core/logger/winston.logger'
import type { HealthReporter } from '@/core/types/common.types'
import { BcryptPasswordHasher } from '@/core/security/bcrypt-password-hasher'
import { JwtTokenService } from '@/core/security/jwt-token.service'
import { OtpService } from '@/core/security/otp.service'
import type { IPasswordHasher } from '@/core/security/password-hasher.interface'
import type { IOtpService } from '@/core/security/otp-service.interface'
import type { ITokenService } from '@/core/security/token-service.interface'
import { MongooseConnection } from '@/infrastructure/database/mongoose.connection'
import type { IDatabaseConnection } from '@/infrastructure/database/database.interface'
import { NodemailerMailer } from '@/infrastructure/mail/nodemailer.mailer'
import type { IMailer } from '@/infrastructure/mail/mailer.interface'
import { LocalAvatarStorage } from '@/infrastructure/storage/local-avatar-storage'
import type { IAvatarStorage } from '@/infrastructure/storage/avatar-storage.interface'
import { LocalModelStorage } from '@/infrastructure/storage/local-model-storage'
import type { IModelStorage } from '@/infrastructure/storage/model-storage.interface'
import { NoopVirusChecker } from '@/infrastructure/virus/noop-virus-checker'
import type { IVirusChecker } from '@/infrastructure/virus/virus-checker.interface'
import '@/infrastructure/database/models'
import { DatabaseHealthReporter } from '@/modules/health/database.health-reporter'
import { HealthController } from '@/modules/health/health.controller'
import { HealthService } from '@/modules/health/health.service'
import type { IHealthService } from '@/modules/health/health.service.interface'
import { AuditService } from '@/modules/audit/audit.service'
import { AuditController } from '@/modules/audit/audit.controller'
import { MongooseAuditLogRepository } from '@/modules/audit/audit-log.repository'
import type { IAuditService } from '@/modules/audit/audit.service.interface'
import { AuthService } from '@/modules/auth/auth.service'
import { AuthController } from '@/modules/auth/auth.controller'
import type { IAuthService } from '@/modules/auth/auth.service.interface'
import { UserRole } from '@/modules/auth/auth.constants'
import {
  MongooseOtpRepository,
  MongooseSessionRepository,
  MongooseUserRepository,
} from '@/modules/auth/repositories'
import type {
  IOtpRepository,
  ISessionRepository,
  IUserRepository,
} from '@/modules/auth/repositories'
import { UserService } from '@/modules/users/user.service'
import { UserController } from '@/modules/users/user.controller'
import type { IUserService } from '@/modules/users/user.service'
import { AdminService } from '@/modules/admin/admin.service'
import { AdminController } from '@/modules/admin/admin.controller'
import type { IAdminService } from '@/modules/admin/admin.service'
import { ModelService } from '@/modules/models/model.service'
import { ModelController } from '@/modules/models/model.controller'
import type { IModelService } from '@/modules/models/model.service'
import { MongooseModelRepository } from '@/modules/models/model.repository'
import type { IModelRepository } from '@/modules/models/model.repository.interface'
import { createAuthenticate } from '@/middleware/authenticate.middleware'
import { createAuthorize } from '@/middleware/authorize.middleware'
import { createAvatarUpload } from '@/middleware/upload.middleware'
import { createModelUpload } from '@/middleware/model-upload.middleware'
import { createApp } from '@/app'

export interface Container {
  readonly config: AppConfig
  readonly logger: WinstonLogger
  readonly database: IDatabaseConnection
  readonly mailer: IMailer
  readonly healthService: IHealthService
  readonly healthController: HealthController
  readonly auditService: IAuditService
  readonly authService: IAuthService
  readonly userService: IUserService
  readonly adminService: IAdminService
  readonly modelService: IModelService
  readonly app: Express
}

export const buildContainer = (config: AppConfig = buildConfig()): Container => {
  const logger = createLogger(config.logger)

  // --- Infrastructure -------------------------------------------------------
  const database: IDatabaseConnection = new MongooseConnection(config.database, logger)
  const mailer: IMailer = new NodemailerMailer(config.mail, logger)
  const avatarStorage: IAvatarStorage = new LocalAvatarStorage(
    config.upload.dir,
    config.upload.publicPath,
    logger,
  )
  const modelStorage: IModelStorage = new LocalModelStorage(config.modelUpload.dir, logger)
  const virusChecker: IVirusChecker = new NoopVirusChecker()

  // Ensure upload directories exist at boot rather than on first request.
  void mkdir(path.resolve(process.cwd(), config.modelUpload.dir), { recursive: true }).catch(() => {})
  void mkdir(path.resolve(process.cwd(), config.modelUpload.tempDir), { recursive: true }).catch(() => {})

  // --- Security primitives --------------------------------------------------
  const passwordHasher: IPasswordHasher = new BcryptPasswordHasher(config.auth.password)
  const tokenService: ITokenService = new JwtTokenService(config.auth.jwt)
  const otpService: IOtpService = new OtpService(config.otp, config.auth.jwt.accessSecret)

  // --- Repositories ---------------------------------------------------------
  const userRepository: IUserRepository = new MongooseUserRepository()
  const otpRepository: IOtpRepository = new MongooseOtpRepository()
  const sessionRepository: ISessionRepository = new MongooseSessionRepository()
  const auditLogRepository = new MongooseAuditLogRepository()
  const modelRepository: IModelRepository = new MongooseModelRepository()

  // --- Services -------------------------------------------------------------
  const auditService: IAuditService = new AuditService({ repository: auditLogRepository, logger })

  const authService: IAuthService = new AuthService({
    users: userRepository,
    otps: otpRepository,
    sessions: sessionRepository,
    passwordHasher,
    tokenService,
    otpService,
    mailer,
    auditService,
    logger,
    authConfig: config.auth,
    otpConfig: config.otp,
    appConfig: config.app,
  })

  const userService: IUserService = new UserService({
    userRepository,
    sessionRepository,
    passwordHasher,
    avatarStorage,
    mailer,
    auditService,
    logger,
    appConfig: config.app,
  })

  const adminService: IAdminService = new AdminService({
    userRepository,
    sessionRepository,
    auditService,
    logger,
  })

  const modelService: IModelService = new ModelService({
    modelRepository,
    modelStorage,
    virusChecker,
    logger,
  })

  // --- Health ---------------------------------------------------------------
  const reporters: HealthReporter[] = [new DatabaseHealthReporter(database)]
  const healthService: IHealthService = new HealthService({ app: config.app, http: config.http, reporters })

  // --- Controllers ----------------------------------------------------------
  const healthController = new HealthController(healthService)
  const authController = new AuthController({ authService, cookieConfig: config.cookie })
  const auditController = new AuditController(auditService)
  const userController = new UserController({ userService, cookieConfig: config.cookie })
  const adminController = new AdminController(adminService)
  const modelController = new ModelController(modelService)

  // --- Guards & upload ------------------------------------------------------
  const authenticate: RequestHandler = createAuthenticate({ tokenService, cookieConfig: config.cookie })
  const authorize = createAuthorize({ auditService })
  const requireAdmin: RequestHandler = authorize.requireRoles(UserRole.ADMIN)
  const avatarUpload: RequestHandler = createAvatarUpload(config.upload.avatarMaxBytes)
  const modelUpload: RequestHandler = createModelUpload(
    config.modelUpload.maxBytes,
    config.modelUpload.tempDir,
  )

  // --- HTTP -----------------------------------------------------------------
  const app = createApp({
    config,
    logger,
    healthController,
    authController,
    auditController,
    userController,
    adminController,
    modelController,
    authenticate,
    requireAdmin,
    avatarUpload,
    modelUpload,
  })

  return {
    config, logger, database, mailer,
    healthService, healthController,
    auditService, authService, userService, adminService, modelService,
    app,
  }
}
