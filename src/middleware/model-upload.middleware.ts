import type { Request, RequestHandler } from 'express'
import multer from 'multer'
import { BadRequestError, PayloadTooLargeError } from '@/core/errors/app-error'
import { ALLOWED_EXTENSIONS } from '@/modules/models/model.constants'

/**
 * Model file upload middleware.
 *
 * Uses disk storage (not memory) because model files can be gigabytes and
 * buffering them in RAM would exhaust the process. Multer writes to a
 * configurable temp directory; the model service then streams the file from
 * disk to the permanent storage adapter.
 *
 * The middleware pipes directly to a PassThrough stream that the service reads,
 * so the actual path used is: HTTP -> multer disk write -> service re-read ->
 * model storage. This adds one read after the write but lets multer handle
 * the HTTP body parsing robustly (partial reads, backpressure, etc.).
 *
 * Note: For a production setup behind a proxy that pre-buffers to shared NFS
 * or object storage, replace this with a streaming upload that goes directly
 * from the TCP socket to the storage backend without touching disk.
 */
export const createModelUpload = (
  maxBytes: number,
  tempDir?: string,
): RequestHandler => {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, tempDir ?? '/tmp')
    },
    filename: (_req, _file, cb) => {
      cb(null, `model-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    },
  })

  const parser = multer({
    storage,
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req: Request, file, cb) => {
      const ext = file.originalname.split('.').pop()?.toLowerCase() ?? ''
      if (ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
        cb(null, true)
        return
      }
      cb(
        new BadRequestError(
          `File type .${ext} is not supported. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}.`,
        ),
      )
    },
  }).single('file')

  return (req, res, next) => {
    parser(req, res, (err: unknown) => {
      if (!err) { next(); return }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new PayloadTooLargeError(`File exceeds the ${String(Math.round(maxBytes / 1024 / 1024))}MB limit.`))
        return
      }
      next(err)
    })
  }
}
