import { useEffect, useRef, useState } from 'preact/hooks'
import { player } from '../audio/player'
import {
  courses,
  currentLevel,
  deleteCourse,
  isImported,
  message,
  openPlayer,
  play,
  showCoursePicker,
  suggestedLesson,
} from '../model/app'
import { dayKey, progress, remaining } from '../model/progress'
import { type Course, levelTitle, trackTitle } from '../model/types'
import { seedFor } from './art'
import { Art, Toggle, canPickFolders, openImporter, useEscape } from './common'
import { bytes, hours, minutes } from './format'
import { Check, ChevronRight, Download, FolderPlus, Globe, Pause, Play, Restart, Trash, Upload } from './icons'

export function MeView() {
  progress.state.value
  const level = currentLevel.value
  const [manage, setManage] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const allTracks = courses.value.flatMap((c) => c.levels.flatMap((l) => [...l.lessons, ...l.readings]))
  const lessonsDone = progress.completedCount(allTracks.filter((t) => t.kind === 'lesson'))

  return (
    <main class="screen">
      <header>
        <span class="chip">{level ? `Learning ${level.courseName}` : 'Revisit'}</span>
        <input
          class="name-input greeting"
          value={progress.learnerName}
          placeholder="Your name"
          aria-label="Your name"
          maxLength={40}
          onChange={(e) => (progress.learnerName = (e.currentTarget as HTMLInputElement).value.trim())}
        />
      </header>

      {level && <CurrentlyCard />}

      <StreakCard />

      <div class="stats">
        <div class="stat">
          <div class="stat-value">{hours(progress.totalListening)}</div>
          <div class="stat-label">Listened</div>
        </div>
        <div class="stat">
          <div class="stat-value">{lessonsDone}</div>
          <div class="stat-label">Lessons done</div>
        </div>
        <div class="stat">
          <div class="stat-value">{progress.bestStreak()}</div>
          <div class="stat-label">Best streak</div>
        </div>
      </div>

      {level && (
        <div class="card">
          <div class="section-head">
            <h2 class="row-title">{levelTitle(level)}</h2>
            <span class="muted">
              {progress.completedCount(level.lessons)} / {level.lessons.length}
            </span>
          </div>
          <div class="bar" style={{ height: '8px', borderRadius: '4px', marginTop: '10px' }}>
            <div style={{ width: `${(progress.completedCount(level.lessons) / Math.max(level.lessons.length, 1)) * 100}%` }} />
          </div>
          <p class="row-sub" style={{ marginTop: '8px' }}>
            Lessons completed. Readings: {progress.completedCount(level.readings)} / {level.readings.length}
          </p>
        </div>
      )}

      <section>
        <div class="section-head" style={{ marginBottom: '10px' }}>
          <h2>Settings</h2>
        </div>
        <div class="list">
          <div class="list-row">
            <div class="grow">
              <div class="row-title">Autoplay next</div>
              <div class="row-sub">Start the next lesson when one ends</div>
            </div>
            <Toggle on={progress.autoplay} onChange={(v) => (progress.autoplay = v)} label="Autoplay next" />
          </div>
          <button class="list-row" onClick={() => (showCoursePicker.value = true)}>
            <Globe size={20} class="muted" />
            <div class="grow row-title">Change language or level</div>
            <ChevronRight size={18} class="muted" />
          </button>
          <button class="list-row" onClick={() => setManage(true)}>
            <FolderPlus size={20} class="muted" />
            <div class="grow row-title">Courses</div>
            <span class="row-sub">{courses.value.length}</span>
            <ChevronRight size={18} class="muted" />
          </button>
          {level && (
            <button class="list-row" onClick={() => setConfirmReset(true)}>
              <Restart size={20} class="muted" />
              <div class="grow row-title">Reset Level {level.number} progress</div>
            </button>
          )}
        </div>
      </section>

      <Backup />

      <p class="note" style={{ textAlign: 'center' }}>
        Your courses and progress stay in this browser. Nothing is uploaded.
      </p>

      {manage && <ManageCourses close={() => setManage(false)} />}
      {confirmReset && level && (
        <Confirm
          title={`Reset ${levelTitle(level)}?`}
          body="Every lesson and reading in this level goes back to not started. Your listening stats stay."
          action="Reset progress"
          onConfirm={() => {
            progress.reset([...level.lessons, ...level.readings].map((t) => t.id))
            if (player.track.value?.levelID === level.id) player.seek(0)
          }}
          close={() => setConfirmReset(false)}
        />
      )}
    </main>
  )
}

function CurrentlyCard() {
  const level = currentLevel.value!
  const lesson = suggestedLesson(level)
  if (!lesson) return null
  const p = progress.progress(lesson.id)
  const isCurrent = player.track.value?.id === lesson.id
  const playing = isCurrent && player.isPlaying.value
  return (
    <div class="card row" style={{ gap: '14px' }}>
      <div class="mini-art" style={{ width: '58px', height: '58px', borderRadius: '16px' }}>
        <Art seed={seedFor(lesson)} class="art-fill" />
      </div>
      <div class="grow" style={{ flex: 1 }}>
        <div class="eyebrow muted">Currently</div>
        <div class="row-title">{trackTitle(lesson)}</div>
        <div class="row-sub">{p.position > 5 && p.duration ? `${minutes(remaining(p))} left` : levelTitle(level)}</div>
      </div>
      <button
        class="play-fab"
        style={{ width: '52px', height: '52px' }}
        onClick={() => (playing ? player.pause() : isCurrent ? (player.play(), openPlayer()) : play(lesson))}
        aria-label={playing ? 'Pause' : `Play ${trackTitle(lesson)}`}
      >
        {playing ? <Pause size={22} /> : <Play size={22} class="icon-play" />}
      </button>
    </div>
  )
}

function StreakCard() {
  const streak = progress.currentStreak()
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
  return (
    <div class="card">
      <div class="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div class="row-title">{streak === 1 ? '1-day streak' : `${streak}-day streak`}</div>
          <div class="row-sub">A day counts once you listen for a minute.</div>
        </div>
        <div class="streak-badge" style={{ width: '48px', height: '48px' }}>
          {streak}
        </div>
      </div>
      <div class="week" aria-label={`Studied ${days.filter((d) => progress.isActive(d)).length} days this week`}>
        {days.map((d) => {
          const on = progress.isActive(d)
          return (
            <div class="week-day" key={dayKey(d)}>
              <div class={`week-dot ${on ? 'on' : ''} ${dayKey(d) === dayKey(today) ? 'today' : ''}`}>
                {on && <Check size={16} strokeWidth={3.2} />}
              </div>
              {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Backup() {
  const input = useRef<HTMLInputElement>(null)
  const exportFile = () => {
    const blob = new Blob([progress.exportJSON()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `revisit-progress-${dayKey(new Date())}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <section>
      <div class="section-head" style={{ marginBottom: '10px' }}>
        <h2>Backup</h2>
      </div>
      <div class="list">
        <button class="list-row" onClick={exportFile}>
          <Download size={20} class="muted" />
          <div class="grow">
            <div class="row-title">Save progress to a file</div>
            <div class="row-sub">Move it to another browser or device</div>
          </div>
        </button>
        <button class="list-row" onClick={() => input.current?.click()}>
          <Upload size={20} class="muted" />
          <div class="grow">
            <div class="row-title">Load progress from a file</div>
            <div class="row-sub">Replaces the progress in this browser</div>
          </div>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        class="visually-hidden"
        onChange={async (e) => {
          const file = (e.currentTarget as HTMLInputElement).files?.[0]
          ;(e.currentTarget as HTMLInputElement).value = ''
          if (!file) return
          try {
            progress.importJSON(await file.text())
            message.value = 'Progress loaded.'
          } catch (err) {
            message.value = (err as Error).message
          }
        }}
      />
    </section>
  )
}

function ManageCourses({ close }: { close: () => void }) {
  const [pending, setPending] = useState<Course>()
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>()
  useEscape(close)
  useEffect(() => {
    navigator.storage?.estimate?.().then(setUsage, () => {})
  }, [courses.value])
  return (
    <div class="sheet" role="dialog" aria-label="Courses" style={{ zIndex: 45 }}>
      <div class="sheet-body">
        <div class="topbar">
          <span style={{ width: '44px' }} />
          <div class="topbar-title">Courses</div>
          <button class="btn secondary" style={{ minHeight: '40px', padding: '0 16px' }} onClick={close}>
            Done
          </button>
        </div>
        <div class="list">
          {courses.value.map((c) => (
            <div class="list-row" key={c.id}>
              <div class="grow">
                <div class="row-title">{c.name}</div>
                <div class="row-sub">
                  {c.levels.length === 1 ? '1 level' : `${c.levels.length} levels`}
                  {isImported(c) ? ' · in this browser' : ' · shared by the dev server'}
                </div>
              </div>
              {isImported(c) && (
                <button class="icon-btn" onClick={() => setPending(c)} aria-label={`Delete ${c.name}`} style={{ color: '#b3261e' }}>
                  <Trash size={20} />
                </button>
              )}
            </div>
          ))}
          {courses.value.length === 0 && <div class="list-row row-sub">No courses yet.</div>}
        </div>
        <ImportButtons />
        {usage?.usage !== undefined && (
          <p class="note">
            Using {bytes(usage.usage)}
            {usage.quota ? ` of about ${bytes(usage.quota)} available to this site` : ''}. Deleting a course removes its
            audio from this browser; your progress stays.
          </p>
        )}
      </div>
      {pending && (
        <Confirm
          title={`Delete ${pending.name}?`}
          body="This removes the course's audio and booklets from this browser. Your progress is kept, so re-importing picks up where you left off."
          action="Delete course"
          onConfirm={() => void deleteCourse(pending)}
          close={() => setPending(undefined)}
        />
      )}
    </div>
  )
}

export function ImportButtons() {
  const folder = (
    <button class={`btn block ${canPickFolders ? '' : 'secondary'}`} onClick={() => openImporter('folder')}>
      <FolderPlus size={20} /> Import a course folder
    </button>
  )
  const files = (
    <button class={`btn block ${canPickFolders ? 'secondary' : ''}`} onClick={() => openImporter('files')}>
      <Upload size={20} /> Pick audio and PDF files
    </button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {canPickFolders ? folder : files}
      {canPickFolders ? files : folder}
    </div>
  )
}

export function Confirm({
  title,
  body,
  action,
  onConfirm,
  close,
}: {
  title: string
  body: string
  action: string
  onConfirm: () => void
  close: () => void
}) {
  useEscape(close)
  return (
    <div class="sheet dim" onClick={close} style={{ zIndex: 70 }}>
      <div class="sheet-panel" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="grabber" />
        <h2 class="row-title" style={{ fontSize: '20px' }}>
          {title}
        </h2>
        <p class="row-sub" style={{ margin: '8px 0 18px', fontSize: '15px' }}>
          {body}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            class="btn danger block"
            onClick={() => {
              onConfirm()
              close()
            }}
          >
            {action}
          </button>
          <button class="btn secondary block" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
