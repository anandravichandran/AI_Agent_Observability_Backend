import crypto from 'node:crypto'

export interface DeviceFingerprintInput {
  readonly userAgent: string
  readonly acceptLanguage?: string
  readonly ip: string
  /** Optional opaque client-generated hint (e.g. a canvas/font hash from a JS SDK), folded in when present. */
  readonly clientHint?: string
}

/**
 * Coarsens an IPv4 address to its /24 and an IPv6 address to its first four
 * hextets (a /64-ish granularity), so the fingerprint tracks "this device on
 * roughly this network" rather than the exact address.
 *
 * Full-precision IPs are deliberately excluded: mobile carriers and CGNAT
 * commonly rotate a client's visible address between requests, and many
 * residential ISPs reassign addresses within the same /24 frequently enough
 * that keying on the exact IP would produce false-positive mismatches for
 * legitimate users on every other refresh.
 */
const coarsenIp = (ip: string): string => {
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 4).join(':')
  }

  const octets = ip.split('.')
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`
  }

  return ip
}

/**
 * Computes a stable, coarse fingerprint for a request's originating device.
 *
 * This is a heuristic signal for `AuthService.refresh`'s drift detection, not
 * an identity guarantee — see `device-fingerprint.ts` callers for how
 * mismatches are handled (`log` vs `strict` enforcement).
 */
export const computeDeviceFingerprint = (input: DeviceFingerprintInput): string => {
  const material = [
    input.clientHint ?? '',
    input.userAgent,
    input.acceptLanguage ?? '',
    coarsenIp(input.ip),
  ].join('|')

  return crypto.createHash('sha256').update(material).digest('hex')
}
