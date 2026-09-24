/**
 * Reads a .zip without loading it into memory: the directory at the end of the file lists every
 * entry, and each entry is sliced out of the file (and inflated) only when it's imported.
 * Phones can't pick folders, but the Files app can compress one into a single .zip.
 */

export interface ZipEntry {
  /** Path inside the archive, e.g. `Italian/Level 1/Pimsleur Italian 1 - Unit 01.mp3`. */
  path: string
  size: number
  open: () => Promise<Blob>
}

type Inflate = (compressed: Blob) => Promise<Blob>

const inflateRaw: Inflate = (compressed) =>
  new Response(compressed.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()

async function view(file: Blob, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer())
}

const decoder = new TextDecoder()

export async function readZip(file: Blob, inflate: Inflate = inflateRaw): Promise<ZipEntry[]> {
  // End of central directory: 22 bytes plus a comment of up to 64 KB, at the very end.
  const tailStart = Math.max(0, file.size - 22 - 0xffff)
  const tail = await view(file, tailStart, file.size)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("This isn't a zip file.")

  let count = tail.getUint16(eocd + 10, true)
  let dirSize = tail.getUint32(eocd + 12, true)
  let dirOffset = tail.getUint32(eocd + 16, true)

  // Archives over 4 GB (or with over 65,535 files) keep the real numbers in a ZIP64 record.
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    const locator = eocd - 20
    if (locator < 0 || tail.getUint32(locator, true) !== 0x07064b50) throw new Error('This zip file is damaged.')
    const recordOffset = Number(tail.getBigUint64(locator + 8, true))
    const record = await view(file, recordOffset, recordOffset + 56)
    if (record.getUint32(0, true) !== 0x06064b50) throw new Error('This zip file is damaged.')
    count = Number(record.getBigUint64(32, true))
    dirSize = Number(record.getBigUint64(40, true))
    dirOffset = Number(record.getBigUint64(48, true))
  }

  const dir = await view(file, dirOffset, dirOffset + dirSize)
  const entries: ZipEntry[] = []
  let p = 0
  for (let n = 0; n < count && p + 46 <= dir.byteLength; n++) {
    if (dir.getUint32(p, true) !== 0x02014b50) throw new Error('This zip file is damaged.')
    const method = dir.getUint16(p + 10, true)
    let compressedSize = dir.getUint32(p + 20, true)
    let size = dir.getUint32(p + 24, true)
    const nameLength = dir.getUint16(p + 28, true)
    const extraLength = dir.getUint16(p + 30, true)
    const commentLength = dir.getUint16(p + 32, true)
    let localOffset = dir.getUint32(p + 42, true)
    const path = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength))

    // ZIP64 extra field: the 64-bit values, in this order, for each field that overflowed.
    let e = p + 46 + nameLength
    const extraEnd = e + extraLength
    while (e + 4 <= extraEnd) {
      const id = dir.getUint16(e, true)
      const length = dir.getUint16(e + 2, true)
      if (id === 0x0001) {
        let q = e + 4
        if (size === 0xffffffff) (size = Number(dir.getBigUint64(q, true))), (q += 8)
        if (compressedSize === 0xffffffff) (compressedSize = Number(dir.getBigUint64(q, true))), (q += 8)
        if (localOffset === 0xffffffff) localOffset = Number(dir.getBigUint64(q, true))
      }
      e += 4 + length
    }
    p = extraEnd + commentLength

    if (path.endsWith('/') || (method !== 0 && method !== 8)) continue
    entries.push({
      path,
      size,
      open: async () => {
        // The local header repeats the name and may carry a different extra field.
        const local = await view(file, localOffset, localOffset + 30)
        if (local.getUint32(0, true) !== 0x04034b50) throw new Error(`Couldn't read ${path} from the zip.`)
        const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true)
        const data = file.slice(start, start + compressedSize)
        return method === 0 ? data : inflate(data)
      },
    })
  }
  return entries
}
