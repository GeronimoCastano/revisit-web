import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readZip } from '../src/storage/zip'

/** A minimal zip writer: enough to check the reader against stored and deflated entries. */
function makeZip(files: { path: string; data: Uint8Array; deflate?: boolean }[]): Blob {
  const parts: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  const name = (s: string) => new TextEncoder().encode(s)
  for (const f of files) {
    const n = name(f.path)
    const body = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(8, f.deflate ? 8 : 0, true)
    local.setUint32(18, body.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, n.length, true)
    parts.push(new Uint8Array(local.buffer), n, body)
    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(10, f.deflate ? 8 : 0, true)
    central.setUint32(20, body.length, true)
    central.setUint32(24, f.data.length, true)
    central.setUint16(28, n.length, true)
    central.setUint32(42, offset, true)
    directory.push(new Uint8Array(central.buffer), n)
    offset += 30 + n.length + body.length
  }
  const dirSize = directory.reduce((s, p) => s + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, dirSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)] as BlobPart[])
}

const inflate = async (b: Blob) => new Blob([inflateRawSync(new Uint8Array(await b.arrayBuffer()))])
const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer())

describe('readZip', () => {
  it('lists entries and reads stored and deflated files', async () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    const zip = makeZip([
      { path: 'Italian/', data: new Uint8Array() },
      { path: 'Italian/Level 1/Unit 01.mp3', data: enc('stored audio') },
      { path: 'Italian/Level 1/Reading/Libretto è.pdf', data: enc('pdf '.repeat(100)), deflate: true },
    ])
    const entries = await readZip(zip, inflate)
    expect(entries.map((e) => e.path)).toEqual(['Italian/Level 1/Unit 01.mp3', 'Italian/Level 1/Reading/Libretto è.pdf'])
    expect(entries.map((e) => e.size)).toEqual([12, 400])
    expect(await text(await entries[0].open())).toBe('stored audio')
    expect(await text(await entries[1].open())).toBe('pdf '.repeat(100))
  })

  it('rejects files that are not zips', async () => {
    await expect(readZip(new Blob(['hello']))).rejects.toThrow("isn't a zip")
  })
})
