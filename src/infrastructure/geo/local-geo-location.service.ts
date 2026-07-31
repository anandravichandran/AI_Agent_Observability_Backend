import type { GeoLocation, IGeoLocationService } from './geo-location.interface'

const PRIVATE_IPV4_PATTERNS = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[0-1])\./]

const isPrivateAddress = (ip: string): boolean => {
  if (ip === '::1' || ip === 'localhost') return true
  if (ip.startsWith('::ffff:')) return isPrivateAddress(ip.slice(7))

  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(ip))
}

/**
 * Stand-in geo resolver, following the exact shape of `NoopVirusChecker`:
 * a real adapter (MaxMind GeoLite2, ipapi, Cloudflare's `CF-IPCountry`
 * header, ...) can implement {@link IGeoLocationService} and be swapped in
 * at the `container.ts` composition root with no change to any caller.
 *
 * This implementation only distinguishes "private/loopback" from "public,
 * country unknown" — enough for `SessionEntity.geoIsPrivate` to be accurate
 * in local development and CI, without bundling a geo-IP database or an
 * outbound network dependency into the base image.
 */
export class LocalGeoLocationService implements IGeoLocationService {
  public resolve(ip: string): Promise<GeoLocation | null> {
    const isPrivate = isPrivateAddress(ip)

    const location: GeoLocation = { country: null, region: null, city: null, isPrivate }
    return Promise.resolve(location)
  }
}
