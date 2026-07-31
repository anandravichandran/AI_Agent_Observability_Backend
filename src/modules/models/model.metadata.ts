import { createReadStream } from 'node:fs'
import path from 'node:path'
import type { ILogger } from '@/core/logger/logger.interface'
import type {
  FrameworkMetadata,
  GgufMetadata,
  OnnxMetadata,
  PytorchMetadata,
  TensorflowMetadata,
} from './model.entities'
import type { ModelFrameworkValue } from './model.constants'

/**
 * Framework-specific metadata extraction.
 *
 * Each extractor reads only the bytes it needs (header parsing, not full
 * parse), so even a 5 GB GGUF file yields metadata in milliseconds. Every
 * extractor must catch its own exceptions and return a partial result on
 * failure rather than propagating — a metadata parse error must not fail the
 * upload, only leave the metadata field incomplete.
 */

/** Read up to `count` bytes from the start of a file. */
const readHead = (filePath: string, count: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const stream = createReadStream(filePath, { start: 0, end: count - 1 })

    stream.on('data', (chunk: string | Buffer) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(bytes)
      total += bytes.length
    })

    stream.on('end', () => resolve(Buffer.concat(chunks, total)))
    stream.on('error', reject)
  })

/**
 * Read a little-endian 32-bit unsigned integer from a buffer.
 */
const readUInt32LE = (buf: Buffer, offset: number): number =>
  buf.readUInt32LE(offset)

/**
 * Read a little-endian 64-bit unsigned integer as a JS number.
 * Loses precision above Number.MAX_SAFE_INTEGER, but counts up to 2^32 are safe.
 */
const readUInt64LE = (buf: Buffer, offset: number): number => {
  const lo = buf.readUInt32LE(offset)
  const hi = buf.readUInt32LE(offset + 4)
  return hi * 0x100000000 + lo
}

// ---------------------------------------------------------------------------
// ONNX — minimal protobuf field decoder
// ---------------------------------------------------------------------------

/**
 * Decode the leading fields of an ONNX ModelProto.
 *
 * We hand-decode the first 4 KB of the protobuf to extract ir_version,
 * opset_import, producer_name, domain, and model_version. This avoids pulling
 * in a full protobuf runtime.
 *
 * Field numbers in onnx.proto ModelProto:
 *   1 = ir_version (int64), 2 = opset_import (OpsetImport), 3 = producer_name,
 *   4 = producer_version, 5 = domain, 6 = model_version (int64),
 *   7 = doc_string, 8 = graph (GraphProto)
 */
/** Mutable working copy used while accumulating decoded ONNX fields. */
type MutableOnnxMetadata = { -readonly [K in keyof OnnxMetadata]: OnnxMetadata[K] }

const extractOnnxMetadata = async (
  filePath: string,
): Promise<OnnxMetadata> => {
  try {
    const buf = await readHead(filePath, 4096)
    let pos = 0
    const result: MutableOnnxMetadata = {}

    while (pos < buf.length) {
      if (pos >= buf.length) break

      // Read varint tag
      let tag = 0
      let shift = 0
      while (pos < buf.length) {
        const byte = buf[pos++]
        if (byte === undefined) break
        tag |= (byte & 0x7f) << shift
        shift += 7
        if ((byte & 0x80) === 0) break
      }

      const fieldNumber = tag >>> 3
      const wireType = tag & 0x07

      // Read varint value
      const readVarint = (): number => {
        let val = 0
        let s = 0
        while (pos < buf.length) {
          const b = buf[pos++]
          if (b === undefined) break
          val |= (b & 0x7f) << s
          s += 7
          if ((b & 0x80) === 0) break
        }
        return val
      }

      // Read length-delimited bytes
      const readLenDelim = (): Buffer => {
        const len = readVarint()
        const slice = buf.slice(pos, pos + len)
        pos += len
        return slice
      }

      if (wireType === 0) {
        // varint
        const val = readVarint()
        if (fieldNumber === 1) result.irVersion = val
        if (fieldNumber === 6) result.modelVersion = String(val)
      } else if (wireType === 2) {
        // length-delimited
        const bytes = readLenDelim()
        if (fieldNumber === 3) result.producerName = bytes.toString('utf-8').replace(/\0/g, '')
        if (fieldNumber === 5) result.domain = bytes.toString('utf-8').replace(/\0/g, '')
        // opset_import is a message; we just count them
        if (fieldNumber === 2) {
          result.opsetVersion = (result.opsetVersion ?? 0) + 1
          // Try to extract the version field (field 2 inside OpsetImport)
          // Minimal: look for a varint field 2 in the sub-message
          try {
            let ip = 0
            while (ip < bytes.length) {
              let itag = 0; let ishift = 0
              while (ip < bytes.length) {
                const ib = bytes[ip++]
                if (ib === undefined) break
                itag |= (ib & 0x7f) << ishift; ishift += 7
                if ((ib & 0x80) === 0) break
              }
              const ifn = itag >>> 3; const iwt = itag & 7
              if (iwt === 0) {
                let iv = 0; let is2 = 0
                while (ip < bytes.length) {
                  const ib2 = bytes[ip++]
                  if (ib2 === undefined) break
                  iv |= (ib2 & 0x7f) << is2; is2 += 7
                  if ((ib2 & 0x80) === 0) break
                }
                if (ifn === 2) result.opsetVersion = iv
              } else break
            }
          } catch { /* best effort */ }
        }
        // graph field — skip the huge blob
        if (fieldNumber === 8) break
      } else if (wireType === 5) {
        pos += 4
      } else if (wireType === 1) {
        pos += 8
      } else {
        break // unknown wire type — stop
      }
    }

    return result
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// PyTorch — inspect ZIP entries
// ---------------------------------------------------------------------------

const extractPytorchMetadata = async (
  filePath: string,
): Promise<PytorchMetadata> => {
  try {
    // PyTorch .pt files are ZIP archives. Read the end-of-central-directory
    // record to enumerate entry names (from the central directory).
    // We only read the last 64 KB (more than enough for the EOCD + CDR).
    const { createReadStream: crs } = await import('node:fs')
    const { stat } = await import('node:fs/promises')
    const st = await stat(filePath)
    const tailSize = Math.min(65536, st.size)
    const start = st.size - tailSize
    const tailBuf = await new Promise<Buffer>((res, rej) => {
      const chunks: Buffer[] = []
      const s = crs(filePath, { start, end: st.size - 1 })
      s.on('data', (c: string | Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      s.on('end', () => res(Buffer.concat(chunks)))
      s.on('error', rej)
    })

    const entries: string[] = []
    let hasPickle = false
    // Scan for central directory file headers (signature 0x02014b50)
    for (let i = 0; i < tailBuf.length - 46; i++) {
      if (
        tailBuf[i] === 0x50 && tailBuf[i + 1] === 0x4b &&
        tailBuf[i + 2] === 0x01 && tailBuf[i + 3] === 0x02
      ) {
        const nameLen = tailBuf.readUInt16LE(i + 28)
        const extraLen = tailBuf.readUInt16LE(i + 30)
        const commentLen = tailBuf.readUInt16LE(i + 32)
        const nameStart = i + 46
        if (nameStart + nameLen <= tailBuf.length) {
          const name = tailBuf.slice(nameStart, nameStart + nameLen).toString('utf-8')
          entries.push(name)
          if (name.endsWith('.pkl') || name === 'archive/data.pkl') hasPickle = true
        }
        i += 46 + nameLen + extraLen + commentLen - 1
      }
    }

    return { hasPickle, zipEntries: entries.slice(0, 50) }
  } catch {
    return { hasPickle: false }
  }
}

// ---------------------------------------------------------------------------
// TensorFlow — classify by extension
// ---------------------------------------------------------------------------

const extractTensorflowMetadata = (
  extension: string,
): TensorflowMetadata => {
  const ext = extension.toLowerCase()
  if (ext === '.tflite') return { format: 'tflite' }
  if (ext === '.h5' || ext === '.keras') return { format: 'h5' }
  return { format: 'pb' }
}

// ---------------------------------------------------------------------------
// GGUF — binary header
// ---------------------------------------------------------------------------

/**
 * Parse the GGUF v1/v2/v3 file header.
 *
 * GGUF header layout (all little-endian):
 *   4 bytes: magic "GGUF"
 *   4 bytes: version (uint32)
 *   8 bytes: tensor_count (uint64)
 *   8 bytes: metadata_kv_count (uint64)
 *   ...key-value pairs follow...
 *
 * We only read the fixed header; the key-value blob can be enormous.
 */
const extractGgufMetadata = async (
  filePath: string,
): Promise<GgufMetadata> => {
  try {
    const buf = await readHead(filePath, 512)
    if (buf.length < 24) return {}

    const magic = buf.slice(0, 4).toString('ascii')
    if (magic !== 'GGUF') return {}

    const version = readUInt32LE(buf, 4)
    const tensorCount = readUInt64LE(buf, 8)
    const kvCount = readUInt64LE(buf, 16)

    // Try to read the architecture key from the first KV pair.
    // GGUF KV: str_len (uint64) + str_data + value_type (uint32) + value
    // Architecture key is typically "general.architecture" with a string value.
    let architecture: string | undefined
    try {
      let pos = 24
      // Read key string
      if (pos + 8 <= buf.length) {
        const keyLen = readUInt64LE(buf, pos)
        pos += 8
        if (keyLen < 64 && pos + keyLen <= buf.length) {
          const key = buf.slice(pos, pos + keyLen).toString('utf-8')
          pos += keyLen
          if (key === 'general.architecture' && pos + 4 <= buf.length) {
            const valType = readUInt32LE(buf, pos)
            pos += 4
            // Type 8 = string
            if (valType === 8 && pos + 8 <= buf.length) {
              const valLen = readUInt64LE(buf, pos)
              pos += 8
              if (valLen < 64 && pos + valLen <= buf.length) {
                architecture = buf.slice(pos, pos + valLen).toString('utf-8')
              }
            }
          }
        }
      }
    } catch { /* best effort */ }

    return { version, tensorCount, kvCount, architecture }
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const extractMetadata = async (
  filePath: string,
  framework: ModelFrameworkValue,
  extension: string,
  logger: ILogger,
): Promise<FrameworkMetadata | null> => {
  try {
    switch (framework) {
      case 'onnx': {
        const data = await extractOnnxMetadata(filePath)
        return { framework: 'onnx', data }
      }
      case 'pytorch': {
        const data = await extractPytorchMetadata(filePath)
        return { framework: 'pytorch', data }
      }
      case 'tensorflow': {
        const data = extractTensorflowMetadata(extension)
        return { framework: 'tensorflow', data }
      }
      case 'gguf': {
        const data = await extractGgufMetadata(filePath)
        return { framework: 'gguf', data }
      }
      default:
        return null
    }
  } catch (err) {
    logger.warn('Metadata extraction failed', {
      framework,
      extension,
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Detect the framework from the first bytes of a file (magic-byte check).
 *
 * Returns `null` if no magic matches, meaning the check is inconclusive rather
 * than a definite rejection — the extension check is the primary gate.
 */
export const detectFrameworkFromMagic = async (
  filePath: string,
): Promise<ModelFrameworkValue | null> => {
  const { MAGIC_BYTES } = await import('./model.constants')
  // Read enough bytes to cover all known offsets.
  const maxOffset = Math.max(...MAGIC_BYTES.map((m) => m.offset + m.bytes.length))
  const buf = await readHead(filePath, maxOffset)

  for (const magic of MAGIC_BYTES) {
    const slice = buf.slice(magic.offset, magic.offset + magic.bytes.length)
    if (
      slice.length === magic.bytes.length &&
      magic.bytes.every((b, i) => slice[i] === b)
    ) {
      return magic.framework
    }
  }

  return null
}
