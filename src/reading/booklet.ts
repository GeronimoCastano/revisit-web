import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

export interface ReadingItem {
  number: number
  text: string
  /** Per-character flags for letters printed in bold (the stressed vowel in Russian booklets). */
  bold?: boolean[]
  /** English printed next to the line, in booklets laid out in two columns. */
  translation?: string
}

export type ReadingBlock =
  /** Numbered lines rebuilt from the booklet page, shown as cards. */
  | { kind: 'items'; heading?: string; items: ReadingItem[] }
  /** A page we couldn't split into items; shown as an image of the page. */
  | { kind: 'page'; index: number }

/** One reading lesson of a booklet: its own pages plus any translation pages. */
export interface ReadingContent {
  ordinal: number
  heading?: string
  blocks: ReadingBlock[]
  translation: ReadingBlock[]
  /** Item number → English, when the translation lines up one-to-one with the reading. */
  inlineTranslations?: Record<number, string>
  /** First page of the lesson in the booklet (0-based). */
  firstPage: number
}

export const hasTranslation = (u: ReadingContent) => !!u.inlineTranslations || u.translation.length > 0
/** Stress marks are single bold letters inside words; whole bold words are just emphasis. */
export function hasStressMarks(u: ReadingContent): boolean {
  const boldRuns = u.blocks
    .flatMap((b) => (b.kind === 'items' ? b.items : []))
    .flatMap((i) => runs(i).filter((r) => r.bold && r.text.trim()))
  return boldRuns.length > 0 && boldRuns.filter((r) => r.text.trim().length <= 2).length >= boldRuns.length * 0.8
}

/** The text split into alternating regular and bold runs. */
export function runs(item: ReadingItem): { text: string; bold: boolean }[] {
  const chars = [...item.text]
  const bold = item.bold
  if (!bold || bold.length !== chars.length || !bold.includes(true)) return [{ text: item.text, bold: false }]
  const out: { text: string; bold: boolean }[] = []
  chars.forEach((c, i) => {
    const last = out[out.length - 1]
    if (last && last.bold === bold[i]) last.text += c
    else out.push({ text: c, bold: bold[i] })
  })
  return out
}

export interface PageInfo {
  index: number
  heading?: string
  headingWord?: string
  ordinal?: number
  isTranslationTitle: boolean
  items?: ReadingItem[]
  latinRatio: number
  englishRatio: number
}

/**
 * Finds the reading lessons inside a Pimsleur reading booklet.
 *
 * Booklets vary a lot between languages and editions: headings may be missing or wrong
 * ("Lezione dieci" printed on lesson one), lessons spill over several pages, English sits on a
 * following page, at the end of the booklet, or in a second column. So the lessons are found
 * from the page layout (numbered lines, which pages continue which) and headings are only
 * trusted when they agree with the order of the booklet.
 */
export async function indexBooklet(doc: PDFDocumentProxy): Promise<ReadingContent[]> {
  const pages: PageInfo[] = []
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1)
    pages.push(await parsePage(page, i))
    page.cleanup()
  }
  return buildUnits(pages)
}

// MARK: - Lessons from pages

/** Consecutive pages that belong together (a lesson that runs over two pages). */
interface Block {
  pages: PageInfo[]
  items?: ReadingItem[]
  isTranslation: boolean
}

const blockOrdinal = (b: Block) => b.pages.find((p) => p.ordinal !== undefined)?.ordinal
const blockEnglish = (b: Block) => Math.max(...b.pages.map((p) => p.englishRatio))
const readingBlocks = (b: Block): ReadingBlock[] =>
  b.items ? [{ kind: 'items', heading: b.pages[0].heading, items: b.items }] : b.pages.map((p) => ({ kind: 'page', index: p.index }))

export function buildUnits(pages: PageInfo[]): ReadingContent[] {
  // 1. Group pages into blocks.
  const blocks: Block[] = []
  for (const page of pages) {
    if (!page.items && page.ordinal === undefined) continue
    const previous = blocks[blocks.length - 1]
    if (previous && continues(previous, page)) {
      previous.pages.push(page)
      const first = page.items?.[0]
      if (page.items && previous.items && first && previous.items[previous.items.length - 1]?.number === first.number - 1) {
        previous.items = [...previous.items, ...page.items]
      } else if (page.items) {
        previous.items = undefined // Can't stitch cleanly; show the pages instead.
      }
    } else if (!page.items && page.ordinal !== undefined && page.heading && isFrontMatter(page.heading)) {
      continue
    } else {
      blocks.push({ pages: [page], items: page.items, isTranslation: false })
    }
  }
  if (blocks.length === 0) return []

  // 2. Reading pages or translation pages?
  const nativeWord = blocks.map((b) => b.pages[0].headingWord).find((w) => w && w !== 'lesson' && w !== 'unit')
  for (const block of blocks) {
    const first = block.pages[0]
    const latin = first.latinRatio > 0.6
    // A page headed like the booklet's lessons ("Lezione", "Урок") is always a reading page.
    if (nativeWord && first.headingWord === nativeWord && !first.isTranslationTitle) continue
    block.isTranslation =
      first.isTranslationTitle ||
      (blockEnglish(block) >= 0.08 && (nativeWord !== undefined || !latin)) ||
      (latin && nativeWord !== undefined && first.headingWord === 'lesson') ||
      (latin && blocks.some((b) => b.pages[0].latinRatio < 0.3))
  }
  // An English course would look all-translation; then everything is the reading.
  if (blocks.every((b) => b.isTranslation)) for (const b of blocks) b.isTranslation = false

  // 3. Number the lessons, trusting headings only where they fit the booklet's order.
  const nativeIndices = blocks.map((b, i) => (b.isTranslation ? -1 : i)).filter((i) => i >= 0)
  const rawOrdinals = nativeIndices.map((i) => {
    const own = blockOrdinal(blocks[i])
    if (own !== undefined) return own
    // A heading-less reading page takes the number of the translation that follows it.
    if (i + 1 < blocks.length && blocks[i + 1].isTranslation) return blockOrdinal(blocks[i + 1])
    return undefined
  })
  // A second page carrying the same heading (a letter printed as prose) joins its lesson.
  const groups: { raw?: number; blocks: number[] }[] = []
  nativeIndices.forEach((i, k) => {
    const raw = rawOrdinals[k]
    const last = groups[groups.length - 1]
    if (raw !== undefined && last && last.raw === raw && blockOrdinal(blocks[i]) === raw) last.blocks.push(i)
    else groups.push({ raw, blocks: [i] })
  })
  const ordinals = sequenced(groups.map((g) => g.raw))

  const units: ReadingContent[] = []
  const unitForBlock = new Map<number, number>()
  groups.forEach((group, k) => {
    const first = blocks[group.blocks[0]].pages[0]
    units.push({
      ordinal: ordinals[k],
      heading: first.heading,
      blocks: group.blocks.flatMap((i) => readingBlocks(blocks[i])),
      translation: [],
      firstPage: first.index,
    })
    for (const i of group.blocks) unitForBlock.set(i, k)
  })

  // 4. Attach translations: next to their lesson when the booklet interleaves them,
  //    by number when they're collected at the end.
  const translationIndices = blocks.map((b, i) => (b.isTranslation ? i : -1)).filter((i) => i >= 0)
  const interleaved =
    translationIndices.length > 0 &&
    translationIndices.filter((i) => i > 0 && !blocks[i - 1].isTranslation).length >= translationIndices.length * 0.6
  const appendixOrdinals = sequenced(translationIndices.map((i) => blockOrdinal(blocks[i])))
  translationIndices.forEach((i, k) => {
    let target: number | undefined
    if (interleaved) {
      for (let j = i - 1; j >= 0 && target === undefined; j--) target = unitForBlock.get(j)
    } else {
      const found = units.findIndex((u) => u.ordinal === appendixOrdinals[k])
      target = found >= 0 ? found : undefined
    }
    if (target !== undefined) units[target].translation.push(...readingBlocks(blocks[i]))
  })

  // 5. Line-by-line English where it lines up.
  const itemsOf = (bs: ReadingBlock[]) => bs.flatMap((b) => (b.kind === 'items' ? b.items : []))
  for (const unit of units) {
    const original = itemsOf(unit.blocks)
    const english = itemsOf(unit.translation)
    if (original.length > 0 && original.map((i) => i.number).join() === english.map((i) => i.number).join()) {
      unit.inlineTranslations = Object.fromEntries(english.map((i) => [i.number, i.text]))
      continue
    }
    const fromColumns = original.filter((i) => i.translation).map((i) => [i.number, i.translation!] as const)
    if (fromColumns.length > 0 && fromColumns.length >= Math.floor(original.length / 2)) {
      unit.inlineTranslations = Object.fromEntries(fromColumns)
    }
  }
  return units
}

function continues(block: Block, page: PageInfo): boolean {
  const lastNumber = block.items?.[block.items.length - 1]?.number ?? block.pages[block.pages.length - 1].items?.slice(-1)[0]?.number
  const first = page.items?.[0]?.number
  if (first !== undefined && first > 1 && lastNumber !== undefined && first === lastNumber + 1) {
    return page.ordinal === undefined || page.ordinal === blockOrdinal(block)
  }
  // The same heading repeated on a page we couldn't read as numbered lines (same script).
  const head = block.pages[0]
  return (
    !page.items &&
    page.ordinal !== undefined &&
    page.ordinal === blockOrdinal(block) &&
    page.headingWord === head.headingWord &&
    Math.abs(page.latinRatio - head.latinRatio) < 0.4
  )
}

const isFrontMatter = (heading: string) => /contents/i.test(heading)

/** Keeps a heading's number when it moves forward and stays below the next known number;
 *  otherwise counts on from the previous lesson. Fixes typos and fills gaps. */
export function sequenced(raw: (number | undefined)[]): number[] {
  const result: number[] = []
  let previous = 0
  raw.forEach((value, i) => {
    const nextKnown = raw.slice(i + 1).find((v): v is number => v !== undefined && v > previous)
    if (value !== undefined && value > previous && (nextKnown === undefined || value < nextKnown)) previous = value
    else previous += 1
    result.push(previous)
  })
  return result
}

// MARK: - Page parsing

interface Piece {
  str: string
  x: number
  width: number
  bold: boolean
}

interface Rect {
  minX: number
  maxX: number
  minY: number
  maxY: number
  midY: number
}

/** A run of text on one baseline, split where a wide gap separates columns or a label from its text. */
interface Line {
  text: string
  rect: Rect
  pieces: Piece[]
  size: number
}

interface Label {
  number: number
  rect: Rect
  inlineText: string
}

export async function parsePage(page: PDFPageProxy, index: number): Promise<PageInfo> {
  const [x0, y0, x1, y1] = page.view
  const pageWidth = x1 - x0
  const pageHeight = y1 - y0
  const content = await page.getTextContent()
  const textItems = content.items.filter((i): i is TextItem => 'str' in i && i.str !== '')

  let lines = buildLines(textItems, () => false)
  let labels = findLabels(lines, pageWidth)
  // Font names (for bold stress marks) need the page's fonts loaded; only worth it on reading pages.
  if (labels.length > 0) {
    const bold = await boldFonts(page, textItems)
    if (bold.size > 0) {
      lines = buildLines(textItems, (font) => bold.has(font))
      labels = findLabels(lines, pageWidth)
    }
  }
  const heading = findHeading(lines, labels, pageHeight)
  const items = labels.length > 0 ? assembleItems(lines, labels) : undefined
  const text = (items?.map((i) => i.text) ?? lines.map((l) => l.text)).join(' ')
  return {
    index,
    heading: heading?.text,
    headingWord: heading?.word,
    ordinal: heading?.ordinal,
    isTranslationTitle: !!heading && /translation/i.test(heading.text),
    items,
    latinRatio: latinRatio(text),
    englishRatio: englishRatio(text),
  }
}

async function boldFonts(page: PDFPageProxy, items: TextItem[]): Promise<Set<string>> {
  const bold = new Set<string>()
  try {
    await page.getOperatorList()
    for (const font of new Set(items.map((i) => i.fontName))) {
      const name: string = (page.commonObjs.get(font) as { name?: string } | undefined)?.name ?? ''
      if (/Bold|Black|Heavy|Semibold|SemiBold|Demi/.test(name)) bold.add(font)
    }
  } catch {
    // Fonts unavailable; the reading still shows, just without stress marks.
  }
  return bold
}

function buildLines(items: TextItem[], isBold: (font: string) => boolean): Line[] {
  type Placed = Piece & { y: number; size: number }
  const placed: Placed[] = items.map((i) => ({
    str: i.str,
    x: i.transform[4],
    y: i.transform[5],
    width: i.width,
    size: Math.hypot(i.transform[2], i.transform[3]) || i.height || 10,
    bold: isBold(i.fontName),
  }))
  placed.sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: Placed[][] = []
  for (const p of placed) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - p.y) < Math.max(2, p.size * 0.25)) row.push(p)
    else rows.push([p])
  }

  const lines: Line[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    let segment: Placed[] = []
    const flush = () => {
      if (segment.length === 0) return
      const size = Math.max(...segment.map((s) => s.size))
      let text = ''
      let end = -Infinity
      for (const s of segment) {
        if (text && s.x - end > size * 0.15 && !/\s$/.test(text) && !/^\s/.test(s.str)) text += ' '
        text += s.str
        end = Math.max(end, s.x + s.width)
      }
      text = text.trim()
      const y = segment[0].y
      const rect: Rect = { minX: segment[0].x, maxX: end, minY: y - size * 0.2, maxY: y + size * 0.8, midY: y + size * 0.3 }
      // Some booklets print text twice on top of itself.
      const key = `${text}@${Math.round(rect.minX)},${Math.round(rect.minY)}`
      if (text && !seen.has(key)) {
        seen.add(key)
        lines.push({ text, rect, pieces: segment, size })
      }
      segment = []
    }
    let end = -Infinity
    for (const p of row) {
      if (segment.length > 0 && p.x - end > Math.max(9, p.size * 0.8)) flush()
      segment.push(p)
      end = Math.max(segment.length === 1 ? -Infinity : end, p.x + p.width)
    }
    flush()
  }
  return lines
}

function findLabels(lines: Line[], pageWidth: number): Label[] {
  const pattern = /^(\d[\d ]{0,3})\.\s*(.*)$/s
  const pure: Label[] = []
  const inline: Label[] = []
  for (const line of lines) {
    if (line.rect.minX >= pageWidth * 0.4) continue
    const m = pattern.exec(line.text)
    if (!m) continue
    const number = Number(m[1].replace(/\D/g, ''))
    if (!(number > 0 && number < 200)) continue
    const rest = m[2].trim()
    const label = { number, rect: line.rect, inlineText: rest }
    ;(rest ? inline : pure).push(label)
  }
  const chosen = pure.length >= 2 ? pure : inline.length >= 2 ? inline : []
  const sorted: Label[] = []
  for (const label of [...chosen].sort((a, b) => b.rect.midY - a.rect.midY)) {
    if (!sorted.some((s) => s.number === label.number && Math.abs(s.rect.midY - label.rect.midY) < 3)) sorted.push(label)
  }
  // Must count up by one from top to bottom (continuation pages start past 1).
  for (let i = 1; i < sorted.length; i++) if (sorted[i].number !== sorted[i - 1].number + 1) return []
  return sorted
}

function assembleItems(lines: Line[], labels: Label[]): ReadingItem[] | undefined {
  const gaps = labels.slice(1).map((l, i) => labels[i].rect.midY - l.rect.midY).sort((a, b) => a - b)
  const spacing = gaps.length === 0 ? 18 : gaps[Math.floor(gaps.length / 2)]
  const top = labels[0].rect.maxY + 2
  const bottom = labels[labels.length - 1].rect.midY - spacing * 2.2
  const labelRight = Math.max(...labels.map((l) => l.rect.maxX))
  const tolerance = spacing * 0.35
  const labelRects = new Set(labels.map((l) => l.rect))

  const body = lines.filter(
    (line) =>
      !labelRects.has(line.rect) &&
      line.rect.minX >= labelRight - 1 &&
      line.rect.midY <= top &&
      line.rect.midY >= bottom &&
      !/^\d+$/.test(line.text),
  )
  const columns = new ColumnSplitter(body)

  const left: { y: number; text: string }[][] = labels.map(() => [])
  const right: { y: number; text: string }[][] = labels.map(() => [])
  for (const line of body) {
    let i = -1
    labels.forEach((l, k) => {
      if (l.rect.midY >= line.rect.midY - tolerance) i = k
    })
    if (i < 0) continue
    const parts = columns.split(line)
    if (parts.left) left[i].push({ y: line.rect.midY, text: parts.left })
    if (parts.right) right[i].push({ y: line.rect.midY, text: parts.right })
  }

  const items = labels.map((label, i): ReadingItem => {
    const text = joinLines([label.inlineText, ...left[i].sort((a, b) => b.y - a.y).map((p) => p.text)])
    const english = joinLines(right[i].sort((a, b) => b.y - a.y).map((p) => p.text))
    return { number: label.number, text, translation: english || undefined }
  })
  const empty = items.filter((i) => !i.text).length
  if (empty > items.length * 0.3) return undefined

  // Bold letters: walk the page's glyphs in order, matching each item's text.
  const glyphs = lines
    .slice()
    .sort((a, b) => b.rect.midY - a.rect.midY || a.rect.minX - b.rect.minX)
    .flatMap((l) => l.pieces.flatMap((p) => [...p.str].filter((c) => !/\s/.test(c)).map((c) => ({ c, bold: p.bold }))))
  if (glyphs.some((g) => g.bold)) {
    const cursor = { value: 0 }
    return items.map((item) => {
      const mask = boldMask(item.text, glyphs, cursor)
      return mask ? { ...item, bold: mask } : item
    })
  }
  return items
}

/** Bold flags for each character of `text`, found by locating the text in the glyphs at or after
 *  the cursor. Glyphs carry no whitespace, so spaces in `text` are skipped (and never bold). */
export function boldMask(text: string, glyphs: { c: string; bold: boolean }[], cursor: { value: number }): boolean[] | undefined {
  const chars = [...text]
  const target = chars.filter((c) => !/\s/.test(c))
  if (target.length === 0 || cursor.value >= glyphs.length) return undefined
  const limit = glyphs.length - target.length
  for (let start = cursor.value; start <= limit; start++) {
    let matches = true
    for (let k = 0; k < target.length; k++) {
      if (glyphs[start + k].c !== target[k]) {
        matches = false
        break
      }
    }
    if (!matches) continue
    cursor.value = start + target.length
    let g = start
    return chars.map((c) => (/\s/.test(c) ? false : glyphs[g++].bold))
  }
  return undefined
}

/** Wrapped lines join with a space; a line that ends a sentence starts a new line. */
function joinLines(parts: string[]): string {
  let result = ''
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    if (!result) result = part
    else if ('.!?…:)'.includes(result[result.length - 1])) result += '\n' + part
    else result += ' ' + part
  }
  return result.replace(/[ \t]+/g, ' ')
}

/**
 * Splits lines of two-column pages (original on the left, English on the right).
 * The column edge is where several lines start well right of the text's left edge;
 * it only counts as a column when enough lines agree on it.
 */
class ColumnSplitter {
  private columnX?: number

  constructor(lines: Line[]) {
    const leftEdge = Math.min(...lines.map((l) => l.rect.minX))
    const starts = lines.map((l) => l.rect.minX).filter((x) => x > leftEdge + 60)
    if (starts.length < 3) return
    const median = [...starts].sort((a, b) => a - b)[Math.floor(starts.length / 2)]
    const agreeing = starts.filter((x) => Math.abs(x - median) < 8).length
    if (agreeing < Math.max(3, Math.floor(starts.length / 2))) return
    this.columnX = median
    const clean = lines.filter((l) => this.split(l).right !== undefined).length
    if (clean < 3) this.columnX = undefined
  }

  split(line: Line): { left?: string; right?: string } {
    const x = this.columnX
    if (x === undefined) return { left: line.text }
    if (line.rect.minX >= x - 8) return { right: line.text }
    if (line.rect.maxX <= x + 4) return { left: line.text }
    // Straddling: split between pieces, never through one.
    if (line.pieces.some((p) => p.x < x - 3 && p.x + p.width > x + 4)) return { left: line.text }
    const join = (ps: Piece[]) => ps.map((p) => p.str).join('').replace(/\s+/g, ' ').trim()
    const left = join(line.pieces.filter((p) => p.x < x - 3))
    const right = join(line.pieces.filter((p) => p.x >= x - 3))
    return left && right ? { left, right } : { left: line.text }
  }
}

// MARK: - Headings

const headingPattern =
  /^(lesson|lezione|lección|leccion|leçon|lecon|lektion|lição|licao|урок|unit|unità|unidad|unité|reading lesson|reading)\s+(.+)$/i
const nativeWords = new Set(['lezione', 'lección', 'leccion', 'leçon', 'lecon', 'lektion', 'lição', 'licao', 'урок'])

function findHeading(lines: Line[], labels: Label[], pageHeight: number) {
  const matches: { line: Line; word: string; ordinal: number }[] = []
  for (const line of lines) {
    const text = line.text
    if (text.includes('...') || text.includes('. .')) continue
    const m = headingPattern.exec(text)
    if (!m) continue
    const ordinal = ordinalValue(m[2])
    if (ordinal === undefined) continue
    const word = m[1].toLowerCase()
    matches.push({
      line,
      word: nativeWords.has(word) ? word : word.startsWith('unit') || word === 'unidad' ? 'unit' : 'lesson',
      ordinal,
    })
  }
  // A table of contents lists every lesson; it isn't a lesson page.
  if (matches.length === 0 || matches.length > 2) return undefined
  const candidates = matches.filter((m) =>
    labels[0] ? m.line.rect.midY > labels[0].rect.maxY : m.line.rect.midY > pageHeight * 0.55,
  )
  const best = candidates.sort((a, b) => b.line.rect.midY - a.line.rect.midY)[0]
  return best && { text: best.line.text, word: best.word, ordinal: best.ordinal }
}

/** "One", "Twenty-One", "Двенадцать", "dodici", "12", "One – An Agriturismo",
 *  "Twelve:  Checking Out", "One Translations" → number. */
export function ordinalValue(raw: string): number | undefined {
  let s = raw.toLowerCase()
  for (const separator of [':', '–', '—', ' - ', ',']) {
    const at = s.indexOf(separator)
    if (at >= 0) s = s.slice(0, at)
  }
  s = s
    .replace(/translations?/g, '')
    .replace(/-/g, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
  if (/^\d+$/.test(s)) return Number(s)
  const words = s.split(' ')
  if (/^\d+$/.test(words[0] ?? '')) return Number(words[0])
  // Longest run of leading words that names a number ("twenty one", "venti").
  for (let count = Math.min(words.length, 3); count >= 1; count--) {
    const n = ordinals.get(words.slice(0, count).join(' '))
    if (n !== undefined) return n
  }
  return undefined
}

const ordinals: Map<string, number> = (() => {
  const map = new Map<string, number>()
  const add = (words: string[], from: number) =>
    words.forEach((w, i) => {
      if (!map.has(w)) map.set(w, from + i)
    })
  // English
  const enOnes = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
  add(enOnes, 1)
  add(['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], 10)
  map.set('thiteen', 13) // as misprinted in a real booklet
  for (const [tens, word] of [[20, 'twenty'], [30, 'thirty'], [40, 'forty']] as const) {
    map.set(word, tens)
    enOnes.forEach((w, i) => map.set(`${word} ${w}`, tens + i + 1))
  }
  // Russian
  const ruOnes = ['один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  add(ruOnes, 1)
  add(['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'], 10)
  for (const [tens, word] of [[20, 'двадцать'], [30, 'тридцать'], [40, 'сорок']] as const) {
    map.set(word, tens)
    ruOnes.forEach((w, i) => map.set(`${word} ${w}`, tens + i + 1))
  }
  // Italian (with the booklets' "diciasette")
  add(['uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove', 'venti', 'ventuno', 'ventidue', 'ventitré', 'ventitre', 'ventiquattro', 'venticinque', 'ventisei', 'ventisette', 'ventotto', 'ventinove', 'trenta'], 1)
  map.set('diciasette', 17)
  map.set('ventitre', 23)
  // Spanish
  add(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'], 1)
  // French
  add(['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix sept', 'dix huit', 'dix neuf', 'vingt'], 1)
  // German
  add(['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'], 1)
  return map
})()

function latinRatio(text: string): number {
  let latin = 0
  let letters = 0
  for (const c of text) {
    if (!/\p{L}/u.test(c)) continue
    letters++
    if (c.codePointAt(0)! < 0x250) latin++
  }
  return letters === 0 ? 0 : latin / letters
}

const englishWords = new Set([
  'the', 'of', 'and', 'to', 'is', 'you', 'it', 'my', 'your', 'we', 'at', 'for', 'with', 'this', 'that', 'are', 'was',
  'have', 'what', 'where', 'how', 'please', 'he', 'she', 'they', 'his', 'her', 'our', 'will', 'from', 'on', 'not',
  'would', 'like', 'can', 'there', 'here', 'do', 'does', 'an', 'be',
])

/** Share of words that are common English function words; high for translation pages. */
export function englishRatio(text: string): number {
  const words = text.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean)
  if (words.length < 4) return 0
  return words.filter((w) => englishWords.has(w)).length / words.length
}

/** Which booklet lessons a recording covers: the range in its name ("Reading 01-10"), the lesson
 *  with its number when there's a recording per lesson, or else an even share of the booklet. */
export function unitsFor(
  track: { id: string; number: number; coverage?: [number, number] },
  readings: { id: string }[],
  all: ReadingContent[],
): { units: ReadingContent[]; estimated: boolean } {
  if (track.coverage) {
    const [low, high] = track.coverage
    return { units: all.filter((u) => u.ordinal >= low && u.ordinal <= high), estimated: false }
  }
  if (readings.length >= all.length || readings.length >= 5) {
    return { units: all.filter((u) => u.ordinal === track.number), estimated: false }
  }
  const position = readings.findIndex((r) => r.id === track.id)
  if (position < 0 || all.length === 0) return { units: [], estimated: false }
  const low = Math.floor((position * all.length) / readings.length)
  const high = Math.floor(((position + 1) * all.length) / readings.length)
  return { units: all.slice(low, Math.max(high, low + 1)), estimated: true }
}
