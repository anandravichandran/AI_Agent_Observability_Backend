/** Small time helpers shared by middleware, auth, and health checks. */

/** Monotonic high-resolution clock reading, in milliseconds. */
export const now = (): number => Number(process.hrtime.bigint() / 1_000_000n)

/** Milliseconds elapsed since a `now()` reading, rounded to 3 decimals. */
export const elapsedSince = (start: number): number =>
  Math.round((now() - start) * 1000) / 1000

/** Promise-based delay used by the database retry loop. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Formats a second count as `1d 4h 12m 5s`. */
export const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${secs}s`)

  return parts.join(' ')
}

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
}

/**
 * Converts a `jsonwebtoken` style duration into milliseconds.
 *
 * The same TTL string configures token expiry, cookie `maxAge`, and the
 * document `expiresAt` used by MongoDB's TTL index. Deriving all three from one
 * parser is what keeps a token, its cookie, and its session row from expiring
 * at three different moments.
 *
 * A bare number is interpreted as seconds, matching `jsonwebtoken`.
 */
export const parseDurationMs = (value: string): number => {
  const match = /^(\d+)(ms|s|m|h|d|w|y)?$/.exec(value.trim())

  if (!match?.[1]) {
    throw new Error(`Unsupported duration format: "${value}"`)
  }

  const amount = Number.parseInt(match[1], 10)
  const unit = match[2] ?? 's'

  return amount * (DURATION_UNITS[unit] ?? 1_000)
}

/** A `Date` offset from now by the given number of milliseconds. */
export const dateFromNow = (ms: number): Date => new Date(Date.now() + ms)

/** True when the given date is in the past. */
export const isExpired = (date: Date | undefined | null): boolean =>
  date instanceof Date && date.getTime() <= Date.now()
