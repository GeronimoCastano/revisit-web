import { audioExtensions, pathHint, placeLooseFile } from '../model/scanner'
import { putFile } from './idb'
import { readZip } from './zip'

export interface ImportProgress {
  name: string
  copiedBytes: number
  totalBytes: number
}

export interface Picked {
  name: string
  /** Folder path as picked, e.g. `Italian/Level 1/Pimsleur Italian 1 - Unit 01.mp3`; empty for loose files. */
  relativePath: string
  size: number
  open: () => Promise<Blob>
}

const mimeTypes: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  caf: 'audio/x-caf',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  pdf: 'application/pdf',
}

const extension = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase()
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const wanted = (name: string) => !name.startsWith('.') && (audioExtensions.has(extension(name)) || extension(name) === 'pdf')

const fromFile = (file: File, relativePath: string): Picked => ({
  name: file.name,
  relativePath,
  size: file.size,
  open: async () => file,
})

/** Files from an `<input type="file">`, with folder paths when a folder was picked. */
export function pickedFromInput(list: FileList): Picked[] {
  return [...list].map((file) => fromFile(file, file.webkitRelativePath || ''))
}

/** Files and whole folders dropped onto the page. */
export async function pickedFromDrop(transfer: DataTransfer): Promise<Picked[]> {
  const entries = [...transfer.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (entries.length === 0) return [...transfer.files].map((file) => fromFile(file, ''))
  const out: Picked[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      out.push(fromFile(file, prefix ? `${prefix}/${file.name}` : ''))
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // readEntries returns results in batches until it returns an empty list.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (batch.length === 0) break
        for (const child of batch) await walk(child, path)
      }
    }
  }
  for (const entry of entries) await walk(entry, '')
  return out
}

/** Swaps each picked .zip for the files inside it, with their folder paths. */
export async function expandZips(picked: Picked[]): Promise<Picked[]> {
  const out: Picked[] = []
  for (const p of picked) {
    if (!/\.zip$/i.test(p.name)) {
      out.push(p)
      continue
    }
    const file = await p.open()
    for (const entry of await readZip(file)) {
      if (entry.path.split('/').some((part) => part.toLowerCase() === '__macosx')) continue
      out.push({ name: baseName(entry.path), relativePath: entry.path, size: entry.size, open: entry.open })
    }
  }
  return out
}

/** Where each file goes in the library. Loose files get a folder from their names. */
export function placeFiles(picked: Picked[]): (Picked & { path: string })[] {
  const useful = picked.filter((p) => wanted(p.name))
  const counts = new Map<string, number>()
  for (const p of useful) {
    const language = pathHint(p.name)?.language
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1)
  }
  const batchLanguage = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return useful.map((p) => ({
    ...p,
    path: p.relativePath.includes('/') ? p.relativePath : placeLooseFile(p.name, batchLanguage),
  }))
}

/** Copies files into the browser's storage, one at a time so memory stays low. */
export async function importFiles(
  files: (Picked & { path: string })[],
  onProgress: (p: ImportProgress) => void,
): Promise<number> {
  // Ask the browser not to clear these files when space runs low.
  await navigator.storage?.persist?.().catch(() => false)
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const name = files[0]?.path.split('/')[0] ?? 'course'
  let copiedBytes = 0
  onProgress({ name, copiedBytes, totalBytes })
  for (const f of files) {
    const data = await f.open()
    // Safari only plays stored audio when the blob says what it is.
    const type = mimeTypes[extension(f.name)] ?? data.type
    await putFile(f.path, data.type === type ? data : new Blob([data], { type }))
    copiedBytes += f.size
    onProgress({ name, copiedBytes, totalBytes })
  }
  return files.length
}
