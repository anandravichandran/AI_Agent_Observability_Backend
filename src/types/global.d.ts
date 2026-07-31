/**
 * Ambient declarations.
 *
 * The Express augmentation lives in `src/core/types/express.d.ts`; this file
 * exists so `src/types` is a discoverable home for future ambient modules and
 * for typing the process environment surface.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'test' | 'production'
  }
}

export {}
