/**
 * Minimal user-agent parsing.
 *
 * Used to render "this device, on this browser" in the session and activity
 * views. Deliberately not a full UA library: we only need a friendly label for
 * a security UI, not browser-capability detection, and pulling in a 300KB
 * regex database for three fields is a poor trade. Anything unrecognised
 * degrades to 'Unknown' rather than throwing.
 */

export interface DeviceInfo {
  readonly browser: string
  readonly os: string
  readonly device: string
}

const BROWSERS: Array<[RegExp, string]> = [
  [/edg(?:e|ios|a)?\//i, 'Edge'],
  [/chrome\//i, 'Chrome'],
  [/safari\//i, 'Safari'],
  [/firefox\//i, 'Firefox'],
  [/opr\//i, 'Opera'],
  [/msie|trident\//i, 'Internet Explorer'],
]

const SYSTEMS: Array<[RegExp, string]> = [
  [/windows nt/i, 'Windows'],
  [/mac os x/i, 'macOS'],
  [/android/i, 'Android'],
  [/iphone|ipad|ipod/i, 'iOS'],
  [/linux/i, 'Linux'],
  [/cros/i, 'ChromeOS'],
]

/** Classifies the form factor from the raw agent string. */
const deviceKind = (ua: string): string => {
  if (/mobile|iphone|ipod|android.*mobile/i.test(ua)) return 'Mobile'
  if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) return 'Tablet'
  if (/bot|crawler|spider|curl|wget|postman|insomnia/i.test(ua)) return 'Script'
  return 'Desktop'
}

const firstMatch = (ua: string, rules: Array<[RegExp, string]>): string => {
  for (const [pattern, label] of rules) {
    if (pattern.test(ua)) return label
  }
  return 'Unknown'
}

/**
 * Parses a raw user-agent header into a friendly {@link DeviceInfo}.
 *
 * Accepts `null`/`undefined` (an agent can be absent on programmatic calls)
 * and always returns a complete object so callers never branch.
 */
export const parseUserAgent = (userAgent: string | null | undefined): DeviceInfo => {
  const ua = typeof userAgent === 'string' ? userAgent : ''

  return {
    browser: firstMatch(ua, BROWSERS),
    os: firstMatch(ua, SYSTEMS),
    device: deviceKind(ua),
  }
}
