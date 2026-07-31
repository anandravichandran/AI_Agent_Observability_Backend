export interface GeneratedApiKey {
  /** Full secret to hand to the caller exactly once. Never persisted. */
  readonly secret: string
  /** Public lookup segment, safe to store and log. */
  readonly prefix: string
  /** SHA-256 hex digest of `secret`, the only thing persisted. */
  readonly hash: string
}

export interface IApiKeyHasher {
  generate(): GeneratedApiKey
  hash(presentedKey: string): string
  /** Extracts the lookup prefix from a presented key, or `null` if it is not shaped like one of ours. */
  extractPrefix(presentedKey: string): string | null
}
