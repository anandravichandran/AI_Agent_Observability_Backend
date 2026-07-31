/**
 * Model barrel.
 *
 * Importing this module registers every schema with the Mongoose connection.
 * `container.ts` imports it once at startup so index builds and model
 * resolution happen deterministically at boot rather than on first use.
 */
export * from './models'
