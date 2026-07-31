import type { NextFunction, Request, RequestHandler, Response } from 'express'

const DANGEROUS_KEY_PATTERN = /^\$|\./
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Recursively strips Mongo-operator-shaped keys (`$where`, `$gt`, dotted
 * paths) and prototype-pollution keys (`__proto__`, `constructor`,
 * `prototype`) from an object in place.
 *
 * **Scope, deliberately narrow**: this is a Mongo-injection / prototype-
 * pollution guard, not a general HTML/XSS sanitizer. An earlier draft of
 * this middleware also HTML-escaped every string value on every request;
 * that was reverted (see `README.md` — Security) because it silently
 * mutates opaque fields — passwords, already-hashed tokens, API key
 * secrets — that must never be transformed, and because sanitization and
 * output encoding are different concerns that this codebase intentionally
 * keeps separate: free-text fields that are actually rendered (e.g. API key
 * `name`) strip tag-shaped input in their Zod schema instead
 * (`api-key.validation.ts`), next to the field that needs it, where a
 * reviewer can see why.
 */
const stripDangerousKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = stripDangerousKeys(value[index])
    }
    return value
  }

  if (!isPlainObject(value)) return value

  for (const key of Object.keys(value)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key) || DANGEROUS_KEY_PATTERN.test(key)) {
      delete value[key]
      continue
    }

    value[key] = stripDangerousKeys(value[key])
  }

  return value
}

/**
 * Mounted once, globally, right after the body parsers (see `app.ts`), so
 * every downstream handler — including Zod validation — only ever sees a
 * body/query/params tree that cannot smuggle a Mongo operator or a
 * prototype-pollution key.
 */
export const createSanitizeMiddleware = (): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (isPlainObject(req.body)) stripDangerousKeys(req.body)
    if (isPlainObject(req.query)) stripDangerousKeys(req.query)
    if (isPlainObject(req.params)) stripDangerousKeys(req.params)

    next()
  }
}
