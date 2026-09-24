import { useEffect, useRef, useState } from 'preact/hooks'
import { player } from '../audio/player'
import {
  booklet,
  currentLevel,
  greeting,
  openPlayer,
  play,
  showCoursePicker,
  suggestedLesson,
  suggestedReading,
  tab,
} from '../model/app'
import { fraction, isInProgress, progress, remaining } from '../model/progress'
import { type Level, type Track, readingForLesson, readingsBeginAtLesson, trackTitle } from '../model/types'
import { seedFor } from './art'
import { Art, MiniRing } from './common'
import { minutes } from './format'
import { BookOpen, ChevronDown, FileText, Flame, Pause, Play } from './icons'

export function LearnView() {
  const level = currentLevel.value
  progress.state.value // re-render when progress changes
  if (!level) return null
  return <LevelHome key={level.id} level={level} />
}

function LevelHome({ level }: { level: Level }) {
  const suggested = suggestedLesson(level)
  const [selected, setSelected] = useState<number | undefined>(undefined)
  const lesson = level.lessons.find((l) => l.number === selected) ?? suggested
  const streak = progress.currentStreak()
  const done = progress.completedCount(level.lessons)

  return (
    <main class="screen">
      <header class="header">
        <div>
          <button class="chip press" onClick={() => (showCoursePicker.value = true)} aria-label="Change language or level">
            {level.courseName} · Level {level.number}
            <ChevronDown size={14} strokeWidth={3} />
          </button>
          <h1 class="greeting">{greeting(level.courseName)}</h1>
        </div>
        <div class="streak-badge" title={`${streak}-day streak`} aria-label={`${streak}-day streak`}>
          <Flame size={18} />
          {streak}
        </div>
      </header>

      {lesson && <Hero lesson={lesson} />}

      <section aria-label="Lessons">
        <div class="section-head">
          <h2>Your path</h2>
          <span class="muted">
            {done} / {level.lessons.length} done
          </span>
        </div>
        <LessonPath level={level} selected={lesson?.number} onSelect={setSelected} />
      </section>

      <div class="tiles">
        <ReadingTile level={level} lesson={lesson} />
        <BookletTile level={level} />
      </div>
    </main>
  )
}

function Hero({ lesson }: { lesson: Track }) {
  const p = progress.progress(lesson.id)
  const isCurrent = player.track.value?.id === lesson.id
  const playing = isCurrent && player.isPlaying.value
  const position = isCurrent ? player.currentTime.value : p.position
  const duration = (isCurrent && player.duration.value) || p.duration
  const f = p.completed ? 1 : duration > 0 ? position / duration : 0
  const eyebrow = p.completed ? 'Completed' : isInProgress(p) || (isCurrent && position > 5) ? 'In progress' : 'Up next'
  const sub = p.completed
    ? 'Done · play it again any time'
    : position > 5 && duration > 0
      ? `${minutes(duration - position)} left${f > 0.4 && f < 0.6 ? ' · halfway there' : ''}`
      : duration > 0
        ? minutes(duration)
        : 'Ready when you are'

  const onPlay = () => {
    if (isCurrent) {
      if (playing) player.pause()
      else {
        player.play()
        openPlayer()
      }
    } else play(lesson)
  }

  return (
    <section class="hero" aria-label={`${trackTitle(lesson)}, ${eyebrow}`}>
      <Art seed={seedFor(lesson)} />
      <div class="hero-overlay">
        <button class="grow" style={{ textAlign: 'left' }} onClick={() => (isCurrent ? openPlayer() : play(lesson))}>
          <div class="eyebrow">{eyebrow}</div>
          <div class="hero-title">{trackTitle(lesson)}</div>
          <div class="hero-sub">{sub}</div>
          {f > 0 && f < 1 && (
            <div class="hero-progress">
              <div style={{ width: `${f * 100}%` }} />
            </div>
          )}
        </button>
        <button class="play-fab" onClick={onPlay} aria-label={playing ? 'Pause' : `Play ${trackTitle(lesson)}`}>
          {playing ? <Pause size={26} /> : <Play size={26} class="icon-play" />}
        </button>
      </div>
    </section>
  )
}

function LessonPath({ level, selected, onSelect }: { level: Level; selected?: number; onSelect: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.path-item.selected')
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' as ScrollBehavior })
  }, [level.id])
  return (
    <div class="path" ref={ref}>
      {level.lessons.map((t) => {
        const p = progress.progress(t.id)
        const f = player.track.value?.id === t.id && player.duration.value > 0 ? player.fraction : fraction(p)
        const state = p.completed ? 'done' : f > 0.01 ? 'partial' : ''
        return (
          <button
            key={t.id}
            class={`path-item ${t.number === selected ? 'selected' : ''}`}
            onClick={() => onSelect(t.number)}
            aria-label={`${trackTitle(t)}${p.completed ? ', completed' : ''}`}
            aria-pressed={t.number === selected}
          >
            <div class={`path-dot ${state}`}>
              {state === 'partial' && <MiniRing fraction={f} />}
              {t.number}
            </div>
            <span class="path-label">L{t.number}</span>
          </button>
        )
      })}
    </div>
  )
}

function ReadingTile({ level, lesson }: { level: Level; lesson?: Track }) {
  if (level.readings.length === 0) {
    return (
      <button class="tile press" onClick={() => (tab.value = 'reading')}>
        <span class="badge">
          <BookOpen size={19} />
        </span>
        <span>
          <div class="tile-title">Reading</div>
          <div class="tile-sub">No reading audio in this level</div>
        </span>
      </button>
    )
  }
  const start = readingsBeginAtLesson(level)
  const forLesson = lesson ? readingForLesson(level, lesson.number) : undefined
  const reading = forLesson ?? (start === undefined ? suggestedReading(level) : undefined)
  const p = reading ? progress.progress(reading.id) : undefined
  const sub = reading
    ? p?.completed
      ? 'Done · read it again'
      : p && isInProgress(p)
        ? `${minutes(remaining(p))} left`
        : p?.duration
          ? `${minutes(p.duration)} read-along`
          : 'Read along'
    : `Readings begin in Lesson ${start}`
  return (
    <button class="tile press" onClick={() => (reading ? play(reading) : (tab.value = 'reading'))}>
      <span class="badge">
        <BookOpen size={19} />
      </span>
      <span>
        <div class="tile-title">{reading ? trackTitle(reading) : 'Reading'}</div>
        <div class="tile-sub">{sub}</div>
      </span>
    </button>
  )
}

function BookletTile({ level }: { level: Level }) {
  const file = level.booklets[0]
  return (
    <button
      class="tile press"
      disabled={!file}
      onClick={() => file && (booklet.value = { file, title: `Level ${level.number} booklet` })}
    >
      <span class="badge">
        <FileText size={19} />
      </span>
      <span>
        <div class="tile-title">Booklet</div>
        <div class="tile-sub">{file ? `Level ${level.number} PDF` : 'No booklet found'}</div>
      </span>
    </button>
  )
}
