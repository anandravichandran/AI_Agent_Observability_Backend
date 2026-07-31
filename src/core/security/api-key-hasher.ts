import crypto from 'node:crypto'
import type { ApiKeyConfig } from '@/config/config.types'
import { API_KEY_TOKEN_PREFIX } from '@/modules/apiKeys/api-key.constants'
import type { GeneratedApiKey, IApiKeyHasher } from './api-key-hasher.interface'

/**
 * Generates and verifies API keys.
 *
 * Format: `afk_<prefix>_<secret>`. `prefix` is a short random hex segment
 * used purely for O(1) lookup (an indexed equality match instead of scanning
 * every key and hashing each candidate); `secret` is the actual entropy.
 * Mirrors `jwt-token.service.ts`'s `hashToken`: SHA-256, hex-encoded, and
 * only ever compared in constant time by the caller.
 */
export class ApiKeyHasher implements IApiKeyHasher {
  private readonly config: ApiKeyConfig

  constructor(config: ApiKeyConfig) {
    this.config = config
  }

  public generate(): GeneratedApiKey {
    const prefix = crypto.randomBytes(this.config.prefixLength).toString('hex')
    const secretBytes = crypto.randomBytes(this.config.secretBytes).toString('hex')
    const secret = `${API_KEY_TOKEN_PREFIX}_${prefix}_${secretBytes}`

    return { secret, prefix: `${API_KEY_TOKEN_PREFIX}_${prefix}`, hash: this.hash(secret) }
  }

  public hash(presentedKey: string): string {
    return crypto.createHash('sha256').update(presentedKey).digest('hex')
  }

  public extractPrefix(presentedKey: string): string | null {
    const parts = presentedKey.split('_')
    if (parts.length !== 3 || parts[0] !== API_KEY_TOKEN_PREFIX) return null

    return `${parts[0]}_${parts[1]}`
  }
}
