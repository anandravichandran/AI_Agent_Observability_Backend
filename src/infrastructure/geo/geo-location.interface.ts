export interface GeoLocation {
  readonly country: string | null
  readonly region: string | null
  readonly city: string | null
  /** True for loopback/private/reserved ranges, where a country lookup is meaningless. */
  readonly isPrivate: boolean
}

export interface IGeoLocationService {
  resolve(ip: string): Promise<GeoLocation | null>
}
