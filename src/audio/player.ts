import { signal } from '@preact/signals'
import { progress } from '../model/progress'
import { type Track, trackLevelTitle, trackLongTitle } from '../model/types'
import { releaseURL, urlFor } from '../storage/sources'
import { artPNG, seedFor } from '../ui/art'

export const skipInterval = 10

/** A tiny silent WAV, played on the first tap so later (async) plays are allowed on iOS. */
const silence =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/**
 * Plays one track at a time and writes its position to the progress store, so every lesson
 * picks up where you left it, even after the page is closed.
 */
class AudioPlayer {
  readonly track = signal<Track | undefined>(undefined)
  readonly queue = signal<Track[]>([])
  readonly isPlaying = signal(false)
  readonly currentTime = signal(0)
  readonly duration = signal(0)
  readonly rate = signal(progress.rate || 1)
  readonly error = signal<string | undefined>(undefined)

  /** Called when a track plays to its end (after it has been marked completed). */
  onFinish?: (track: Track) => void

  private readonly audio = new Audio()
  private pendingSeek: number | undefined
  private playWhenReady = false
  private isReady = false
  private lastTick: number | undefined
  private unsavedListening = 0
  private lastPersist = 0
  private loadToken = 0
  private artworkURL: string | undefined
  private unlocked = false

  constructor() {
    this.audio.preload = 'auto'
    this.audio.playbackRate = this.rate.value
    this.audio.defaultPlaybackRate = this.rate.value
    this.observe()
    this.configureMediaSession()
    const unlock = () => this.unlock()
    for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, unlock, { capture: true, once: true })
    addEventListener('pagehide', () => this.persistPosition())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.persistPosition()
        progress.saveNow()
      }
    })
  }

  get remaining() {
    return Math.max(this.duration.value - this.currentTime.value, 0)
  }
  get fraction() {
    const d = this.duration.value
    return d > 0 ? Math.min(Math.max(this.currentTime.value / d, 0), 1) : 0
  }
  private get index() {
    const t = this.track.value
    return t ? this.queue.value.findIndex((q) => q.id === t.id) : -1
  }
  get hasNext() {
    const i = this.index
    return i >= 0 && i + 1 < this.queue.value.length
  }
  get hasPrevious() {
    return this.index > 0
  }

  /** iOS only lets audio start from a tap; playing silence once on the first tap unlocks the element. */
  private unlock() {
    if (this.unlocked) return
    this.unlocked = true
    if (this.audio.src) return
    this.audio.src = silence
    this.audio.play().then(
      () => {
        if (this.audio.src === silence) {
          this.audio.pause()
          this.audio.removeAttribute('src')
        }
      },
      () => {},
    )
  }

  // MARK: - Loading

  load(track: Track, queue: Track[], autoplay: boolean) {
    this.queue.value = queue
    if (this.track.value?.id === track.id) {
      if (autoplay) this.play()
      return
    }
    this.persistPosition()
    const previous = this.track.value
    this.error.value = undefined
    this.track.value = track
    progress.lastTrackID = track.id
    const saved = progress.progress(track.id)
    this.duration.value = saved.duration
    // Resume a couple of seconds early so the sentence you were on isn't cut.
    const resumeAt =
      saved.position > 5 && (saved.duration === 0 || saved.position < saved.duration - 10) ? Math.max(saved.position - 2, 0) : 0
    this.currentTime.value = resumeAt
    this.pendingSeek = resumeAt > 0 ? resumeAt : undefined
    this.playWhenReady = autoplay
    this.isReady = false
    this.lastTick = undefined
    const token = ++this.loadToken
    this.isPlaying.value = false
    // Start the element synchronously while we're still inside the tap, then swap in the real file.
    this.audio.pause()
    if (autoplay) {
      this.audio.src = silence
      this.audio.play().catch(() => {})
    }
    void urlFor(track.file).then(
      (url) => {
        if (token !== this.loadToken) return
        if (previous) releaseURL(previous.file)
        this.audio.src = url
        this.audio.playbackRate = this.rate.value
        this.audio.load()
        if (this.playWhenReady) this.audio.play().catch(() => {})
      },
      (e: Error) => {
        if (token === this.loadToken) this.error.value = e.message
      },
    )
    this.updateMetadata()
  }

  unload() {
    this.persistPosition()
    this.loadToken++
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    const t = this.track.value
    if (t) releaseURL(t.file)
    this.track.value = undefined
    this.queue.value = []
    this.isPlaying.value = false
    this.currentTime.value = 0
    this.duration.value = 0
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  }

  // MARK: - Transport

  play() {
    if (!this.track.value) return
    if (this.isReady) this.audio.play().catch((e: Error) => this.playFailed(e))
    else this.playWhenReady = true
  }

  pause() {
    this.playWhenReady = false
    this.audio.pause()
    this.persistPosition()
  }

  togglePlayPause() {
    if (this.isPlaying.value || this.playWhenReady) this.pause()
    else this.play()
  }

  seek(seconds: number) {
    const upper = this.duration.value > 0 ? this.duration.value : seconds
    const target = Math.min(Math.max(seconds, 0), upper)
    this.currentTime.value = target
    this.lastTick = undefined
    if (this.isReady && this.pendingSeek === undefined) this.audio.currentTime = target
    else this.pendingSeek = target
    this.persistPosition()
    this.updatePosition()
  }

  skip(delta: number) {
    this.seek(this.currentTime.value + delta)
  }

  next() {
    const i = this.index
    if (i >= 0 && i + 1 < this.queue.value.length) this.load(this.queue.value[i + 1], this.queue.value, this.isPlaying.value)
  }

  previous() {
    const i = this.index
    if (i > 0) this.load(this.queue.value[i - 1], this.queue.value, this.isPlaying.value)
    else this.seek(0)
  }

  restart() {
    const t = this.track.value
    if (!t) return
    progress.restart(t.id)
    this.seek(0)
  }

  setRate(rate: number) {
    this.rate.value = rate
    progress.rate = rate
    this.audio.playbackRate = rate
    this.audio.defaultPlaybackRate = rate
    this.updatePosition()
  }

  // MARK: - Progress

  persistPosition() {
    // Until the file is ready and the resume seek has landed, the stored position is still the truth.
    const t = this.track.value
    if (!t || !this.isReady || this.pendingSeek !== undefined) return
    if (this.unsavedListening > 0) {
      progress.addListening(this.unsavedListening)
      this.unsavedListening = 0
    }
    this.lastPersist = Date.now()
    progress.setPosition(this.currentTime.value, this.duration.value, t.id)
  }

  private tick() {
    const seconds = this.audio.currentTime
    // Ignore the zero a new file reports before its resume seek is applied.
    if (!Number.isFinite(seconds) || !this.isReady || this.pendingSeek !== undefined) return
    this.currentTime.value = seconds
    const t = this.track.value
    if (this.audio.paused || !t) {
      this.lastTick = undefined
      return
    }
    if (this.lastTick !== undefined) {
      const delta = seconds - this.lastTick
      if (delta > 0 && delta < 3) this.unsavedListening += delta / Math.max(this.rate.value, 0.1)
    }
    this.lastTick = seconds
    // Pimsleur lessons end with a few seconds of credits; count them as done near the end.
    const d = this.duration.value
    if (d > 120 && seconds >= d - 8 && !progress.progress(t.id).completed) {
      progress.setCompleted(true, t.id)
      progress.setPosition(seconds, d, t.id)
    }
    if (Date.now() - this.lastPersist >= 5000) this.persistPosition()
    this.updatePosition()
  }

  private didFinish() {
    const t = this.track.value
    if (!t) return
    if (this.unsavedListening > 0) {
      progress.addListening(this.unsavedListening)
      this.unsavedListening = 0
    }
    progress.setCompleted(true, t.id)
    this.currentTime.value = 0
    this.audio.currentTime = 0
    this.onFinish?.(t)
  }

  private playFailed(e: Error) {
    if (e.name === 'NotAllowedError') this.playWhenReady = false
    else if (e.name !== 'AbortError') this.error.value = "This audio file can't be played."
  }

  // MARK: - Element events

  private observe() {
    const a = this.audio
    a.addEventListener('loadedmetadata', () => {
      if (a.src.startsWith('data:')) return
      this.isReady = true
      const t = this.track.value
      if (Number.isFinite(a.duration) && a.duration > 0) {
        this.duration.value = a.duration
        if (t) progress.setDurations([[t.id, a.duration]])
      }
      if (this.pendingSeek !== undefined) a.currentTime = this.pendingSeek
      if (this.playWhenReady) {
        this.playWhenReady = false
        a.play().catch((e: Error) => this.playFailed(e))
      }
      this.updatePosition()
    })
    a.addEventListener('seeked', () => {
      if (this.pendingSeek !== undefined && Math.abs(a.currentTime - this.pendingSeek) < 1.5) this.pendingSeek = undefined
      this.tick()
    })
    a.addEventListener('timeupdate', () => this.tick())
    a.addEventListener('play', () => this.setPlaying(true))
    a.addEventListener('pause', () => this.setPlaying(false))
    a.addEventListener('ended', () => {
      this.setPlaying(false)
      this.didFinish()
    })
    a.addEventListener('error', () => {
      if (!a.src || a.src.startsWith('data:')) return
      this.error.value = "This audio file can't be played."
      this.playWhenReady = false
    })
  }

  private setPlaying(playing: boolean) {
    if (this.audio.src.startsWith('data:')) return
    if (playing === this.isPlaying.value) return
    this.isPlaying.value = playing
    if (!playing) this.persistPosition()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }

  // MARK: - Lock screen

  private configureMediaSession() {
    if (!('mediaSession' in navigator)) return
    const s = navigator.mediaSession
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => this.play()],
      ['pause', () => this.pause()],
      ['seekbackward', (d) => this.skip(-(d.seekOffset ?? skipInterval))],
      ['seekforward', (d) => this.skip(d.seekOffset ?? skipInterval)],
      ['previoustrack', () => this.previous()],
      ['nexttrack', () => this.next()],
      ['seekto', (d) => d.seekTime !== undefined && this.seek(d.seekTime)],
    ]
    for (const [action, handler] of handlers) {
      try {
        s.setActionHandler(action, handler)
      } catch {
        // Not supported by this browser.
      }
    }
  }

  private async updateMetadata() {
    if (!('mediaSession' in navigator)) return
    const t = this.track.value
    if (!t) return
    const metadata = new MediaMetadata({ title: trackLongTitle(t), artist: trackLevelTitle(t), album: 'Revisit' })
    navigator.mediaSession.metadata = metadata
    const url = await artPNG(seedFor(t))
    if (this.track.value?.id !== t.id || !url) return
    if (this.artworkURL) URL.revokeObjectURL(this.artworkURL)
    this.artworkURL = url
    metadata.artwork = [{ src: url, sizes: '512x512', type: 'image/png' }]
  }

  private updatePosition() {
    const d = this.duration.value
    if (!('mediaSession' in navigator) || !(d > 0)) return
    try {
      navigator.mediaSession.setPositionState({
        duration: d,
        position: Math.min(this.currentTime.value, d),
        playbackRate: this.rate.value,
      })
    } catch {
      // Position state is optional.
    }
  }
}

export const player = new AudioPlayer()
