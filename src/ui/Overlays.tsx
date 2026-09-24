import { useEffect, useState } from 'preact/hooks'
import { player, skipInterval } from '../audio/player'
import {
  courses,
  currentLevel,
  drivingMode,
  finished,
  importing,
  message,
  openPlayer,
  play,
  select,
  showCoursePicker,
  showLessonList,
  tab,
} from '../model/app'
import { fraction, isInProgress, progress, remaining } from '../model/progress'
import { type Course, levelTitle, trackLevelTitle, trackLongTitle, trackTitle } from '../model/types'
import { seedFor } from './art'
import { Art, MiniRing, Toggle, useEscape } from './common'
import { bytes, minutes } from './format'
import {
  Back10,
  BookOpen,
  Cap,
  Check,
  ChevronLeft,
  ChevronRight,
  Close,
  Forward10,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  User,
} from './icons'
import { ImportButtons } from './Me'

// MARK: - Tab bar & mini player

export function TabBar() {
  const items = [
    ['learn', 'Learn', Cap],
    ['reading', 'Reading', BookOpen],
    ['me', 'Me', User],
  ] as const
  return (
    <nav class="tabbar" aria-label="Sections">
      {items.map(([id, label, Icon]) => (
        <button
          key={id}
          class={tab.value === id ? 'on' : ''}
          onClick={() => {
            tab.value = id
            scrollTo({ top: 0 })
          }}
          aria-current={tab.value === id ? 'page' : undefined}
          aria-label={label}
        >
          <Icon size={20} />
          {tab.value === id && label}
        </button>
      ))}
    </nav>
  )
}

export function MiniPlayer() {
  const t = player.track.value
  if (!t) return null
  const playing = player.isPlaying.value
  return (
    <div class="mini">
      <button class="mini-art" onClick={openPlayer} aria-label="Open player">
        <Art seed={seedFor(t)} class="art-fill" />
      </button>
      <button class="mini-text" onClick={openPlayer}>
        <div class="mini-title">{trackLongTitle(t)}</div>
        <div class="mini-sub">
          {trackLevelTitle(t)}
          {player.duration.value > 0 && ` · ${minutes(player.remaining)} left`}
        </div>
      </button>
      <button class="round" onClick={() => player.skip(-skipInterval)} aria-label="Back 10 seconds">
        <Back10 size={24} strokeWidth={2} />
      </button>
      <button class="round solid" onClick={() => player.togglePlayPause()} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={20} /> : <Play size={20} class="icon-play" />}
      </button>
      <div class="mini-progress" style={{ width: `${player.fraction * 100}%` }} />
    </div>
  )
}

// MARK: - Course picker

export function CoursePicker() {
  const [course, setCourse] = useState<Course | undefined>(() =>
    courses.value.length === 1 ? courses.value[0] : undefined,
  )
  const [selection, setSelection] = useState<string | undefined>(currentLevel.value?.id)
  const close = () => (showCoursePicker.value = false)
  useEscape(close)
  progress.state.value

  return (
    <div class="sheet" role="dialog" aria-label="Choose a course" style={{ zIndex: 45 }}>
      <div class="sheet-body">
        <div class="topbar">
          {course && courses.value.length > 1 ? (
            <button class="icon-btn" onClick={() => setCourse(undefined)} aria-label="All languages">
              <ChevronLeft size={26} />
            </button>
          ) : (
            <span style={{ width: '44px' }} />
          )}
          <div class="topbar-title">{course ? course.name : 'Languages'}</div>
          <button class="icon-btn" onClick={close} aria-label="Close">
            <Close size={24} />
          </button>
        </div>

        {!course ? (
          <>
            <div class="list">
              {courses.value.map((c) => (
                <button class="list-row" key={c.id} onClick={() => setCourse(c)}>
                  <span class="num" style={{ fontSize: '20px' }}>
                    {flag(c.name) ?? c.name[0]}
                  </span>
                  <div class="grow">
                    <div class="row-title">{c.name}</div>
                    <div class="row-sub">{c.levels.length === 1 ? '1 level' : `${c.levels.length} levels`}</div>
                  </div>
                  {currentLevel.value?.courseName === c.name && <span class="chip">In progress</span>}
                  <ChevronRight size={18} class="muted" />
                </button>
              ))}
            </div>
            <ImportButtons />
          </>
        ) : (
          <>
            <div class="list">
              {course.levels.map((l) => {
                const done = progress.completedCount(l.lessons)
                const on = selection === l.id
                return (
                  <button class="list-row" key={l.id} onClick={() => setSelection(l.id)} aria-pressed={on}>
                    <div class="grow">
                      <div class="row-title">Level {l.number}</div>
                      <div class="row-sub">
                        {done === l.lessons.length && done > 0
                          ? 'Completed'
                          : `${done} of ${l.lessons.length} lessons${currentLevel.value?.id === l.id ? ' · in progress' : ''}`}
                      </div>
                    </div>
                    <span
                      class="num"
                      style={
                        on
                          ? { background: 'var(--primary)', color: '#fff' }
                          : { background: 'transparent', boxShadow: 'inset 0 0 0 2px var(--line)' }
                      }
                    >
                      {on && <Check size={18} strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              class="btn block"
              disabled={!course.levels.some((l) => l.id === selection)}
              onClick={() => {
                const level = course.levels.find((l) => l.id === selection)
                if (level) select(level)
                tab.value = 'learn'
                close()
              }}
            >
              Start learning
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function flag(language: string): string | undefined {
  const flags: Record<string, string> = {
    russian: '🇷🇺', italian: '🇮🇹', spanish: '🇪🇸', french: '🇫🇷', german: '🇩🇪', portuguese: '🇵🇹', japanese: '🇯🇵',
    mandarin: '🇨🇳', chinese: '🇨🇳', korean: '🇰🇷', arabic: '🇸🇦', hebrew: '🇮🇱', hindi: '🇮🇳', dutch: '🇳🇱',
    swedish: '🇸🇪', norwegian: '🇳🇴', danish: '🇩🇰', polish: '🇵🇱', greek: '🇬🇷', turkish: '🇹🇷', ukrainian: '🇺🇦',
  }
  const key = language.toLowerCase()
  return flags[key] ?? Object.entries(flags).find(([k]) => key.includes(k))?.[1]
}

// MARK: - Lesson list

export function LessonList() {
  const route = showLessonList.value
  const close = () => (showLessonList.value = undefined)
  useEscape(close)
  progress.state.value
  if (!route) return null
  const { level, kind } = route
  const list = kind === 'lesson' ? level.lessons : kind === 'reading' ? level.readings : level.guides
  const title = kind === 'lesson' ? 'Lessons' : kind === 'reading' ? 'Readings' : 'Guides'
  return (
    <div class="sheet" role="dialog" aria-label={title} style={{ zIndex: 45 }}>
      <div class="sheet-body">
        <div class="topbar">
          <span style={{ width: '44px' }} />
          <div class="topbar-title">
            {title}
            <div class="row-sub">{levelTitle(level)}</div>
          </div>
          <button class="icon-btn" onClick={close} aria-label="Close">
            <Close size={24} />
          </button>
        </div>
        <div class="list">
          <div class="list-row">
            <div class="grow">
              <div class="row-title">Autoplay next</div>
              <div class="row-sub">Start the next one when this one ends</div>
            </div>
            <Toggle on={progress.autoplay} onChange={(v) => (progress.autoplay = v)} label="Autoplay next" />
          </div>
        </div>
        <div class="list">
          {list.map((t) => {
            const p = progress.progress(t.id)
            const current = player.track.value?.id === t.id
            const f = current && player.duration.value > 0 ? player.fraction : fraction(p)
            return (
              <button
                key={t.id}
                class="list-row"
                onClick={() => {
                  play(t, false)
                  close()
                }}
                aria-current={current ? 'true' : undefined}
              >
                <span class={`num ${p.completed ? 'done' : current ? 'current' : ''}`}>
                  {!p.completed && f > 0.01 && <MiniRing fraction={f} size={40} />}
                  {p.completed ? <Check size={18} strokeWidth={3} /> : t.kind === 'guide' ? '•' : t.number}
                </span>
                <div class="grow">
                  <div class="row-title">{trackTitle(t)}</div>
                  <div class="row-sub">
                    {current && player.isPlaying.value
                      ? 'Playing'
                      : p.completed
                        ? 'Completed'
                        : isInProgress(p)
                          ? `${minutes(remaining(p))} left`
                          : p.duration
                            ? minutes(p.duration)
                            : ''}
                  </div>
                </div>
                <Play size={16} class="muted" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// MARK: - Driving mode

export function DrivingMode() {
  const close = () => (drivingMode.value = false)
  useEscape(close)
  const t = player.track.value
  const playing = player.isPlaying.value
  return (
    <div class="sheet driving" role="dialog" aria-label="Driving mode" style={{ zIndex: 55 }}>
      <div class="sheet-body">
        <div class="topbar">
          <button class="btn secondary" style={{ minHeight: '48px', background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} onClick={close}>
            Back
          </button>
          <div class="topbar-title">{t ? trackTitle(t) : ''}</div>
          <span style={{ width: '60px' }} />
        </div>
        <div class="driving-grid">
          <button onClick={() => player.previous()} aria-label="Previous">
            <SkipBack size={44} />
          </button>
          <button onClick={() => player.next()} disabled={!player.hasNext} aria-label="Next">
            <SkipForward size={44} />
          </button>
          <button class="play" onClick={() => player.togglePlayPause()} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={72} /> : <Play size={72} />}
          </button>
          <button onClick={() => player.skip(-skipInterval)} aria-label="Back 10 seconds">
            <Back10 size={56} strokeWidth={1.8} />
          </button>
          <button onClick={() => player.skip(skipInterval)} aria-label="Forward 10 seconds">
            <Forward10 size={56} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}

// MARK: - Banners

export function CompletionBanner() {
  const notice = finished.value
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => {
      if (finished.value?.id === notice.id) finished.value = undefined
    }, 7000)
    return () => clearTimeout(timer)
  }, [notice?.id])
  if (!notice) return null
  return (
    <div class="banner" role="status">
      <Check size={22} strokeWidth={3} />
      <div class="grow">
        <div class="banner-title">{trackLongTitle(notice.track)} complete</div>
        {notice.next && (
          <div class="banner-sub">{notice.autoplayed ? `Now playing ${trackTitle(notice.next)}` : `Next: ${trackTitle(notice.next)}`}</div>
        )}
      </div>
      {notice.next && !notice.autoplayed && (
        <button
          class="btn accent"
          onClick={() => {
            play(notice.next!, false)
            finished.value = undefined
          }}
        >
          Play
        </button>
      )}
      <button class="icon-btn" onClick={() => (finished.value = undefined)} aria-label="Dismiss">
        <Close size={18} />
      </button>
    </div>
  )
}

export function ImportBanner() {
  const p = importing.value
  if (!p) return null
  const f = p.totalBytes > 0 ? p.copiedBytes / p.totalBytes : 0
  return (
    <div class="banner" role="status">
      <div class="grow">
        <div class="banner-title">Importing {p.name}…</div>
        <div class="banner-sub">
          {bytes(p.copiedBytes)} of {bytes(p.totalBytes)} · keep this page open
        </div>
        <div class="bar">
          <div style={{ width: `${f * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

export function MessageBanner() {
  const text = message.value
  useEffect(() => {
    if (!text) return
    const timer = setTimeout(() => (message.value = undefined), 6000)
    return () => clearTimeout(timer)
  }, [text])
  if (!text) return null
  return (
    <div class="banner" role="alert">
      <div class="grow banner-title" style={{ fontWeight: 700 }}>
        {text}
      </div>
      <button class="icon-btn" onClick={() => (message.value = undefined)} aria-label="Dismiss">
        <Close size={18} />
      </button>
    </div>
  )
}

// MARK: - Welcome

export function WelcomeView() {
  return (
    <main class="welcome">
      <div class="welcome-art">
        <Art seed={{ key: 'welcome', index: 0, level: 0 }} class="art-fill" />
      </div>
      <div>
        <h1 class="wordmark">Revisit</h1>
        <p class="hero-sub muted" style={{ fontSize: '18px', marginTop: '8px' }}>
          Your audio lessons, remembered. Pick up every lesson exactly where you left it.
        </p>
      </div>
      <ImportButtons />
      <div class="card">
        <div class="row-title" style={{ marginBottom: '6px' }}>
          What to import
        </div>
        <p class="row-sub" style={{ fontSize: '14px', marginBottom: '12px' }}>
          Pick the language folder. Levels, lessons, readings and the reading booklet are found automatically. On a phone,
          open each level folder, choose Select All, and pick the files; Revisit sorts them into levels from their names.
        </p>
        <div class="folder-diagram">
          📁 Italian
          <br />
          &nbsp;&nbsp;&nbsp;📁 Level 1 <span>— lesson audio</span>
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 Reading <span>— reading audio + booklet PDF</span>
          <br />
          &nbsp;&nbsp;&nbsp;📁 Level 2 <span>…</span>
        </div>
      </div>
      <p class="note" style={{ textAlign: 'center' }}>
        Files stay in this browser. Nothing is uploaded. Add Revisit to your Home Screen so the browser keeps them.
      </p>
    </main>
  )
}
