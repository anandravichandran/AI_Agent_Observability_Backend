import type { ComponentHealth, HealthReporter } from '@/core/types/common.types'
import type { IDatabaseConnection } from '@/infrastructure/database/database.interface'

/**
 * Adapts the database port to the generic {@link HealthReporter} contract.
 *
 * This adapter is what allows `HealthService` to remain unaware of the
 * concrete database technology (PostgreSQL/Prisma): it consumes reporters,
 * not connections.
 */
export class DatabaseHealthReporter implements HealthReporter {
  public readonly name = 'postgresql'

  private readonly connection: IDatabaseConnection

  constructor(connection: IDatabaseConnection) {
    this.connection = connection
  }

  public async check(): Promise<ComponentHealth> {
    return this.connection.ping()
  }
}
