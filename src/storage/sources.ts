import type { FileRef } from '../model/types'
import { getBlob, listEntries } from './idb'

/**
 * Files come from two places: courses imported into this browser (IndexedDB), and, while
 * developing, a folder on disk that the dev server shares at `/local-library/`.
 */
export interface ListedFile extends FileRef {
  size: number
}

const devBase = `${import.meta.env.BASE_URL}local-library/`

async function listDev(): Promise<ListedFile[]> {
  if (!import.meta.env.DEV) return []
  try {
    const response = await fetch(`${devBase}index.json`)
    if (!response.ok) return []
    const body = (await response.json()) as { files: { path: string; size: number }[] }
    return body.files.map((f) => ({ source: 'dev', path: f.path, size: f.size }))
  } catch {
    return []
  }
}

export async function listAllFiles(): Promise<ListedFile[]> {
  const [imported, dev] = await Promise.all([listEntries().catch(() => []), listDev()])
  const importedPaths = new Set(imported.map((e) => e.path))
  return [
    ...imported.map((e): ListedFile => ({ source: 'idb', path: e.path, size: e.size })),
    ...dev.filter((f) => !importedPaths.has(f.path)),
  ]
}

const devURL = (path: string) => devBase + 'files/' + path.split('/').map(encodeURIComponent).join('/')

/** A URL the page can play or fetch. Object URLs for imported files are cached until released. */
const objectURLs = new Map<string, string>()

export async function urlFor(file: FileRef): Promise<string> {
  if (file.source === 'dev') return devURL(file.path)
  const cached = objectURLs.get(file.path)
  if (cached) return cached
  const blob = await getBlob(file.path)
  if (!blob) throw new Error('This file is no longer in the browser. Import the course again.')
  const url = URL.createObjectURL(blob)
  objectURLs.set(file.path, url)
  return url
}

export function releaseURL(file: FileRef) {
  const url = objectURLs.get(file.path)
  if (url) {
    URL.revokeObjectURL(url)
    objectURLs.delete(file.path)
  }
}

export async function bytesFor(file: FileRef): Promise<ArrayBuffer> {
  if (file.source === 'dev') {
    const response = await fetch(devURL(file.path))
    if (!response.ok) throw new Error(`Couldn't read ${file.path}`)
    return response.arrayBuffer()
  }
  const blob = await getBlob(file.path)
  if (!blob) throw new Error('This file is no longer in the browser. Import the course again.')
  return blob.arrayBuffer()
}
