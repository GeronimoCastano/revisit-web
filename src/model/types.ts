export type TrackKind = 'lesson' | 'reading' | 'guide'

/** Where a file's bytes live: imported into this browser, or served by the local dev server. */
export type SourceID = 'idb' | 'dev'

export interface FileRef {
  source: SourceID
  /** Path inside the source, e.g. `Italian/Level 1/Reading/Pimsleur Italian 1 - Reading booklet.pdf`. */
  path: string
}

/** One playable audio file: a core lesson, a reading lesson, or a course guide. */
export interface Track {
  /** Stable progress key, e.g. `russian|L1|lesson|5`. Survives re-imports of the same course. */
  id: string
  kind: TrackKind
  number: number
  file: FileRef
  levelID: string
  levelNumber: number
  courseName: string
  /** Reading lessons a single recording covers, from names like "Reading 01-10". */
  coverage?: [number, number]
  /** One of a few long recordings that together hold all of a level's reading lessons. */
  isPart?: boolean
  /** Display name for guides, taken from the file name. */
  name?: string
}

export interface Level {
  id: string
  number: number
  courseName: string
  lessons: Track[]
  readings: Track[]
  booklets: FileRef[]
  /** Course-wide guide audio and documents (the same for every level of the course). */
  guides: Track[]
  guideDocuments: FileRef[]
}

export interface Course {
  id: string
  name: string
  levels: Level[]
}

export function trackTitle(t: Track): string {
  switch (t.kind) {
    case 'lesson':
      return `Lesson ${t.number}`
    case 'reading':
      if (t.coverage) return `Readings ${t.coverage[0]}–${t.coverage[1]}`
      return t.isPart ? `Readings, Part ${t.number}` : `Reading ${t.number}`
    case 'guide':
      return t.name ?? 'Guide'
  }
}

export function trackLongTitle(t: Track): string {
  switch (t.kind) {
    case 'lesson':
      return `Lesson ${t.number}`
    case 'reading':
      if (t.coverage) return `Reading Lessons ${t.coverage[0]}–${t.coverage[1]}`
      return t.isPart ? `Readings, Part ${t.number}` : `Reading Lesson ${t.number}`
    case 'guide':
      return t.name ?? 'Guide'
  }
}

export const levelTitle = (l: Level) => `${l.courseName} Level ${l.number}`
/** The level a track belongs to, e.g. "Russian Level 3". */
export const trackLevelTitle = (t: Track) => `${t.courseName} Level ${t.levelNumber}`

/** True when there's one recording per reading lesson; older courses instead put
 *  many reading lessons into a couple of long recordings. */
export function hasReadingPerLesson(level: Level): boolean {
  return level.readings.length >= 5 && level.readings.every((r) => !r.coverage)
}

/** Pimsleur attaches reading lessons to the last lessons of a level
 *  (e.g. 16 readings in a 30-lesson level begin in Lesson 15). */
export function readingsBeginAtLesson(level: Level): number | undefined {
  const last = level.lessons[level.lessons.length - 1]?.number
  if (!hasReadingPerLesson(level) || last === undefined) return undefined
  // Levels have 30 lessons; count from 30 even when the last few files are missing.
  const total = last >= 25 ? Math.max(last, 30) : last
  return Math.max(1, total - level.readings.length + 1)
}

export function readingForLesson(level: Level, lesson: number): Track | undefined {
  const start = readingsBeginAtLesson(level)
  if (start === undefined || lesson < start) return undefined
  return level.readings[lesson - start]
}

export function tracksOf(level: Level, kind: TrackKind): Track[] {
  return kind === 'lesson' ? level.lessons : kind === 'reading' ? level.readings : level.guides
}

export const LibraryKey = {
  course: (name: string) =>
    name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim(),
  level: (course: string, number: number) => `${LibraryKey.course(course)}|L${number}`,
  track: (levelID: string, kind: TrackKind, number: number) => `${levelID}|${kind}|${number}`,
}

export const fileKey = (f: FileRef) => `${f.source}:${f.path}`
