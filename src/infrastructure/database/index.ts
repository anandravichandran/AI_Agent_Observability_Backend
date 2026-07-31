/**
 * Database infrastructure barrel.
 *
 * Exposes the storage-agnostic connection port and the Prisma/PostgreSQL
 * adapter that implements it. Nothing above this layer imports `@prisma/client`
 * directly — repositories take a `PrismaClient` instance through their
 * constructor instead.
 */
export * from './database.interface'
export * from './prisma.connection'
export * from './prisma.client'
