// Parses every booklet under a folder and prints what the reading view would find.
// Usage: npx vite-node scripts/check-booklets.ts -- <folder> [--verbose]
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hasStressMarks, hasTranslation, indexBooklet } from '../src/reading/booklet'

const args = process.argv.slice(2).filter((a) => a !== '--')
const root = args.find((a) => !a.startsWith('--'))!
const verbose = args.includes('--verbose')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /bklt|booklet/i.test(n) && n.endsWith('.pdf') ? [p] : []
  })

for (const file of walk(root).sort()) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise
  const units = await indexBooklet(doc as never)
  const ords = units.map((u) => u.ordinal)
  console.log(
    `${file.split('/').slice(-3).join('/')}: ${units.length} units [${ords[0]}–${ords[ords.length - 1]}]`,
    `stress ${units.filter(hasStressMarks).length}, translated ${units.filter(hasTranslation).length},`,
    `inline ${units.filter((u) => u.inlineTranslations).length}, page-only ${units.filter((u) => u.blocks.every((b) => b.kind === 'page')).length}`,
  )
  if (verbose) {
    for (const u of units) {
      const items = u.blocks.flatMap((b) => (b.kind === 'items' ? b.items : []))
      const first = items[0]
      console.log(`  ${u.ordinal} p${u.firstPage + 1} ${u.heading ?? '-'} | ${items.length} items | ${first ? first.text.slice(0, 50) : 'pages'}${first && u.inlineTranslations ? ' → ' + (u.inlineTranslations[first.number] ?? '').slice(0, 40) : ''}`)
    }
  }
}
