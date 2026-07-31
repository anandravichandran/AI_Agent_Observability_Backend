import multer, { type FileFilterCallback } from 'multer'
import type { Request, RequestHandler } from 'express'
import { BadRequestError, PayloadTooLargeError } from '@/core/errors/app-error'
import { ErrorCode } from '@/core/constants/error-codes'
import { AVATAR_MIME_TYPES, type AvatarMimeType } from '@/modules/users/user.constants'

/**
 * Avatar upload middleware.
 *
 * Uses in-memory storage rather than disk: the service decides where the file
 * ultimately lives (via `IAvatarStorage`), and buffering a ≤2MB image is cheap.
 * Keeping multer out of the persistence decision means the storage adapter can
 * change (local disk → object storage) without touching this middleware.
 *
 * Validation here is intentionally shallow — MIME type and size only. The deep
 * validation that matters (is the byte stream actually an image, rather than a
 * polyglot with a forged `Content-Type`) is a known hardening gap for a local
 * deployment and is called out in the README; closing it needs an image
 * decoding library, which is out of scope for this phase.
 */

/** Type guard narrowing a validated MIME string to the supported union. */
const isAvatarMime = (mime: string): mime is AvatarMimeType =>
  (AVATAR_MIME_TYPES as readonly string[]).includes(mime)

/**
 * Builds a single-file upload handler for the `avatar` field.
 *
 * Multer's own errors (notably `LIMIT_FILE_SIZE`) are translated into the
 * application's error hierarchy so the global error handler returns the uniform
 * envelope rather than a bare 500.
 */
export const createAvatarUpload = (maxBytes: number): RequestHandler => {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 0,
    },
    fileFilter: (_req: Request, file, callback: FileFilterCallback) => {
      if (isAvatarMime(file.mimetype)) {
        callback(null, true)
        return
      }

      callback(
        new BadRequestError(
          `Unsupported avatar type \`${file.mimetype}\`. Use PNG, JPEG, or WebP.`,
          { code: ErrorCode.UNSUPPORTED_MEDIA_TYPE },
        ),
      )
    },
  }).single('avatar')

  const handler: RequestHandler = (req, res, next) => {
    parser(req, res, (error: unknown) => {
      if (!error) {
        next()
        return
      }

      if (error instanceof multer.MulterError) {
        next(
          error.code === 'LIMIT_FILE_SIZE'
            ? new PayloadTooLargeError(
                `Avatar exceeds the ${String(Math.round(maxBytes / 1024))}KB limit.`,
              )
            : new BadRequestError(`Upload failed: ${error.message}`),
        )
        return
      }

      next(error)
    })
  }

  return handler
}
