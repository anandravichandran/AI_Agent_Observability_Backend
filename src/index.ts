/**
 * Library surface.
 *
 * Re-exports the pieces an integration test or a future worker process would
 * need to assemble the application without going through `server.ts` (which
 * starts listening as a side effect).
 */
export { buildConfig, loadEnv } from '@/config'
export type { AppConfig } from '@/config/config.types'
export { buildContainer, type Container } from '@/container'
export { createApp, type CreateAppDependencies } from '@/app'
export * from '@/core/errors'
export * from '@/core/http'
export * from '@/core/logger'
export * from '@/core/constants'
