import { type Course, type FileRef, type Level, type SourceID, type Track, type TrackKind, LibraryKey } from './types'

/**
 * Turns a list of file paths into courses.
 *
 * Expected layout (flexible):
 *
 *     Russian/                 ← course (language)
 *       Level 1/               ← level: lesson audio directly inside
 *         …_U01_Lesson.mp3
 *         Readings/            ← any sub-folder with "read" in its name
 *           …_Unit01_Reading.mp3
 *           Booklet.pdf
 *
 * A folder of courses (e.g. `Languages/Russian/…`) and a lone level folder also work.
 */

export const audioExtensions = new Set(['mp3', 'm4a', 'm4b', 'aac', 'wav', 'aif', 'aiff', 'caf', 'flac', 'ogg', 'opus'])
const ignoredNames = new Set(['inbox', '.trash', '__macosx'])

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
export const naturalCompare = (a: string, b: string) => collator.compare(a, b)

interface Dir {
  name: string
  dirs: Map<string, Dir>
  files: FileRef[]
}

const ext = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase()
const base = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const stem = (path: string) => {
  const name = base(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
const isAudio = (f: FileRef) => audioExtensions.has(ext(f.path))
const isPDF = (f: FileRef) => ext(f.path) === 'pdf'
const byName = (a: FileRef, b: FileRef) => naturalCompare(base(a.path), base(b.path))

function buildTree(files: FileRef[]): Dir {
  const root: Dir = { name: '', dirs: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    if (parts.some((p) => p.startsWith('.') || ignoredNames.has(p.toLowerCase()))) continue
    let dir = root
    for (const part of parts.slice(0, -1)) {
      let next = dir.dirs.get(part)
      if (!next) {
        next = { name: part, dirs: new Map(), files: [] }
        dir.dirs.set(part, next)
      }
      dir = next
    }
    dir.files.push(file)
  }
  return root
}

const subdirectories = (dir: Dir) => [...dir.dirs.values()]
const allFiles = (dir: Dir): FileRef[] => [...dir.files, ...subdirectories(dir).flatMap(allFiles)]

export function scan(files: FileRef[]): Course[] {
  const root = buildTree(files)
  const found: Course[] = []
  for (const dir of subdirectories(root)) collect(dir, [], found)
  // Loose level files at the top (e.g. picked one by one on a phone) still form a level.
  if (lessonAudioCount(root) > 0) {
    const name = guessLanguage(root.files) ?? 'My Course'
    const course = makeCourse(name, root, [root], true)
    if (course) found.push(course)
  }
  return merge(found)
}

function collect(dir: Dir, parents: Dir[], courses: Course[]) {
  const levelFolders = subdirectories(dir).filter(isLevelFolder)
  if (levelFolders.length > 0) {
    const course = makeCourse(dir.name, dir, levelFolders, false)
    if (course) courses.push(course)
  } else if (isLevelFolder(dir)) {
    const name =
      courseName(dir.name) ?? parents[parents.length - 1]?.name ?? guessLanguage(allFiles(dir)) ?? 'My Course'
    const course = makeCourse(name, dir, [dir], true)
    if (course) courses.push(course)
  } else {
    for (const sub of subdirectories(dir)) collect(sub, [...parents, dir], courses)
  }
}

function isLevelFolder(dir: Dir): boolean {
  if (isReadingName(dir.name) || lessonAudioCount(dir) === 0) return false
  // A folder whose sub-folders hold whole levels is a course with some extra audio
  // (like Pimsleur's "User's Guide.mp3"), not a level itself.
  return !subdirectories(dir).some((sub) => !isReadingName(sub.name) && lessonAudioCount(sub) >= 3)
}

function lessonAudioCount(dir: Dir): number {
  return dir.files.filter((f) => isAudio(f) && !isReadingName(base(f.path))).length
}

function makeCourse(name: string, folder: Dir, levelFolders: Dir[], isLevel: boolean): Course | undefined {
  const sorted = [...levelFolders].sort((a, b) => naturalCompare(a.name, b.name))
  const numbers = uniqueNumbers(sorted.map((d) => (d === folder && isLevel ? levelNumberFromFiles(d) : levelNumber(d.name))))
  const levels = sorted
    .map((dir, i) => makeLevel(dir, numbers[i], name))
    .filter((l) => l.lessons.length > 0)
    .sort((a, b) => a.number - b.number)
  const first = levels[0]
  if (!first) return undefined

  // Files next to the level folders are course-wide extras (user's guide, method guide).
  if (!isLevel) {
    const guides: Track[] = folder.files
      .filter(isAudio)
      .sort(byName)
      .map((file, i) => ({
        id: `${LibraryKey.course(name)}|guide|${stem(file.path).toLowerCase()}`,
        kind: 'guide',
        number: i + 1,
        file,
        levelID: first.id,
        levelNumber: first.number,
        courseName: name,
        name: guideName(stem(file.path), name),
      }))
    const documents = folder.files.filter(isPDF).sort(byName)
    for (const level of levels) {
      level.guides = guides
      level.guideDocuments = documents
    }
  }
  return { id: LibraryKey.course(name), name, levels }
}

function makeLevel(folder: Dir, number: number, courseName: string): Level {
  const lessonFiles: FileRef[] = []
  const readingFiles: FileRef[] = []
  const booklets: FileRef[] = []

  for (const file of folder.files.filter(isAudio)) {
    ;(isReadingName(base(file.path)) ? readingFiles : lessonFiles).push(file)
  }
  for (const sub of subdirectories(folder)) {
    const subIsReading = isReadingName(sub.name)
    for (const file of allFiles(sub)) {
      if (isAudio(file)) {
        ;(subIsReading || isReadingName(base(file.path)) ? readingFiles : lessonFiles).push(file)
      } else if (isPDF(file)) {
        booklets.push(file)
      }
    }
  }
  booklets.push(...folder.files.filter(isPDF))

  const levelID = LibraryKey.level(courseName, number)
  const tracks = (files: FileRef[], kind: TrackKind): Track[] => {
    const sorted = [...files].sort(byName)
    const numbers = uniqueNumbers(sorted.map((f) => trackNumber(base(f.path))))
    return sorted
      .map(
        (file, i): Track => ({
          id: LibraryKey.track(levelID, kind, numbers[i]),
          kind,
          number: numbers[i],
          file,
          levelID,
          levelNumber: number,
          courseName,
          coverage: kind === 'reading' ? coverage(base(file.path)) : undefined,
        }),
      )
      .sort((a, b) => a.number - b.number)
  }

  const readings = tracks(readingFiles, 'reading')
  if (readings.length < 5) for (const r of readings) if (!r.coverage) r.isPart = true
  return {
    id: levelID,
    number,
    courseName,
    lessons: tracks(lessonFiles, 'lesson'),
    readings,
    booklets: booklets.sort(byName),
    guides: [],
    guideDocuments: [],
  }
}

/** Courses with the same name (e.g. levels imported one at a time) become one course. */
function merge(courses: Course[]): Course[] {
  const byID = new Map<string, Course>()
  for (const course of courses) {
    const existing = byID.get(course.id)
    if (!existing) {
      byID.set(course.id, course)
      continue
    }
    const levels = [...existing.levels]
    for (const level of course.levels) if (!levels.some((l) => l.number === level.number)) levels.push(level)
    const guides = existing.levels[0]?.guides.length ? existing.levels[0].guides : course.levels[0]?.guides ?? []
    const documents = existing.levels[0]?.guideDocuments.length
      ? existing.levels[0].guideDocuments
      : course.levels[0]?.guideDocuments ?? []
    for (const level of levels) {
      level.guides = guides
      level.guideDocuments = documents
    }
    byID.set(course.id, { ...existing, levels: levels.sort((a, b) => a.number - b.number) })
  }
  return [...byID.values()].sort((a, b) => naturalCompare(a.name, b.name))
}

// MARK: - Name parsing

export const isReadingName = (name: string) => /read/i.test(name)

/** "Pimsleur Italian - User's Guide" → "User's Guide". */
export function guideName(stem: string, course: string): string {
  let name = stem
  for (const prefix of ['Pimsleur', course]) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) name = name.slice(prefix.length)
    name = name.replace(/^[\s\-_–·]+|[\s\-_–·]+$/g, '')
  }
  return name || stem
}

function lastCapture(pattern: RegExp, text: string): string | undefined {
  const matches = [...text.matchAll(pattern)]
  return matches[matches.length - 1]?.[1]
}

/** `9781442382848_Russian1_U01_Lesson.mp3` → 1, `Russian_5_Reading_Lesson_07.mp3` → 7,
 *  `Unit 12.mp3` → 12, `Spanish I - 05.mp3` → 5. */
export function trackNumber(filename: string): number | undefined {
  const name = filename.replace(/\.[^.]+$/, '')
  const keyword =
    /(?<![A-Za-z])(?:unit|lesson|lektion|lecci[oó]n|le[cç]on|lezione|li[cç][aã]o|reading|track|part|u)[\s_\-.#]*0*(\d{1,3})(?!\d)/gi
  const k = lastCapture(keyword, name)
  if (k !== undefined) return Number(k)
  const n = lastCapture(/(?<!\d)(\d{1,3})(?!\d)/g, name)
  return n === undefined ? undefined : Number(n)
}

/** `Pimsleur Italian 5 - Reading 01-10.mp3` → [1, 10]: one recording holding several reading lessons. */
export function coverage(filename: string): [number, number] | undefined {
  const name = filename.replace(/\.[^.]+$/, '')
  const m = /(?<![A-Za-z])(?:readings?|units?|lessons?)[\s_\-.#]*0*(\d{1,3})\s*[-–_]\s*0*(\d{1,3})(?!\d)/i.exec(name)
  if (!m) return undefined
  const low = Number(m[1])
  const high = Number(m[2])
  return low < high ? [low, high] : undefined
}

/** `Level 3` → 3, `Level IV` → 4, `Russian II` → 2, `Nivel 2` → 2. */
export function levelNumber(name: string): number | undefined {
  const value = lastCapture(/(?:level|niveau|nivel|stufe|livello|уровень)\s*[-_]?\s*(\d{1,2}|[ivx]{1,5})(?![\p{L}\d])/giu, name)
  if (value !== undefined) return /^\d+$/.test(value) ? Number(value) : romanValue(value)
  const n = lastCapture(/(?<!\d)(\d{1,2})\s*$/g, name)
  if (n !== undefined) return Number(n)
  const roman = lastCapture(/(?<![A-Za-z])([IVX]{1,5})\s*$/g, name)
  return roman ? romanValue(roman) : undefined
}

/** A lone level's number from its files: `Pimsleur Italian 3 - Unit 01.mp3` → 3. */
function levelNumberFromFiles(dir: Dir): number | undefined {
  for (const file of dir.files) {
    const n = pathHint(base(file.path))?.level
    if (n) return n
  }
  return levelNumber(dir.name)
}

/** `Russian Level 1` → `Russian`; `Level 1` → undefined. */
export function courseName(folderName: string): string | undefined {
  const stripped = folderName
    .replace(/(?:^|[\s_\-]+)(?:(?:level|niveau|nivel|stufe|livello)[\s_\-]*)?(?:\d{1,2}|[ivx]{1,5})\s*$/i, '')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
  return stripped || undefined
}

/** Keeps parsed numbers when they are all present and distinct; otherwise numbers files by sort order. */
export function uniqueNumbers(parsed: (number | undefined)[]): number[] {
  const values = parsed.filter((v): v is number => v !== undefined)
  if (values.length === parsed.length && new Set(values).size === values.length && !values.includes(0)) return values
  return parsed.map((_, i) => i + 1)
}

function romanValue(s: string): number | undefined {
  const map: Record<string, number> = { i: 1, v: 5, x: 10 }
  const chars = s.toLowerCase().split('')
  let total = 0
  for (let i = 0; i < chars.length; i++) {
    const v = map[chars[i]]
    if (!v) return undefined
    const next = map[chars[i + 1]]
    total += next && next > v ? -v : v
  }
  return total > 0 ? total : undefined
}

// MARK: - Files picked without their folders

const languages = [
  'Russian', 'Italian', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Mandarin', 'Chinese', 'Cantonese',
  'Korean', 'Arabic', 'Hebrew', 'Hindi', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish', 'Czech',
  'Greek', 'Turkish', 'Ukrainian', 'Vietnamese', 'Thai', 'Indonesian', 'Irish', 'Hungarian', 'Romanian', 'Croatian',
  'Serbian', 'Bulgarian', 'Persian', 'Farsi', 'Swahili', 'Tagalog', 'English', 'Albanian', 'Armenian', 'Lithuanian',
]

/** `9781442382831_Russian2_U10_Lesson.mp3` → Russian, level 2. */
export function pathHint(filename: string): { language: string; level?: number } | undefined {
  for (const language of languages) {
    const m = new RegExp(`(?<![A-Za-z])${language}(?![a-z])[\\s_\\-]*(?:level[\\s_\\-]*)?(\\d{1,2}|[IVX]{1,4}(?![A-Za-z]))?`, 'i').exec(
      filename,
    )
    if (m) {
      const raw = m[1]
      const level = raw === undefined ? undefined : /^\d+$/.test(raw) ? Number(raw) : romanValue(raw)
      return { language, level }
    }
  }
  return undefined
}

function guessLanguage(files: FileRef[]): string | undefined {
  for (const f of files) {
    const hint = pathHint(base(f.path))
    if (hint) return hint.language
  }
  return undefined
}

/**
 * Picks a folder path for a file that arrived without one (phones can't pick folders):
 * `Pimsleur Italian 5 - Unit 12.mp3` → `Italian/Level 5/Pimsleur Italian 5 - Unit 12.mp3`.
 */
export function placeLooseFile(filename: string, batchLanguage?: string): string {
  const hint = pathHint(filename)
  const course = hint?.language ?? batchLanguage ?? 'My Course'
  // "User's Guide.mp3" and "The Pimsleur Guide.pdf" belong to the whole course.
  if (!hint?.level && /guide/i.test(filename)) return `${course}/${filename}`
  const level = hint?.level ?? 1
  const inReadings = isReadingName(filename) || ext(filename) === 'pdf' || /bklt|booklet/i.test(filename)
  return `${course}/Level ${level}/${inReadings ? 'Readings/' : ''}${filename}`
}

export const fileName = base
export const fileStem = stem
export type { SourceID }
