/**
 * Model barrel.
 *
 * Importing this module registers every schema with the Mongoose connection.
 * `container.ts` imports it once at startup so index builds and model
 * resolution happen deterministically at boot rather than on first use.
 */
export { UserModel, type UserAttributes, type UserDocument } from './user.model'
export { OtpModel, type OtpAttributes, type OtpDocument } from './otp.model'
export { SessionModel, type SessionAttributes, type SessionDocument } from './session.model'
export { AuditLogModel, type AuditLogAttributes, type AuditLogDocument } from './audit-log.model'
export { AiModelModel, type ModelAttributes, type ModelDocument } from './model.model'
export {
  ModelVersionModel,
  type ModelVersionAttributes,
  type ModelVersionDocument,
} from './model-version.model'
export { ApiKeyModel, type ApiKeyAttributes, type ApiKeyDocument } from './api-key.model'
