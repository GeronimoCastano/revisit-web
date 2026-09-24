import type { PDFDocumentProxy } from 'pdfjs-dist'
import { type FileRef, fileKey } from '../model/types'
import { bytesFor } from '../storage/sources'
import { type ReadingContent, indexBooklet } from './booklet'

/** pdf.js is large; it loads the first time a booklet is opened. */
async function pdfjs() {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}

const documents = new Map<string, Promise<PDFDocumentProxy>>()
const indexes = new Map<string, Promise<ReadingContent[]>>()

export function openPDF(file: FileRef): Promise<PDFDocumentProxy> {
  const key = fileKey(file)
  let doc = documents.get(key)
  if (!doc) {
    doc = (async () => {
      const lib = await pdfjs()
      const data = new Uint8Array(await bytesFor(file))
      return lib.getDocument({ data, verbosity: 0 }).promise
    })()
    doc.catch(() => documents.delete(key))
    documents.set(key, doc)
  }
  return doc
}

/** The reading lessons of a booklet, parsed once per visit. */
export function bookletUnits(file: FileRef): Promise<ReadingContent[]> {
  const key = fileKey(file)
  let units = indexes.get(key)
  if (!units) {
    units = openPDF(file).then(indexBooklet)
    units.catch(() => indexes.delete(key))
    indexes.set(key, units)
  }
  return units
}

/** Draws one page (0-based) into a canvas at the canvas's CSS width. */
export async function renderPage(file: FileRef, index: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const doc = await openPDF(file)
  const page = await doc.getPage(index + 1)
  const base = page.getViewport({ scale: 1 })
  const scale = (cssWidth / base.width) * Math.min(devicePixelRatio || 1, 3)
  const viewport = page.getViewport({ scale })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.aspectRatio = `${base.width} / ${base.height}`
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
}

export async function pageCount(file: FileRef) {
  return (await openPDF(file)).numPages
}
