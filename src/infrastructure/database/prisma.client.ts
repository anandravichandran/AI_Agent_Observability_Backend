import { PrismaClient, Prisma } from '@prisma/client'

export { Prisma }
export type { PrismaClient }

/**
 * Builds a configured `PrismaClient`.
 *
 * Kept as a factory (rather than a module-level singleton) so tests and
 * tooling can construct independent clients against different URLs without
 * relying on process-wide state.
 */
export const createPrismaClient = (databaseUrl: string, logQueries: boolean): PrismaClient => {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: logQueries
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ]
      : [
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ],
  })
}
