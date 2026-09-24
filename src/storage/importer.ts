import { audioExtensions, pathHint, placeLooseFile } from '../model/scanner'
import { putFile } from './idb'

export interface ImportProgress {
  name: string
  copiedBytes: number
  totalBytes: number
}

interface Picked {
  file: File
  /** Folder path as picked, e.g. `Italian/Level 1/Pimsleur Italian 1 - Unit 01.mp3`; empty for loose files. */
  relativePath: string
}

const wanted = (name: string) => {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return !name.startsWith('.') && (audioExtensions.has(ext) || ext === 'pdf')
}

/** Files from an `<input type="file">`, with folder paths when a folder was picked. */
export function pickedFromInput(list: FileList): Picked[] {
  return [...list].map((file) => ({ file, relativePath: file.webkitRelativePath || '' }))
}

/** Files and whole folders dropped onto the page. */
export async function pickedFromDrop(transfer: DataTransfer): Promise<Picked[]> {
  const entries = [...transfer.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (entries.length === 0) return [...transfer.files].map((file) => ({ file, relativePath: '' }))
  const out: Picked[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      out.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : '' })
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

/** Where each file goes in the library. Loose files get a folder from their names. */
export function placeFiles(picked: Picked[]): { file: File; path: string }[] {
  const useful = picked.filter((p) => wanted(p.file.name))
  const counts = new Map<string, number>()
  for (const p of useful) {
    const language = pathHint(p.file.name)?.language
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1)
  }
  const batchLanguage = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return useful.map((p) => ({
    file: p.file,
    path: p.relativePath || placeLooseFile(p.file.name, batchLanguage),
  }))
}

/** Copies files into the browser's storage, one at a time so memory stays low. */
export async function importFiles(
  files: { file: File; path: string }[],
  onProgress: (p: ImportProgress) => void,
): Promise<number> {
  // Ask the browser not to clear these files when space runs low.
  await navigator.storage?.persist?.().catch(() => false)
  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0)
  const name = files[0]?.path.split('/')[0] ?? 'course'
  let copiedBytes = 0
  onProgress({ name, copiedBytes, totalBytes })
  for (const { file, path } of files) {
    await putFile(path, file)
    copiedBytes += file.size
    onProgress({ name, copiedBytes, totalBytes })
  }
  return files.length
}
