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
// Importing the model barrel registers every schema with Mongoose at boot,
// so index builds happen deterministically rather than on first query.
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
import { createAuthenticate } from '@/middleware/authenticate.middleware'
import { createAuthorize } from '@/middleware/authorize.middleware'
import { createAvatarUpload } from '@/middleware/upload.middleware'
import { createApp } from '@/app'

/** Everything the process needs, resolved and wired. */
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
  readonly app: Express
}

/**
 * Composition root.
 *
 * This is the only module permitted to instantiate concrete classes. Every
 * other file receives its collaborators through a constructor or a factory
 * argument and depends solely on interfaces.
 *
 * A hand-rolled container is a deliberate choice over a DI framework: the graph
 * is small, construction order is explicit and readable, there is no decorator
 * metadata or reflection at runtime, and resolution errors surface at compile
 * time rather than on first request.
 *
 * Read top to bottom, this function is also the dependency graph — nothing is
 * hidden behind a decorator or resolved lazily by name.
 */
export const buildContainer = (config: AppConfig = buildConfig()): Container => {
  // --- Cross-cutting -------------------------------------------------------
  const logger = createLogger(config.logger)

  // --- Infrastructure ------------------------------------------------------
  const database: IDatabaseConnection = new MongooseConnection(config.database, logger)
  const mailer: IMailer = new NodemailerMailer(config.mail, logger)
  const avatarStorage: IAvatarStorage = new LocalAvatarStorage(
    config.upload.dir,
    config.upload.publicPath,
    logger,
  )

  // --- Security primitives -------------------------------------------------
  const passwordHasher: IPasswordHasher = new BcryptPasswordHasher(config.auth.password)
  const tokenService: ITokenService = new JwtTokenService(config.auth.jwt)

  /**
   * The OTP pepper is derived from the access secret rather than configured
   * separately — one fewer secret to rotate, and it is already mandatory and
   * length-checked in production.
   */
  const otpService: IOtpService = new OtpService(config.otp, config.auth.jwt.accessSecret)

  // --- Repositories --------------------------------------------------------
  const userRepository: IUserRepository = new MongooseUserRepository()
  const otpRepository: IOtpRepository = new MongooseOtpRepository()
  const sessionRepository: ISessionRepository = new MongooseSessionRepository()
  const auditLogRepository = new MongooseAuditLogRepository()

  // --- Services ------------------------------------------------------------
  const auditService: IAuditService = new AuditService({
    repository: auditLogRepository,
    logger,
  })

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

  // --- Health reporters ----------------------------------------------------
  // Extend this array to add a dependency to the health report; no other file
  // changes (Open/Closed).
  const reporters: HealthReporter[] = [new DatabaseHealthReporter(database)]

  const healthService: IHealthService = new HealthService({
    app: config.app,
    http: config.http,
    reporters,
  })

  // --- Controllers ---------------------------------------------------------
  const healthController = new HealthController(healthService)
  const authController = new AuthController({ authService, cookieConfig: config.cookie })
  const auditController = new AuditController(auditService)
  const userController = new UserController({ userService, cookieConfig: config.cookie })
  const adminController = new AdminController(adminService)

  // --- Guards & upload ------------------------------------------------------
  const authenticate: RequestHandler = createAuthenticate({
    tokenService,
    cookieConfig: config.cookie,
  })

  // The audit service is handed to the authorizer so denied requests are
  // recorded. A privilege-escalation probe is exactly the kind of event the
  // trail exists to capture.
  const authorize = createAuthorize({ auditService })
  const requireAdmin: RequestHandler = authorize.requireRoles(UserRole.ADMIN)

  const avatarUpload: RequestHandler = createAvatarUpload(config.upload.avatarMaxBytes)

  // --- HTTP ----------------------------------------------------------------
  const app = createApp({
    config,
    logger,
    healthController,
    authController,
    auditController,
    userController,
    adminController,
    authenticate,
    requireAdmin,
    avatarUpload,
  })

  return {
    config,
    logger,
    database,
    mailer,
    healthService,
    healthController,
    auditService,
    authService,
    userService,
    adminService,
    app,
  }
}
