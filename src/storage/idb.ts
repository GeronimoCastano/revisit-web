/** Imported course files, kept in this browser's IndexedDB. Nothing is uploaded anywhere. */

export interface StoredEntry {
  path: string
  size: number
  added: number
}

let opening: Promise<IDBDatabase> | undefined

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('revisit', 1)
    request.onupgradeneeded = () => {
      const d = request.result
      d.createObjectStore('entries', { keyPath: 'path' })
      d.createObjectStore('blobs')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return opening
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Storage write was cancelled.'))
  })
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listEntries(): Promise<StoredEntry[]> {
  const tx = (await db()).transaction('entries')
  return result(tx.objectStore('entries').getAll() as IDBRequest<StoredEntry[]>)
}

export async function putFile(path: string, blob: Blob): Promise<void> {
  const tx = (await db()).transaction(['entries', 'blobs'], 'readwrite')
  tx.objectStore('blobs').put(blob, path)
  tx.objectStore('entries').put({ path, size: blob.size, added: Date.now() } satisfies StoredEntry)
  await done(tx)
}

export async function getBlob(path: string): Promise<Blob | undefined> {
  const tx = (await db()).transaction('blobs')
  return result(tx.objectStore('blobs').get(path) as IDBRequest<Blob | undefined>)
}

export async function deletePaths(paths: string[]): Promise<void> {
  const tx = (await db()).transaction(['entries', 'blobs'], 'readwrite')
  for (const path of paths) {
    tx.objectStore('entries').delete(path)
    tx.objectStore('blobs').delete(path)
  }
  await done(tx)
}
