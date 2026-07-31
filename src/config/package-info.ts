import fs from 'node:fs'
import path from 'node:path'

export interface PackageInfo {
  readonly name: string
  readonly version: string
  readonly description: string
}

const FALLBACK: PackageInfo = {
  name: 'armforge-ai-backend',
  version: '0.0.0',
  description: 'ArmForge AI Backend',
}

let cached: PackageInfo | undefined

/**
 * Reads name/version/description from `package.json` at runtime.
 *
 * Read from disk rather than imported so the compiled `dist/` output does not
 * need `resolveJsonModule` emit gymnastics, and so a container image can ship a
 * patched version string without a rebuild.
 */
export const getPackageInfo = (cwd: string = process.cwd()): PackageInfo => {
  if (cached) return cached

  try {
    const raw = fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PackageInfo>

    cached = {
      name: parsed.name ?? FALLBACK.name,
      version: parsed.version ?? FALLBACK.version,
      description: parsed.description ?? FALLBACK.description,
    }
  } catch {
    cached = FALLBACK
  }

  return cached
}
