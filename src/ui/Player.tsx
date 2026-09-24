import { useRef, useState } from 'preact/hooks'
import { player, skipInterval } from '../audio/player'
import { drivingMode, levelByID, play, playerRoute, showLessonList, suggestedReading, toggleCompleted } from '../model/app'
import { progress } from '../model/progress'
import { type Track, readingForLesson, readingsBeginAtLesson, trackTitle } from '../model/types'
import { seedFor } from './art'
import { Art, Toggle, useEscape } from './common'
import { clock } from './format'
import {
  Back10,
  BookOpen,
  Car,
  Check,
  ChevronDown,
  Ellipsis,
  Forward10,
  Gauge,
  List,
  Pause,
  Play,
  Repeat,
  Restart,
  SkipBack,
  SkipForward,
} from './icons'

export const speeds = [0.75, 0.9, 1, 1.1, 1.25, 1.5]

export function LessonPlayer() {
  const track = player.track.value
  const [menu, setMenu] = useState(false)
  const [speedSheet, setSpeedSheet] = useState(false)
  const close = () => (playerRoute.value = undefined)
  useEscape(close)
  progress.state.value
  if (!track) return null
  const level = levelByID(track.levelID)
  const done = progress.progress(track.id).completed

  return (
    <div class="sheet" role="dialog" aria-label={`${trackTitle(track)} player`}>
      <div class="sheet-body player">
        <div class="topbar" style={{ width: '100%' }}>
          <button class="icon-btn" onClick={close} aria-label="Close player">
            <ChevronDown size={28} />
          </button>
          <span class="chip">{track.courseName} · Level {track.levelNumber}</span>
          <button class="icon-btn" onClick={() => setMenu(!menu)} aria-label="More" aria-expanded={menu}>
            <Ellipsis size={24} />
          </button>
        </div>
        {menu && (
          <div class="menu" role="menu" onClick={() => setMenu(false)}>
            <button role="menuitem" onClick={() => player.restart()}>
              <Restart size={20} /> Restart {track.kind === 'lesson' ? 'lesson' : 'from the start'}
            </button>
            <button role="menuitem" onClick={() => toggleCompleted(track)}>
              <Check size={20} /> {done ? 'Mark as not finished' : 'Mark as finished'}
            </button>
            <button role="menuitem" onClick={() => (progress.autoplay = !progress.autoplay)}>
              <Repeat size={20} /> Autoplay next <span class="spacer" />
              <span class="muted">{progress.autoplay ? 'On' : 'Off'}</span>
            </button>
            <button role="menuitem" onClick={() => (drivingMode.value = true)}>
              <Car size={20} /> Driving mode
            </button>
          </div>
        )}

        <ProgressRing track={track} />

        <div class="player-titles">
          <h1 class="player-title">{trackTitle(track)}</h1>
          <div class="player-time">
            {clock(player.currentTime.value)}
            {player.duration.value > 0 && `  ·  ${clock(player.remaining)} left`}
          </div>
        </div>

        {player.error.value && <div class="error">{player.error.value}</div>}

        <Transport />

        <div class="segmented">
          <button onClick={() => setSpeedSheet(true)} aria-label="Playback speed">
            <Gauge size={17} /> {formatRate(player.rate.value)}
          </button>
          {track.kind === 'lesson' && level && <ReadingButton track={track} />}
          <button
            onClick={() => level && (showLessonList.value = { level, kind: track.kind })}
            aria-label={track.kind === 'guide' ? 'Guides' : 'All lessons'}
          >
            <List size={17} /> {track.kind === 'guide' ? 'Guides' : 'Lessons'}
          </button>
        </div>
      </div>
      {speedSheet && <SpeedSheet close={() => setSpeedSheet(false)} />}
    </div>
  )
}

export const formatRate = (r: number) => `${r % 1 === 0 ? r.toFixed(1) : String(r)}×`

function ReadingButton({ track }: { track: Track }) {
  const level = levelByID(track.levelID)!
  const start = readingsBeginAtLesson(level)
  const reading = readingForLesson(level, track.number) ?? (start === undefined ? suggestedReading(level) : undefined)
  return (
    <button
      disabled={!reading}
      onClick={() => reading && play(reading)}
      aria-label={reading ? `Open ${trackTitle(reading)}` : `Readings begin in Lesson ${start}`}
      title={reading ? undefined : `Readings begin in Lesson ${start}`}
    >
      <BookOpen size={17} /> Reading
    </button>
  )
}

export function Transport() {
  const playing = player.isPlaying.value
  return (
    <div class="transport">
      <button class="edge" onClick={() => player.previous()} aria-label="Previous">
        <SkipBack size={22} />
      </button>
      <button class="skip press" onClick={() => player.skip(-skipInterval)} aria-label="Back 10 seconds">
        <Back10 size={26} strokeWidth={2} />
      </button>
      <button class="big press" onClick={() => player.togglePlayPause()} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={34} /> : <Play size={34} class="icon-play" />}
      </button>
      <button class="skip press" onClick={() => player.skip(skipInterval)} aria-label="Forward 10 seconds">
        <Forward10 size={26} strokeWidth={2} />
      </button>
      <button class="edge" onClick={() => player.next()} disabled={!player.hasNext} aria-label="Next">
        <SkipForward size={22} />
      </button>
    </div>
  )
}

/** The artwork inside a ring that fills as the lesson plays; drag the ring to jump. */
function ProgressRing({ track }: { track: Track }) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | undefined>(undefined)
  const last = useRef(0)
  const duration = player.duration.value
  const f = drag ?? player.fraction
  const r = 46
  const c = 2 * Math.PI * r
  const angle = f * 2 * Math.PI
  const kx = 50 + r * Math.sin(angle)
  const ky = 50 - r * Math.cos(angle)

  const fractionAt = (e: PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    const x = e.clientX - (box.left + box.width / 2)
    const y = e.clientY - (box.top + box.height / 2)
    let a = Math.atan2(x, -y) / (2 * Math.PI)
    if (a < 0) a += 1
    // Don't wrap from the end back to the start mid-drag.
    if (last.current > 0.8 && a < 0.2) a = 1
    if (last.current < 0.2 && a > 0.8) a = 0
    last.current = a
    return a
  }
  const onBand = (e: PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    const d = Math.hypot(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2))
    const radius = (box.width / 2) * (r / 50)
    return Math.abs(d - radius) < Math.max(26, box.width * 0.09)
  }

  return (
    <div
      ref={ref}
      class="ring-wrap"
      role="slider"
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(player.currentTime.value)}
      aria-valuetext={clock(player.currentTime.value)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') player.skip(-skipInterval)
        if (e.key === 'ArrowRight') player.skip(skipInterval)
      }}
      onPointerDown={(e) => {
        if (!(duration > 0) || !onBand(e)) return
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        last.current = player.fraction
        setDrag(fractionAt(e))
      }}
      onPointerMove={(e) => drag !== undefined && setDrag(fractionAt(e))}
      onPointerUp={(e) => {
        if (drag === undefined) return
        player.seek(fractionAt(e) * duration)
        setDrag(undefined)
      }}
      onPointerCancel={() => setDrag(undefined)}
    >
      <div class="ring-art">
        <Art seed={seedFor(track)} class="art-fill" />
      </div>
      <svg class="ring-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--pale)" stroke-width="4.2" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--primary)"
          stroke-width="4.2"
          stroke-linecap="round"
          stroke-dasharray={`${c * f} ${c}`}
          transform="rotate(-90 50 50)"
        />
        <circle cx={kx} cy={ky} r="4.4" fill="#fff" stroke="var(--primary)" stroke-width="2.2" />
      </svg>
      {drag !== undefined && <div class="ring-hint">Release to jump to {clock(drag * duration)}</div>}
    </div>
  )
}

export function SpeedSheet({ close }: { close: () => void }) {
  useEscape(close)
  return (
    <div class="sheet dim" onClick={close}>
      <div class="sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Playback speed">
        <div class="grabber" />
        <h2 class="row-title" style={{ marginBottom: '14px' }}>
          Playback speed
        </h2>
        <div class="speeds">
          {speeds.map((s) => (
            <button
              key={s}
              class={player.rate.value === s ? 'on' : ''}
              onClick={() => {
                player.setRate(s)
                close()
              }}
            >
              {formatRate(s)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AutoplayRow() {
  return (
    <div class="list-row">
      <div class="grow">
        <div class="row-title">Autoplay next</div>
        <div class="row-sub">Start the next one when this one ends</div>
      </div>
      <Toggle on={progress.autoplay} onChange={(v) => (progress.autoplay = v)} label="Autoplay next" />
    </div>
  )
}
