import { useEffect, useRef, useState } from 'preact/hooks'
import { player, skipInterval } from '../audio/player'
import { booklet, currentLevel, levelByID, play, playerRoute, showLessonList } from '../model/app'
import { fraction, isInProgress, progress, remaining } from '../model/progress'
import { type FileRef, type Level, type Track, fileKey, readingsBeginAtLesson, trackTitle } from '../model/types'
import {
  type ReadingBlock,
  type ReadingContent,
  type ReadingItem,
  hasStressMarks,
  hasTranslation,
  runs,
  unitsFor,
} from '../reading/booklet'
import { bookletUnits, pageCount, renderPage } from '../reading/pdf'
import { MiniRing, ScrubBar, useEscape } from './common'
import { minutes } from './format'
import { Back10, BookOpen, ChevronDown, ChevronRight, FileText, Forward10, Headphones, List, Pause, Play, SkipBack, SkipForward, Translate } from './icons'

// MARK: - Reading tab

export function ReadingTab() {
  const level = currentLevel.value
  progress.state.value
  if (!level) return null
  const hasGuides = level.guides.length > 0 || level.guideDocuments.length > 0
  return (
    <main class="screen">
      <header>
        <span class="chip">
          {level.courseName} · Level {level.number}
        </span>
        <h1 class="greeting">Reading</h1>
      </header>

      {level.booklets[0] && (
        <div class="list">
          <button
            class="list-row"
            onClick={() => (booklet.value = { file: level.booklets[0], title: `Level ${level.number} booklet` })}
          >
            <span class="badge">
              <FileText size={19} />
            </span>
            <div class="grow">
              <div class="row-title">Reading booklet</div>
              <div class="row-sub">Every reading, as printed</div>
            </div>
            <ChevronRight size={18} class="muted" />
          </button>
        </div>
      )}

      {level.readings.length > 0 ? (
        <section>
          <div class="section-head" style={{ marginBottom: '10px' }}>
            <h2>Readings</h2>
            <span class="muted">
              {progress.completedCount(level.readings)} / {level.readings.length} done
            </span>
          </div>
          <div class="list reading-list">
            {level.readings.map((t) => (
              <ReadingRow key={t.id} track={t} level={level} />
            ))}
          </div>
        </section>
      ) : (
        <div class="empty card">
          <BookOpen size={36} />
          <p>
            No reading audio in Level {level.number}. Put the reading MP3s and booklet PDF in a “Readings” folder inside the
            level folder, then import it again.
          </p>
        </div>
      )}

      {hasGuides && (
        <section>
          <div class="section-head" style={{ marginBottom: '10px' }}>
            <h2>Course guide</h2>
          </div>
          <div class="list">
            {level.guides.map((g) => (
              <button key={g.id} class="list-row" onClick={() => play(g)}>
                <span class="badge">
                  <Headphones size={19} />
                </span>
                <div class="grow">
                  <div class="row-title">{g.name}</div>
                  <div class="row-sub">{durationLabel(g)}</div>
                </div>
                <Play size={16} class="muted" />
              </button>
            ))}
            {level.guideDocuments.map((d) => {
              const name = d.path.split('/').pop()!.replace(/\.pdf$/i, '')
              return (
                <button key={fileKey(d)} class="list-row" onClick={() => (booklet.value = { file: d, title: name })}>
                  <span class="badge">
                    <FileText size={19} />
                  </span>
                  <div class="grow">
                    <div class="row-title">{name}</div>
                    <div class="row-sub">PDF</div>
                  </div>
                  <ChevronRight size={18} class="muted" />
                </button>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}

function durationLabel(t: Track) {
  const p = progress.progress(t.id)
  if (p.completed) return 'Done'
  if (isInProgress(p)) return `${minutes(remaining(p))} left`
  return p.duration ? minutes(p.duration) : ''
}

function ReadingRow({ track, level }: { track: Track; level: Level }) {
  const p = progress.progress(track.id)
  const f = fraction(p)
  const start = readingsBeginAtLesson(level)
  const context = start !== undefined ? `With Lesson ${start + track.number - 1}` : track.isPart ? 'Several readings in one recording' : ''
  const sub = [context, durationLabel(track)].filter(Boolean).join(' · ')
  return (
    <button class="list-row" onClick={() => play(track)}>
      <span class={`num ${p.completed ? 'done' : ''}`}>
        {!p.completed && f > 0.01 && <MiniRing fraction={f} size={36} />}
        {track.coverage ? `${track.coverage[0]}–` : track.number}
      </span>
      <div class="grow">
        <div class="row-title">{trackTitle(track)}</div>
        {sub && <div class="row-sub">{sub}</div>}
      </div>
      <Play size={16} class="muted" />
    </button>
  )
}

// MARK: - Reading player

export function ReadingPlayer() {
  const track = player.track.value
  const [loaded, setLoaded] = useState<{ id: string; units: ReadingContent[]; all: ReadingContent[]; estimated: boolean }>()
  const [error, setError] = useState<string>()
  const [showAll, setShowAll] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const close = () => (playerRoute.value = undefined)
  useEscape(close)

  const level = track ? levelByID(track.levelID) : undefined
  const file = level?.booklets[0]

  useEffect(() => {
    setShowAll(false)
    setError(undefined)
    if (!track || track.kind !== 'reading' || !level) return
    if (!file) {
      setLoaded({ id: track.id, units: [], all: [], estimated: false })
      return
    }
    let cancelled = false
    bookletUnits(file).then(
      (all) => {
        if (cancelled) return
        const pick = unitsFor(track, level.readings, all)
        setLoaded({ id: track.id, units: pick.units, all, estimated: pick.estimated })
      },
      (e: Error) => {
        if (cancelled) return
        setError(`Couldn't read the booklet: ${e.message}`)
        setLoaded({ id: track.id, units: [], all: [], estimated: false })
      },
    )
    return () => {
      cancelled = true
    }
  }, [track?.id])

  if (!track) return null
  const ready = loaded?.id === track.id
  const shown = ready ? (showAll ? loaded.all : loaded.units) : []
  const canTranslate = shown.some(hasTranslation)
  const jump = (ordinal: number) =>
    document.getElementById(`unit-${ordinal}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div class="sheet" role="dialog" aria-label={`${trackTitle(track)} reading`}>
      <div class="sheet-body" style={{ gap: '14px' }}>
        <div class="topbar">
          <button class="icon-btn" onClick={close} aria-label="Close reading">
            <ChevronDown size={28} />
          </button>
          <div class="topbar-title">
            Reading
            <div class="row-sub">{track.coverage || track.isPart ? trackTitle(track) : `Reading lesson ${track.number}`}</div>
          </div>
          <button
            class="icon-btn"
            onClick={() => level && (showLessonList.value = { level, kind: 'reading' })}
            aria-label="Choose a reading"
          >
            <List size={22} />
          </button>
          {file && (
            <button
              class="icon-btn"
              onClick={() => (booklet.value = { file, page: shown[0]?.firstPage, title: `Level ${level!.number} booklet` })}
              aria-label="Open booklet"
            >
              <FileText size={22} />
            </button>
          )}
          <button
            class="icon-btn"
            style={showTranslation ? { background: 'var(--pale)', color: 'var(--primary)' } : undefined}
            disabled={!canTranslate}
            onClick={() => setShowTranslation(!showTranslation)}
            aria-label={showTranslation ? 'Hide translation' : 'Show translation'}
            aria-pressed={showTranslation}
          >
            <Translate size={22} />
          </button>
        </div>

        {ready && (shown.length > 1 || loaded.estimated) && (
          <div class="unit-chips">
            {shown.map((u) => (
              <button key={u.ordinal} onClick={() => jump(u.ordinal)} aria-label={`Reading lesson ${u.ordinal}`}>
                {u.ordinal}
              </button>
            ))}
            {loaded.estimated && (
              <button class="all" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Fewer' : 'All lessons'}
              </button>
            )}
          </div>
        )}

        {error && <div class="error">{error}</div>}

        {!ready ? (
          <div class="empty">Reading the booklet…</div>
        ) : shown.length > 0 ? (
          <>
            {shown.some(hasStressMarks) && (
              <p class="note" style={{ textAlign: 'right' }}>
                Stressed vowels are <span style={{ color: 'var(--stress)', fontWeight: 900, textDecoration: 'underline' }}>underlined</span>
              </p>
            )}
            {loaded.estimated && !showAll && (
              <p class="note">
                This recording holds several reading lessons, roughly {shown[0].ordinal}–{shown[shown.length - 1].ordinal} of the
                booklet. Tap “All lessons” if it drifts.
              </p>
            )}
            {shown.map((u) => (
              <UnitSection key={u.ordinal} unit={u} file={file!} showTranslation={showTranslation} showHeading={shown.length > 1 || !!u.heading} />
            ))}
          </>
        ) : (
          <div class="empty">
            <BookOpen size={40} />
            <p>
              {file
                ? "This reading isn't in the booklet. Listen along, or browse the whole booklet."
                : 'No booklet was found for this level. Add the booklet PDF to the Readings folder to read along.'}
            </p>
            {file && (
              <button class="btn" onClick={() => (booklet.value = { file, title: `Level ${level!.number} booklet` })}>
                Open booklet
              </button>
            )}
          </div>
        )}

        <div class="spacer" />
        <div class="reading-bar">
          <ScrubBar value={player.currentTime.value} duration={player.duration.value} onSeek={(s) => player.seek(s)} />
          <div class="row">
            <button class="icon-btn" onClick={() => player.previous()} aria-label="Previous reading">
              <SkipBack size={20} class="muted" />
            </button>
            <button class="icon-btn" onClick={() => player.skip(-skipInterval)} aria-label="Back 10 seconds" style={{ color: 'var(--primary)' }}>
              <Back10 size={28} strokeWidth={2} />
            </button>
            <button
              class="play-fab"
              style={{ width: '60px', height: '60px' }}
              onClick={() => player.togglePlayPause()}
              aria-label={player.isPlaying.value ? 'Pause' : 'Play'}
            >
              {player.isPlaying.value ? <Pause size={24} /> : <Play size={24} class="icon-play" />}
            </button>
            <button class="icon-btn" onClick={() => player.skip(skipInterval)} aria-label="Forward 10 seconds" style={{ color: 'var(--primary)' }}>
              <Forward10 size={28} strokeWidth={2} />
            </button>
            <button class="icon-btn" onClick={() => player.next()} disabled={!player.hasNext} aria-label="Next reading">
              <SkipForward size={20} class="muted" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UnitSection({
  unit,
  file,
  showTranslation,
  showHeading,
}: {
  unit: ReadingContent
  file: FileRef
  showTranslation: boolean
  showHeading: boolean
}) {
  const stress = hasStressMarks(unit)
  return (
    <section class="unit" id={`unit-${unit.ordinal}`}>
      {showHeading && <h2 class="unit-heading">{unit.heading ?? `Reading ${unit.ordinal}`}</h2>}
      {unit.blocks.map((b, i) => (
        <Block key={i} block={b} file={file} stress={stress} english={showTranslation ? unit.inlineTranslations : undefined} />
      ))}
      {showTranslation && !unit.inlineTranslations && unit.translation.length > 0 && (
        <>
          <h3 class="unit-heading" style={{ fontSize: '15px' }}>
            Translation
          </h3>
          {unit.translation.map((b, i) => (
            <Block key={`t${i}`} block={b} file={file} stress={false} />
          ))}
        </>
      )}
    </section>
  )
}

function Block({
  block,
  file,
  stress,
  english,
}: {
  block: ReadingBlock
  file: FileRef
  stress: boolean
  english?: Record<number, string>
}) {
  if (block.kind === 'page') return <PageImage file={file} index={block.index} />
  return (
    <>
      {block.items.map((item) => (
        <ItemCard key={item.number} item={item} stress={stress} english={english?.[item.number]} />
      ))}
    </>
  )
}

function ItemCard({ item, stress, english }: { item: ReadingItem; stress: boolean; english?: string }) {
  return (
    <div class="item">
      <span class="item-no">{item.number}.</span>
      <div>
        <div class="item-text" lang="">
          {runs(item).map((r, i) =>
            r.bold ? (
              stress ? (
                <span key={i} class="stress">
                  {r.text}
                </span>
              ) : (
                <strong key={i}>{r.text}</strong>
              )
            ) : (
              r.text
            ),
          )}
        </div>
        {english && <div class="item-translation">{english}</div>}
      </div>
    </div>
  )
}

/** A booklet page drawn when it scrolls into view. */
export function PageImage({ file, index, class: className = 'page-image' }: { file: FileRef; index: number; class?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    let drawn = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (drawn || !entries.some((e) => e.isIntersecting)) return
        drawn = true
        observer.disconnect()
        void renderPage(file, index, canvas, canvas.clientWidth || 360).catch(() => {})
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [fileKey(file), index])
  return <canvas ref={ref} class={className} style={{ aspectRatio: '0.72' }} aria-label={`Booklet page ${index + 1}`} />
}

// MARK: - Booklet

export function BookletViewer() {
  const route = booklet.value
  const [count, setCount] = useState<number>()
  const [error, setError] = useState<string>()
  const close = () => (booklet.value = undefined)
  useEscape(close)
  useEffect(() => {
    if (!route) return
    setCount(undefined)
    setError(undefined)
    pageCount(route.file).then(setCount, (e: Error) => setError(e.message))
  }, [route && fileKey(route.file)])
  useEffect(() => {
    if (count && route?.page !== undefined) {
      requestAnimationFrame(() => document.getElementById(`page-${route.page}`)?.scrollIntoView({ block: 'start' }))
    }
  }, [count])
  if (!route) return null
  return (
    <div class="sheet" role="dialog" aria-label={route.title} style={{ zIndex: 50 }}>
      <div class="sheet-body">
        <div class="topbar" style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2, margin: 'calc(-1 * (var(--safe-top) + 10px)) -20px 0', padding: 'calc(var(--safe-top) + 6px) 12px 6px', boxShadow: '0 1px 0 var(--line)' }}>
          <span style={{ width: '44px' }} />
          <div class="topbar-title">{route.title}</div>
          <button class="btn secondary" style={{ minHeight: '40px', padding: '0 16px' }} onClick={close}>
            Done
          </button>
        </div>
        {error && <div class="error">Couldn't open the PDF: {error}</div>}
        {!count && !error && <div class="empty">Opening…</div>}
        <div class="booklet-pages">
          {count &&
            Array.from({ length: count }, (_, i) => (
              <div key={i} id={`page-${i}`} style={{ scrollMarginTop: '60px' }}>
                <PageImage file={route.file} index={i} class="booklet-page" />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
