/**
 * Narrows a readonly literal-string array or tuple (typically an `as const`
 * list of allowed values) into the exact non-empty mutable tuple shape
 * `z.enum()` requires, without widening the member literal types to plain
 * `string` the way a direct `as [string, ...string[]]` cast does.
 *
 * The double cast through `unknown` is required because TypeScript refuses a
 * direct readonly-to-mutable tuple assertion; the generic `T` is what
 * preserves the literal union for every caller.
 */
export const nonEmptyEnumTuple = <T extends string>(values: readonly T[]): [T, ...T[]] =>
  values as unknown as [T, ...T[]]
