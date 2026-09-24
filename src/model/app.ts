import { batch, computed, signal } from '@preact/signals'
import { player } from '../audio/player'
import { deletePaths } from '../storage/idb'
import { type ImportProgress, type Picked, expandZips, importFiles, placeFiles } from '../storage/importer'
import { listAllFiles, releaseURL, urlFor } from '../storage/sources'
import { isInProgress, progress } from './progress'
import { scan } from './scanner'
import { type Course, type FileRef, type Level, type Track, type TrackKind, tracksOf } from './types'

export type Tab = 'learn' | 'reading' | 'me'
export type PlayerRoute = 'lesson' | 'reading'

export interface FinishedNotice {
  id: number
  track: Track
  next?: Track
  autoplayed: boolean
}

export interface BookletRoute {
  file: FileRef
  page?: number
  title: string
}

export const courses = signal<Course[]>([])
export const hasScanned = signal(false)
export const tab = signal<Tab>('learn')
export const playerRoute = signal<PlayerRoute | undefined>(undefined)
export const finished = signal<FinishedNotice | undefined>(undefined)
export const booklet = signal<BookletRoute | undefined>(undefined)
export const showCoursePicker = signal(false)
export const showLessonList = signal<{ level: Level; kind: TrackKind } | undefined>(undefined)
export const drivingMode = signal(false)
export const importing = signal<ImportProgress | undefined>(undefined)
export const message = signal<string | undefined>(undefined)

player.onFinish = (t) => trackFinished(t)

// MARK: - Selection

const allLevels = computed(() => courses.value.flatMap((c) => c.levels))

export const levelByID = (id?: string) => allLevels.value.find((l) => l.id === id)
export const courseOf = (level: Level) => courses.value.find((c) => c.levels.some((l) => l.id === level.id))
export const trackByID = (id?: string) =>
  id === undefined
    ? undefined
    : allLevels.value.flatMap((l) => [...l.lessons, ...l.readings, ...l.guides]).find((t) => t.id === id)

export const currentLevel = computed(() => {
  progress.state.value
  return levelByID(progress.selectedLevelID) ?? courses.value[0]?.levels[0]
})

export function select(level: Level) {
  progress.selectedLevelID = level.id
}

/** The lesson to put in front of the learner: the one they're in the middle of,
 *  otherwise the first unfinished one after their last completed lesson. */
export function suggestedLesson(level: Level): Track | undefined {
  const current = player.track.value
  if (current && current.kind === 'lesson' && current.levelID === level.id && !progress.progress(current.id).completed) {
    return current
  }
  const lastPlayed = (t: Track) => progress.progress(t.id).lastPlayedAt ?? ''
  const inProgress = level.lessons
    .filter((t) => isInProgress(progress.progress(t.id)))
    .sort((a, b) => lastPlayed(b).localeCompare(lastPlayed(a)))[0]
  if (inProgress) return inProgress
  const lastDone = [...level.lessons].reverse().find((t) => progress.progress(t.id).completed)
  if (lastDone) {
    const next = level.lessons.find((t) => t.number > lastDone.number && !progress.progress(t.id).completed)
    if (next) return next
  }
  return level.lessons.find((t) => !progress.progress(t.id).completed) ?? level.lessons[level.lessons.length - 1]
}

export function suggestedReading(level: Level): Track | undefined {
  return (
    level.readings.find((t) => isInProgress(progress.progress(t.id))) ??
    level.readings.find((t) => !progress.progress(t.id).completed) ??
    level.readings[0]
  )
}

// MARK: - Playback

export function play(track: Track, present = true) {
  const level = levelByID(track.levelID)
  const queue = level ? tracksOf(level, track.kind) : [track]
  player.load(track, queue, true)
  if (present) playerRoute.value = routeFor(track)
}

export function openPlayer() {
  const t = player.track.value
  if (t) playerRoute.value = routeFor(t)
}

const routeFor = (t: Track): PlayerRoute => (t.kind === 'reading' ? 'reading' : 'lesson')

export function toggleCompleted(track: Track) {
  const done = !progress.progress(track.id).completed
  progress.setCompleted(done, track.id)
  if (player.track.value?.id === track.id && !done) player.seek(0)
}

function trackFinished(track: Track) {
  const level = levelByID(track.levelID)
  const list = level ? tracksOf(level, track.kind) : []
  const i = list.findIndex((t) => t.id === track.id)
  const next = i >= 0 ? list[i + 1] : undefined
  finished.value = { id: Date.now(), track, next, autoplayed: progress.autoplay && !!next }
  if (progress.autoplay && next) player.load(next, list, true)
}

// MARK: - Library

export async function refreshLibrary() {
  const files = await listAllFiles()
  batch(() => {
    courses.value = scan(files)
    hasScanned.value = true
  })
  reconcile()
}

/** Keeps the selected level and the loaded track valid after the library changes. */
function reconcile() {
  if (!levelByID(progress.selectedLevelID)) {
    const first = courses.value[0]?.levels[0]
    if (first) progress.selectedLevelID = first.id
  }
  const current = player.track.value
  if (!current) {
    const last = trackByID(progress.lastTrackID)
    if (last) {
      const level = levelByID(last.levelID)
      player.load(last, level ? tracksOf(level, last.kind) : [last], false)
    }
  } else if (!trackByID(current.id)) {
    player.unload()
    playerRoute.value = undefined
  }
  void probeDurations()
}

let probing = false

/** Reads each file's length once so cards can say "27 min" before a lesson is ever played. */
async function probeDurations() {
  if (probing) return
  const missing = allLevels.value
    .flatMap((l) => [...l.lessons, ...l.readings, ...l.guides])
    .filter((t) => progress.progress(t.id).duration === 0)
  if (missing.length === 0) return
  probing = true
  const found: [string, number][] = []
  const probe = document.createElement('audio')
  probe.preload = 'metadata'
  probe.muted = true
  try {
    for (const track of missing) {
      const seconds = await new Promise<number>((resolve) => {
        const timer = setTimeout(() => done(), 8000)
        const done = () => {
          clearTimeout(timer)
          probe.onloadedmetadata = probe.onerror = null
          resolve(probe.duration)
        }
        probe.onloadedmetadata = done
        probe.onerror = done
        urlFor(track.file).then((url) => (probe.src = url), done)
      })
      if (track.file.source === 'idb' && player.track.value?.id !== track.id) releaseURL(track.file)
      if (Number.isFinite(seconds) && seconds > 0) found.push([track.id, seconds])
      if (found.length >= 20) progress.setDurations(found.splice(0))
    }
  } finally {
    probe.removeAttribute('src')
    progress.setDurations(found)
    probing = false
  }
}

export async function importPicked(picked: Picked[]) {
  let files: ReturnType<typeof placeFiles>
  try {
    files = placeFiles(await expandZips(picked))
  } catch (e) {
    message.value = `Couldn't open that file: ${(e as Error).message}`
    return
  }
  if (files.length === 0) {
    message.value = 'No audio or PDF files there. Pick the language folder (for example “Italian”) or a .zip of it.'
    return
  }
  const before = new Set(allLevels.value.map((l) => l.id))
  try {
    await importFiles(files, (p) => (importing.value = p))
  } catch (e) {
    message.value =
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'The browser ran out of storage space. Free some space or import one level at a time.'
        : `Import stopped: ${(e as Error).message}`
  } finally {
    importing.value = undefined
  }
  await refreshLibrary()
  const fresh = allLevels.value.find((l) => !before.has(l.id))
  if (fresh) {
    select(fresh)
    tab.value = 'learn'
  }
}

/** Removes a course's imported files from this browser. Progress is kept. */
export async function deleteCourse(course: Course) {
  const t = player.track.value
  if (t && course.levels.some((l) => l.id === t.levelID)) {
    player.unload()
    playerRoute.value = undefined
  }
  const files = course.levels.flatMap((l) => [
    ...[...l.lessons, ...l.readings, ...l.guides].map((x) => x.file),
    ...l.booklets,
    ...l.guideDocuments,
  ])
  await deletePaths([...new Set(files.filter((f) => f.source === 'idb').map((f) => f.path))])
  await refreshLibrary()
}

export const isImported = (course: Course) =>
  course.levels.some((l) => l.lessons.some((t) => t.file.source === 'idb'))

export function greeting(courseName?: string) {
  const hour = new Date().getHours()
  const lang = courseName?.toLowerCase() ?? ''
  const table: Record<string, [string, string, string]> = {
    italian: ['Buongiorno!', 'Buon pomeriggio!', 'Buonasera!'],
    russian: ['Доброе утро!', 'Добрый день!', 'Добрый вечер!'],
    spanish: ['¡Buenos días!', '¡Buenas tardes!', '¡Buenas noches!'],
    french: ['Bonjour !', 'Bon après-midi !', 'Bonsoir !'],
    german: ['Guten Morgen!', 'Guten Tag!', 'Guten Abend!'],
    portuguese: ['Bom dia!', 'Boa tarde!', 'Boa noite!'],
  }
  const words = Object.entries(table).find(([k]) => lang.includes(k))?.[1] ?? ['Good morning!', 'Good afternoon!', 'Good evening!']
  return hour < 12 ? words[0] : hour < 18 ? words[1] : words[2]
}
