import { signal } from '@preact/signals'
import type { Track } from './types'

export interface TrackProgress {
  position: number
  duration: number
  completed: boolean
  completedAt?: string
  lastPlayedAt?: string
}

const empty: TrackProgress = { position: 0, duration: 0, completed: false }

export const fraction = (p: TrackProgress) =>
  p.completed ? 1 : p.duration > 0 ? Math.min(Math.max(p.position / p.duration, 0), 1) : 0
export const isInProgress = (p: TrackProgress) => !p.completed && p.position > 5
export const remaining = (p: TrackProgress) => Math.max(p.duration - p.position, 0)

interface Persisted {
  version: 1
  tracks: Record<string, TrackProgress>
  /** Seconds listened per local day, keyed `yyyy-MM-dd`. */
  dailyListening: Record<string, number>
  selectedLevelID?: string
  lastTrackID?: string
  autoplay: boolean
  learnerName: string
  rate: number
}

const storageKey = 'revisit.progress.v1'

/** A day counts towards streaks once you listen for at least a minute. */
export const activeDayThreshold = 60

function load(): Persisted {
  const fallback: Persisted = { version: 1, tracks: {}, dailyListening: {}, autoplay: true, learnerName: '', rate: 1 }
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

/**
 * Everything the app remembers between visits, kept in this browser's local storage.
 * Every change bumps `state` so views re-render, and is saved a moment later.
 */
class ProgressStore {
  readonly state = signal<Persisted>(load())
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    // Another tab saved; take its progress so the two don't overwrite each other.
    addEventListener('storage', (e) => {
      if (e.key === storageKey && e.newValue) this.state.value = load()
    })
  }

  private get s() {
    return this.state.value
  }

  private update(change: (draft: Persisted) => void) {
    const next = structuredClone(this.state.peek())
    change(next)
    this.state.value = next
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.saveNow(), 800)
  }

  saveNow() {
    clearTimeout(this.saveTimer)
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.state.peek()))
    } catch {
      // Storage full or blocked (private browsing); progress lives on for this visit.
    }
  }

  // MARK: - Settings

  get selectedLevelID() { return this.s.selectedLevelID }
  set selectedLevelID(v) { this.update((d) => { d.selectedLevelID = v }) }
  get lastTrackID() { return this.s.lastTrackID }
  set lastTrackID(v) { this.update((d) => { d.lastTrackID = v }) }
  get autoplay() { return this.s.autoplay }
  set autoplay(v) { this.update((d) => { d.autoplay = v }) }
  get learnerName() { return this.s.learnerName }
  set learnerName(v) { this.update((d) => { d.learnerName = v }) }
  get rate() { return this.s.rate }
  set rate(v) { this.update((d) => { d.rate = v }) }

  // MARK: - Tracks

  progress(id: string): TrackProgress {
    return this.s.tracks[id] ?? empty
  }

  setPosition(position: number, duration: number, id: string) {
    this.update((d) => {
      const p = { ...(d.tracks[id] ?? empty) }
      p.position = Math.max(position, 0)
      if (duration > 0) p.duration = duration
      p.lastPlayedAt = new Date().toISOString()
      d.tracks[id] = p
    })
  }

  setDurations(found: [string, number][]) {
    const changed = found.filter(([id, seconds]) => seconds > 0 && this.progress(id).duration !== seconds)
    if (changed.length === 0) return
    this.update((d) => {
      for (const [id, seconds] of changed) d.tracks[id] = { ...(d.tracks[id] ?? empty), duration: seconds }
    })
  }

  setCompleted(completed: boolean, id: string) {
    this.update((d) => {
      const p = { ...(d.tracks[id] ?? empty) }
      p.completed = completed
      p.completedAt = completed ? new Date().toISOString() : undefined
      p.position = 0
      d.tracks[id] = p
    })
  }

  restart(id: string) {
    this.update((d) => {
      d.tracks[id] = { ...(d.tracks[id] ?? empty), position: 0 }
    })
  }

  reset(ids: string[]) {
    this.update((d) => {
      for (const id of ids) {
        const p = d.tracks[id]
        if (p) d.tracks[id] = { ...p, position: 0, completed: false, completedAt: undefined }
      }
    })
  }

  completedCount(list: Track[]) {
    return list.filter((t) => this.progress(t.id).completed).length
  }

  // MARK: - Listening stats

  addListening(seconds: number, date = new Date()) {
    if (seconds <= 0) return
    const key = dayKey(date)
    this.update((d) => {
      d.dailyListening[key] = (d.dailyListening[key] ?? 0) + seconds
    })
  }

  get totalListening() {
    return Object.values(this.s.dailyListening).reduce((a, b) => a + b, 0)
  }

  get activeDays(): Set<string> {
    return new Set(Object.entries(this.s.dailyListening).filter(([, v]) => v >= activeDayThreshold).map(([k]) => k))
  }

  isActive(date: Date) {
    return this.activeDays.has(dayKey(date))
  }

  currentStreak(today = new Date()) {
    const days = this.activeDays
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (!days.has(dayKey(day))) day.setDate(day.getDate() - 1)
    let count = 0
    while (days.has(dayKey(day))) {
      count++
      day.setDate(day.getDate() - 1)
    }
    return count
  }

  bestStreak() {
    const dates = [...this.activeDays].sort()
    let best = 0
    let run = 0
    let previous: Date | undefined
    for (const key of dates) {
      const [y, m, d] = key.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      if (previous) {
        const next = new Date(previous)
        next.setDate(next.getDate() + 1)
        run = dayKey(next) === key ? run + 1 : 1
      } else {
        run = 1
      }
      best = Math.max(best, run)
      previous = date
    }
    return best
  }

  // MARK: - Backup

  exportJSON() {
    return JSON.stringify(this.state.peek(), null, 2)
  }

  importJSON(text: string) {
    const parsed = JSON.parse(text) as Partial<Persisted>
    if (typeof parsed !== 'object' || !parsed || typeof parsed.tracks !== 'object') throw new Error('Not a Revisit progress file.')
    this.update((d) => Object.assign(d, parsed))
    this.saveNow()
  }
}

export function dayKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const progress = new ProgressStore()
